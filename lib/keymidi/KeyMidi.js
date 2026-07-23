/**
 * KeyMidi.js — Tastenbelegung + MIDI-Learn als Header-Overlay über ALLEN Controls.
 *
 * Die „große neue Baustelle" aus UMBAU_KONFLIKTE.md (K5, @dpa 20260718): NICHT mehr ein
 * eigener `keybind`-Control-Typ wie in taktgeber, sondern EIN Schalter im Haupt-Header.
 * Ist er an, wird alles etwas dunkler und über jedem tastatur-sinnvollen Control erscheint
 * seine aktuelle Tastenbelegung (+ ein 🎹 für MIDI-Learn), an Ort und Stelle änderbar.
 *
 * Die MECHANIK ist 1:1 aus taktgebers ui.js/midi.js übernommen (dort lange erarbeitet,
 * @dpa: „soll unbedingt übernommen werden"):
 *   • Tastenbelegen: Klick auf das Feld → horcht auf den nächsten echten Tastendruck
 *     (reine Modifikatoren durchlassen, Shift+1 = „!" belegen). ESC bricht ab,
 *     Backspace/Entf löscht. Genau `e.key` speichern (Groß ≠ klein als Belegung).
 *   • Doppelbelegungs-Warnung: rotes „!" nennt im Tooltip die anderen Controls.
 *   • MIDI: generischer Verteiler (lib/keymidi/Midi.js), Ch beim Lernen mitgeschrieben,
 *     danach als 0–16-Wert nachziehbar; fehlt Web-MIDI, bleibt das Feld sichtbar und
 *     erklärt es nur (statt zu verschwinden).
 *
 * NEU gegenüber taktgeber ist allein die VERORTUNG: statt einer Control-Zeile hängt die
 * Belegung als Badge am Control selbst und erscheint nur im Overlay-Modus.
 *
 * ── Naht ────────────────────────────────────────────────────────────────────────────
 * new KeyMidi(state, { panel, midi, keyOk }):
 *   state — get/set/subscribe; nutzt die Keys `keyBindings` (id→KeyboardEvent.key) und
 *           `midiBindings` (id→{type,data1,ch}, teilt sich die Midi-Klasse).
 *   panel — der Wurzel-Container, an dem der Overlay-Modus (`.keyedit`) hängt.
 *   midi  — optionale Midi-Instanz (lib/keymidi/Midi.js). Ohne sie bleibt nur die Taste.
 *   keyOk(el) — darf ein globaler Tastendruck greifen (nicht, während man Text tippt)?
 *
 * register(id, el, label, activate) — ein Control anmelden. `activate(midiEvent?)` löst es
 *   aus: ohne Argument = „so als hätte man die Taste gedrückt", mit MIDI-Event = aus der
 *   eingehenden Nachricht (Regler folgen dem 0..1-Wert, Auslöser feuern auf der Flanke).
 *
 * setEdit(on) · isEdit() · dispatchKey(e) — an-/ausschalten, Zustand, Tasten-Verteilung.
 */
import { midiName } from './Midi.js';

// Reine Modifikatoren: beim Lernen durchlassen, nicht als Belegung nehmen — der nächste
// echte Tastendruck (bei Shift+1 also „!") ist die Belegung (@dpa 20260717, aus taktgeber).
const MOD_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'AltGraph', 'CapsLock']);
// Diese Tasten dürfen NIE gelernt werden (@dpa 20260720, Punkt D): sie steuern die Bedienung
// selbst — ESC verlässt Ebenen, Enter übernimmt, Tab ist Tap/Navigation. Beim Horchen brechen
// sie die Vergabe ab, statt sich als Belegung einzutragen.
const NO_LEARN = new Set(['Escape', 'Enter', 'Tab']);

/** Die Taste so zeigen, wie gespeichert (klein/roh), 'space' → „Leertaste", leer bleibt leer. */
export const keyLabel = (k) => !k ? '' : k === 'space' ? 'Leertaste' : k;

/** Den rohen KeyboardEvent zu unserem Belegungs-String machen (Space gesondert). */
const evKey = (e) => e.code === 'Space' ? 'space' : e.key;

export class KeyMidi {
    constructor(state, opts = {}) {
        this.state = state;
        this.panel = opts.panel || document.body;
        this.midi = opts.midi || null;
        this.keyOk = opts.keyOk || (() => true);
        this._keyEdit = false; this._midiEdit = false;   // zwei getrennte Overlay-Modi
        this._targets = new Map();   // id → { el, label, activate, badge? }
        this._banner = null;         // schwebender MIDI-Editor (ein einziger)
        this._bannerId = null;
        this._selectedEl = null;     // Radio-Selektion im Overlay (Punkt D)
        this._listenCancel = null;   // bricht ein laufendes Tasten-Horchen ab (Reselect/Exit)
        this._guardOn = false;
        // Overlay-Wächter (Punkt D): im Lern-Modus bedient die Maus die Controls NICHT mehr,
        // sie SELEKTIERT nur (radio). Läuft in der Capture-Phase VOR den Control-Handlern und
        // stoppt deren Funktion; die Belegungs-UI (Badge/Self/Banner) bleibt ausgenommen.
        this._editGuard = (e) => {
            if (e.target.closest && e.target.closest('.km-badge, .km-self, .km-banner')) return;
            const ctrlEl = e.target.closest && e.target.closest('[data-ctrl]');
            if (!ctrlEl) return;
            e.preventDefault(); e.stopPropagation();
            if (e.type === 'mousedown') this._selectCtrl(ctrlEl);
        };

        if (this.midi) {
            // Eingehende, GELERNTE Nachricht → das Ziel auslösen. Auslöser (kein cc) nur auf
            // der Flanke off→on, damit ein gehaltener Ton nicht dauerfeuert.
            this.midi.onApply((id, e) => {
                const t = this._targets.get(id); if (!t) return;
                const trigger = e.type === 'note' || !t.continuous;
                if (trigger) { if (this.midi.rising(id, e.on)) { if (e.on) t.activate(e); } }
                else t.activate(e);
            });
            this.midi.onLearn((id, st) => this._onLearn(id, st));
        }

        // Belegungs-/MIDI-Änderungen von außen (Reset/Recall) → Badges auffrischen.
        state.subscribe((key) => {
            if (!this.isEdit()) return;
            if (key === 'keyBindings' || key === 'midiBindings') this._targets.forEach((t) => this._paintBadge(t));
        });
    }

    /** @param {(e?:object)=>void} activate  löst das Control aus (leer=Taste, MIDI-Event=MIDI)
     *  @param {object} [meta] { continuous?:boolean, self?:boolean, midiOnly?:boolean } – Regler
     *  folgen dem Wert statt zu feuern; self = Haupt-Button (@dpa 20260719_120425): bekommt KEIN
     *  Badge über sich, sondern ein Learning-Panel DARUNTER (mit [↵]-Übernehmen bei der Taste).
     *  midiOnly (@dpa 20260722_172315: „Controls die mehr als ein On/Off haben bitte aus Tasten
     *  learn ausschließen") — Controls mit vielen möglichen Werten/Noten (z.B. die Spiel-
     *  Tastatur) haben KEIN sinnvolles einzelnes Tasten-Äquivalent; nur der 🎹-Teil des Badges
     *  bleibt aktiv, das ⌨-Feld erscheint gar nicht erst.
     *  customBanner (@dpa 20260722_194404: „Midi-Offset/Bereich … sollen in (den speziellen)
     *  Midilearn fenster") – `() => HTMLElement`. Ersetzt den generischen Lern-Banner (Note-
     *  Name/„neu"/„löschen" ergibt für dieses Ziel keinen Sinn) durch beliebigen eigenen
     *  Inhalt; das Notenhorchen (midi.startLearn) läuft trotzdem normal weiter. */
    register(id, el, label, activate, meta = {}) {
        this._targets.set(id, { id, el, label, activate, continuous: !!meta.continuous, self: !!meta.self, midiOnly: !!meta.midiOnly, customBanner: meta.customBanner || null, badge: null, selfPanel: null });
    }

    /** Ein registriertes Control fernauslösen (Punkt 3b, ddw.md 20260724: Sequenzer als Ziel
     *  für „alle Buttons, Knobs, Speicher-Abrufe, Keyboards" — @dpa: „die Optik der Buttons
     *  auch"). Ruft EXAKT dieselbe `activate`-Closure wie Taste/MIDI/Klick — Flash/ON-Toggle/
     *  Slot-Gate etc. laufen dadurch automatisch synchron mit, ohne Sonderpfad. */
    remoteActivate(id, e) {
        const t = this._targets.get(id);
        if (t && t.activate) t.activate(e);
    }

    /** Ein Control wieder abmelden (@dpa 20260722_033950: dynamische Raster wie der
     *  Akkord-Speicher können schrumpfen) — nimmt ihm nur die LIVE-Registrierung, eine
     *  gelernte Tasten-/MIDI-Bindung im State bleibt erhalten (taucht der Slot-Index später
     *  wieder auf, lebt seine alte Belegung sofort wieder auf). Ohne dieses Abmelden blieben
     *  Geister-Ziele mit einem losgelösten DOM-Element hängen, wenn ein Raster verkleinert wird. */
    unregister(id) {
        const t = this._targets.get(id);
        if (!t) return;
        if (t.badge) t.badge.remove();
        if (t.selfPanel) t.selfPanel.remove();
        if (this._selectedEl === t.el) this._clearSelect();
        if (this._bannerId === id) this._closeBanner();
        this._targets.delete(id);
    }

    isEdit() { return this._keyEdit || this._midiEdit; }

    // Zwei getrennte Modi (@dpa 20260719_040136: „zwei buttons, bei einzeln … übersichtlicher"):
    // Tasten-Overlay und MIDI-Overlay unabhängig an/aus. Das Badge zeigt nur den jeweils
    // aktiven Teil (Taste bzw. 🎹).
    setKeyEdit(on) { this._keyEdit = !!on; this._refreshEdit(); }
    setMidiEdit(on) { this._midiEdit = !!on; this._refreshEdit(); }
    isKeyEdit() { return this._keyEdit; }
    isMidiEdit() { return this._midiEdit; }
    _refreshEdit() {
        const any = this.isEdit();
        this.panel.classList.toggle('keyedit', any);
        if (any) {
            this._targets.forEach((t) => this._showBadge(t));
            if (!this._guardOn) {
                this.panel.addEventListener('mousedown', this._editGuard, true);
                this.panel.addEventListener('click', this._editGuard, true);
                this._guardOn = true;
            }
        } else {
            this._targets.forEach((t) => this._hideBadge(t)); this._closeBanner();
            if (this._guardOn) {
                this.panel.removeEventListener('mousedown', this._editGuard, true);
                this.panel.removeEventListener('click', this._editGuard, true);
                this._guardOn = false;
            }
            this._clearSelect();
        }
        // Self-Panels (Haupt-Buttons) folgen dem jeweils passenden Modus.
        this._targets.forEach((t) => { if (t.self) this._syncSelfPanel(t); });
    }

    /* ── Radio-Selektion im Overlay (Punkt D): genau EIN Control, und die Selektion
       AKTIVIERT direkt den Lernteil (@dpa 20260720). ────────────────────────────────── */
    _selectCtrl(el) {
        if (this._selectedEl === el) return;
        this._clearSelect();
        this._selectedEl = el;
        el.classList.add('km-selected');
        const t = el.dataset && this._targets.get(el.dataset.ctrl);
        if (!t || t.self) return;
        // Selektieren = Lernen starten: im Tasten-Modus horcht das Tastenfeld (pulsiert 1 Hz),
        // im MIDI-Modus öffnet der Lern-Banner. midiOnly-Ziele lernen NIE per Taste (s. register).
        if (this._keyEdit && !t.midiOnly && t.badge) { const ke = t.badge.querySelector('.km-key'); if (ke) this._listenKey(t, ke); }
        else if (this._midiEdit) this._openMidi(t);
    }
    _clearSelect() {
        if (this._listenCancel) this._listenCancel();
        if (this._selectedEl) {
            this._selectedEl.classList.remove('km-selected');
            const t = this._selectedEl.dataset && this._targets.get(this._selectedEl.dataset.ctrl);
            if (t && !t.self) this._paintBadge(t);   // sauber neu malen → kein „hängendes" Feld (image-20)
        }
        this._selectedEl = null;
    }

    /* ── Selbst-Zuweisung der Haupt-Buttons (@dpa 20260719_120425) ────────────────────
       Der Button selbst bleibt frei; das „Learning" erscheint DARUNTER: ein Tastenfeld,
       dessen gedrückte Taste erst PENDING steht und mit [↵] übernommen wird (Henne-Ei:
       nichts wird versehentlich beim Horchen ausgelöst). Im MIDI-Modus stattdessen ein
       Lern-Knopf über die normale Banner-Mechanik. */
    _syncSelfPanel(t) {
        const wantKey = this._keyEdit, wantMidi = this._midiEdit;
        if (!wantKey && !wantMidi) { if (t.selfPanel) { t.selfPanel.remove(); t.selfPanel = null; } return; }
        if (t.selfPanel) t.selfPanel.remove();
        const p = document.createElement('div'); p.className = 'km-self';
        this._pendingKey = this._pendingKey || {};
        if (wantKey) {
            const cur = this.keyBindings()[t.id];
            const field = document.createElement('button'); field.type = 'button'; field.className = 'km-key';
            field.textContent = keyLabel(this._pendingKey[t.id] ?? cur) || '';   // leer statt ⌨-Icon (Punkt D)
            field.classList.toggle('km-empty', !(this._pendingKey[t.id] ?? cur));
            field.title = 'Klick, dann Taste drücken — übernommen wird erst mit ↵ · Entf löscht · ESC bricht ab';
            field.addEventListener('click', (e) => {
                e.stopPropagation();
                if (field.classList.contains('km-listen')) return;
                field.classList.add('km-listen'); field.textContent = '…';
                const done = () => { field.classList.remove('km-listen'); window.removeEventListener('keydown', grab, true); };
                const grab = (ev) => {
                    ev.preventDefault(); ev.stopPropagation();
                    // ESC/Enter/Tab nicht lernen → Vergabe abbrechen, alter Zustand bleibt.
                    if (NO_LEARN.has(ev.key)) { field.textContent = keyLabel(this._pendingKey[t.id] ?? cur) || ''; field.classList.toggle('km-empty', !(this._pendingKey[t.id] ?? cur)); return done(); }
                    if (ev.key === 'Backspace' || ev.key === 'Delete') { this._pendingKey[t.id] = ''; field.textContent = ''; field.classList.add('km-empty'); return done(); }
                    if (MOD_KEYS.has(ev.key)) return;
                    this._pendingKey[t.id] = evKey(ev);
                    field.textContent = keyLabel(this._pendingKey[t.id]); field.classList.remove('km-empty');
                    done();
                };
                window.addEventListener('keydown', grab, true);
            });
            const ok = document.createElement('button'); ok.type = 'button'; ok.className = 'km-b-btn';
            ok.textContent = '↵'; ok.title = 'Diese Taste für „' + t.label + '" übernehmen';
            ok.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this._pendingKey[t.id] === undefined) return;
                this._setKey(t.id, this._pendingKey[t.id]);
                delete this._pendingKey[t.id];
                this._targets.forEach((o) => this._paintBadge(o));
                this._syncSelfPanel(t);
            });
            p.append(field, ok);
        }
        if (wantMidi) {
            const bound = this.midi && this.midi.binding(t.id);
            const mid = document.createElement('button'); mid.type = 'button'; mid.className = 'km-mid' + (bound ? ' km-on' : '');
            mid.textContent = '🎹';
            mid.title = bound ? 'MIDI: ' + midiName(bound) + ' — Klick zum Ändern' : 'MIDI-Learn für „' + t.label + '"';
            mid.addEventListener('click', (e) => { e.stopPropagation(); this._openMidi(t); });
            p.append(mid);
        }
        p.addEventListener('mousedown', (e) => e.stopPropagation());
        document.body.appendChild(p);
        const r = t.el.getBoundingClientRect();
        p.style.left = Math.max(8, Math.min(r.left, window.innerWidth - p.offsetWidth - 8)) + 'px';
        p.style.top = (r.bottom + 4) + 'px';
        t.selfPanel = p;
    }

    /* ── Tasten-Verteilung (nur außerhalb des Overlay-Modus) ─────────────────────── */
    keyBindings() { return this.state.get('keyBindings') || {}; }
    /** Andere Ziele mit derselben (nicht-leeren) Belegung wie `id`. */
    _collisions(id) {
        const map = this.keyBindings(); const k = map[id];
        if (!k) return [];
        return [...this._targets.values()].filter((t) => t.id !== id && map[t.id] === k);
    }
    /** MIDI-Pendant zur Tasten-Doppelbelegungs-Warnung (@dpa 20260722_172315: „Grundsätzlich
     *  sollten alle Midi remotes nur einmal vergeben und genutzt werden, dazu gibt's ja das
     *  Ausrufezeichen (wie bei Tasten funktioniert)" — gab es für MIDI noch gar nicht). Zwei
     *  Bindungen kollidieren bei gleichem Typ+Note/CC, wenn KEINE von beiden einen bestimmten
     *  Kanal verlangt oder beide denselben Kanal haben (ch=0 = „alle Kanäle", s. Midi.js). */
    _midiCollisions(id) {
        if (!this.midi) return [];
        const b = this.midi.binding(id); if (!b) return [];
        return [...this._targets.values()].filter((t) => {
            if (t.id === id) return false;
            const o = this.midi.binding(t.id); if (!o) return false;
            if (o.type !== b.type || o.data1 !== b.data1) return false;
            return b.ch === 0 || o.ch === 0 || b.ch === o.ch;
        });
    }

    /** Einen echten Tastendruck an das passende Control geben. Rückgabe: ob verteilt.
     *  Im Overlay-Modus wird belegt statt ausgelöst — AUSSER bei den self-Targets
     *  (Haupt-Buttons): deren Taste muss den Modus auch wieder AUSschalten können. */
    dispatchKey(e) {
        if (!this.keyOk(e.target)) return false;       // während echter Texteingabe: Finger weg
        if (e.metaKey || e.ctrlKey || e.altKey) return false;
        const k = evKey(e);
        const map = this.keyBindings();
        const edit = this.isEdit();
        let hit = false;
        for (const t of this._targets.values()) {
            if (edit && !t.self) continue;
            if (t.midiOnly) continue;   // s. register(): kein Tasten-Äquivalent für diese Ziele
            if (map[t.id] && map[t.id] === k) { t.activate(); hit = true; }
        }
        if (hit) { e.preventDefault(); }
        return hit;
    }

    /* ── Badge pro Control (nur im Overlay-Modus sichtbar) ───────────────────────── */
    _showBadge(t) {
        if (t.self) return;   // Haupt-Buttons: Learning-Panel darunter statt Badge (s. _syncSelfPanel)
        if (!t.badge) {
            const b = document.createElement('div'); b.className = 'km-badge';
            // Tastenfeld: Klick horcht auf den nächsten Tastendruck (taktgeber-Mechanik).
            const key = document.createElement('button'); key.type = 'button'; key.className = 'km-key';
            key.title = 'Klick: Taste drücken zum Belegen · Entf löscht · ESC bricht ab';
            key.addEventListener('click', (e) => { e.stopPropagation(); this._listenKey(t, key); });
            // Doppelbelegungs-Warnung.
            const warn = document.createElement('span'); warn.className = 'km-warn'; warn.textContent = '!';
            // MIDI-Feld (nur wenn Midi vorhanden — sonst erklärt der Klick, dass es fehlt).
            const mid = document.createElement('button'); mid.type = 'button'; mid.className = 'km-mid';
            mid.textContent = '🎹'; mid.title = 'MIDI-Learn';
            mid.addEventListener('click', (e) => { e.stopPropagation(); this._openMidi(t); });
            b.append(key, warn, mid);
            t.el.appendChild(b); t.badge = b;
            // Das Badge selbst darf keine Control-Bedienung/Drag auslösen.
            b.addEventListener('mousedown', (e) => e.stopPropagation());
            b.addEventListener('contextmenu', (e) => e.stopPropagation());
        }
        t.badge.style.display = '';
        this._paintBadge(t);
    }
    _hideBadge(t) { if (t.badge) t.badge.style.display = 'none'; }

    _paintBadge(t) {
        if (t.self) { this._syncSelfPanel(t); return; }
        if (!t.badge) return;
        const map = this.keyBindings();
        // Tastenteil nur im Tasten-Modus zeigen, 🎹 nur im MIDI-Modus (@dpa 20260719_040136).
        const keyEl = t.badge.querySelector('.km-key');
        const lbl = keyLabel(map[t.id]);
        keyEl.textContent = lbl || '';   // leer statt ⌨-Icon bei unbelegt (Punkt D)
        keyEl.classList.toggle('km-empty', !lbl);
        keyEl.style.display = (this._keyEdit && !t.midiOnly) ? '' : 'none';
        // Doppelbelegung — Tasten-Modus prüft keyBindings, MIDI-Modus prüft midiBindings
        // (@dpa 20260722_172315: dieselbe „!"-Warnung sollte es für MIDI genauso geben).
        const col = this._keyEdit ? this._collisions(t.id) : this._midiEdit ? this._midiCollisions(t.id) : [];
        const warn = t.badge.querySelector('.km-warn');
        warn.style.display = col.length ? '' : 'none';
        warn.title = col.length ? 'Dieselbe ' + (this._keyEdit ? 'Taste' : 'Note/CC') + ' auch bei: ' + col.map((o) => o.label).join(', ') : '';
        // MIDI-Zustand
        const mid = t.badge.querySelector('.km-mid');
        const bound = this.midi && this.midi.binding(t.id);
        mid.classList.toggle('km-on', !!bound);
        mid.title = bound ? 'MIDI: ' + midiName(bound) + ' — Klick zum Ändern' : 'MIDI-Learn';
        mid.style.display = this._midiEdit ? '' : 'none';
    }

    _listenKey(t, keyEl) {
        if (keyEl.classList.contains('km-listen')) return;
        // GENAU EIN aktives Lernfeld (@dpa 20260720: „immer nur ein aktives learn feld"): ein
        // neues Horchen beendet zuerst jedes andere — egal ob es über Selektion oder direkten
        // Badge-Klick gestartet wurde. Sonst bleiben mehrere gelb pulsierende Felder offen.
        if (this._listenCancel) this._listenCancel();
        // Kein Reset, kein „…": der alte Wert BLEIBT sichtbar, das Feld pulsiert nur 1 Hz
        // (@dpa 20260720). Erst eine neue Taste ersetzt ihn.
        keyEl.classList.add('km-listen');
        this._paintBadge(t);
        const cleanup = () => { keyEl.classList.remove('km-listen'); window.removeEventListener('keydown', grab, true); this._listenCancel = null; };
        const done = () => { cleanup(); this._paintBadge(t); };
        const grab = (e) => {
            e.preventDefault(); e.stopPropagation();
            if (NO_LEARN.has(e.key)) return done();       // ESC/Enter/Tab nicht lernen → Abbruch (Wert bleibt)
            // Delete/Backspace: Letter löschen UND direkt weiter bereit (nicht beenden).
            if (e.key === 'Backspace' || e.key === 'Delete') { this._setKey(t.id, ''); this._paintBadge(t); return; }
            if (MOD_KEYS.has(e.key)) return;              // Modifikator durchlassen
            this._setKey(t.id, evKey(e));
            done();
            // Alle Badges neu malen — eine neue Belegung kann anderswo eine Kollision auslösen.
            this._targets.forEach((o) => this._paintBadge(o));
        };
        this._listenCancel = cleanup;
        window.addEventListener('keydown', grab, true);
    }
    _setKey(id, k) {
        const map = { ...this.keyBindings() };
        if (k) map[id] = k; else delete map[id];
        this.state.set('keyBindings', map);
    }

    /* ── MIDI-Learn (ein schwebender Banner, wie taktgeber) ──────────────────────── */
    _openMidi(t) {
        this._closeBanner();
        this._setLearning(t.el);   // aktiven Control auffällig markieren (@dpa 20260719)
        if (!this.midi) { this._banner = this._makeBanner('Web-MIDI in diesem Browser nicht verfügbar.', t.label, t.el); return; }
        this._bannerId = t.id;
        if (t.customBanner) { this._showCustomBanner(t); this.midi.startLearn(t.id); return; }
        if (this.midi.binding(t.id)) this._paintBanner(t); else this._startListen(t);
    }
    /** Eigener Banner-Inhalt statt Note-Name+„neu"/„löschen" (s. register()-Kopf). Das
     *  Notenhorchen bleibt über midi.startLearn() aktiv — der Aufrufer (z.B. werkbank.js)
     *  hört selbst auf midiBindings, um zu kalibrieren; hier geht es nur um die Anzeige. */
    _showCustomBanner(t) {
        const el = document.createElement('div'); el.className = 'km-banner';
        const ico = document.createElement('span'); ico.className = 'km-b-ico'; ico.textContent = '🎹';
        const txt = document.createElement('span'); txt.className = 'km-b-txt';
        txt.append(Object.assign(document.createElement('b'), { textContent: t.label }), ': eine Note kalibriert');
        const x = document.createElement('button'); x.className = 'km-b-x'; x.textContent = '✕';
        x.addEventListener('click', () => this._closeBanner());
        el.append(ico, txt, t.customBanner(), x);
        document.body.appendChild(el);
        this._placeNear(el, t.el);
        this._banner = el;
    }
    /** Den Lern-Banner am Control platzieren (wie ein Settings-Fenster), nicht unten mittig. */
    _placeNear(el, targetEl) {
        if (!targetEl) return;
        el.style.transform = 'none'; el.style.bottom = 'auto';
        const r = targetEl.getBoundingClientRect();
        el.style.left = Math.max(8, Math.min(r.left, window.innerWidth - el.offsetWidth - 8)) + 'px';
        el.style.top = Math.min(r.bottom + 6, window.innerHeight - el.offsetHeight - 8) + 'px';
    }
    _setLearning(el) {
        if (this._learningEl && this._learningEl !== el) this._learningEl.classList.remove('km-learning');
        this._learningEl = el || null;
        if (el) el.classList.add('km-learning');
    }
    _makeBanner(text, label, targetEl) {
        const el = document.createElement('div'); el.className = 'km-banner';
        const ico = document.createElement('span'); ico.className = 'km-b-ico'; ico.textContent = '🎹';
        const txt = document.createElement('span'); txt.className = 'km-b-txt';
        if (label) txt.append(Object.assign(document.createElement('b'), { textContent: label }), ': ');
        txt.append(text);
        const x = document.createElement('button'); x.className = 'km-b-x'; x.textContent = '✕';
        x.addEventListener('click', () => this._closeBanner());
        el.append(ico, txt, x);
        document.body.appendChild(el);
        this._placeNear(el, targetEl);
        return el;
    }
    _startListen(t) {
        this.midi.startLearn(t.id);
        this._closeBannerEl();
        this._banner = this._makeBanner('jetzt eine Note spielen oder einen Regler bewegen · ESC bricht ab', t.label, t.el);
    }
    _paintBanner(t) {
        this._closeBannerEl();
        const b = this.midi.binding(t.id);
        const el = document.createElement('div'); el.className = 'km-banner';
        const ico = document.createElement('span'); ico.className = 'km-b-ico'; ico.textContent = '🎹';
        const txt = document.createElement('span'); txt.className = 'km-b-txt';
        txt.append(Object.assign(document.createElement('b'), { textContent: t.label }), ': ' + midiName(b));
        const relearn = document.createElement('button'); relearn.className = 'km-b-btn'; relearn.textContent = 'neu';
        relearn.title = 'Andere Note/Regler lernen'; relearn.addEventListener('click', () => this._startListen(t));
        const del = document.createElement('button'); del.className = 'km-b-btn'; del.textContent = '× löschen';
        del.addEventListener('click', () => { this.midi.clear(t.id); this._closeBanner(); this._paintBadge(t); });
        const x = document.createElement('button'); x.className = 'km-b-x'; x.textContent = '✕';
        x.addEventListener('click', () => this._closeBanner());
        el.append(ico, txt, relearn, del, x);
        document.body.appendChild(el);
        this._placeNear(el, t.el);
        this._banner = el;
    }
    _onLearn(id, st) {
        if (this._bannerId !== id) return;
        const t = this._targets.get(id); if (!t) return;
        if (t.customBanner) { this._paintBadge(t); return; }   // eigener Banner bleibt unangetastet
        if (st && typeof st === 'object') { this._paintBanner(t); this._paintBadge(t); }   // gebunden
    }
    _closeBannerEl() { if (this._banner) { this._banner.remove(); this._banner = null; } }
    _closeBanner() {
        this._closeBannerEl();
        if (this.midi && this._bannerId) this.midi.cancelLearn();
        this._bannerId = null;
        this._setLearning(null);   // Hervorhebung des aktiven Controls zurücknehmen
    }
}
