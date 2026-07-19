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
     *  @param {object} [meta] { continuous?:boolean, self?:boolean } – Regler folgen dem Wert
     *  statt zu feuern; self = Haupt-Button (@dpa 20260719_120425): bekommt KEIN Badge über
     *  sich, sondern ein Learning-Panel DARUNTER (mit [↵]-Übernehmen bei der Taste). */
    register(id, el, label, activate, meta = {}) {
        this._targets.set(id, { id, el, label, activate, continuous: !!meta.continuous, self: !!meta.self, badge: null, selfPanel: null });
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
        if (any) this._targets.forEach((t) => this._showBadge(t));
        else { this._targets.forEach((t) => this._hideBadge(t)); this._closeBanner(); }
        // Self-Panels (Haupt-Buttons) folgen dem jeweils passenden Modus.
        this._targets.forEach((t) => { if (t.self) this._syncSelfPanel(t); });
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
            field.textContent = keyLabel(this._pendingKey[t.id] ?? cur) || '⌨';
            field.classList.toggle('km-empty', !(this._pendingKey[t.id] ?? cur));
            field.title = 'Klick, dann Taste drücken — übernommen wird erst mit ↵ · Entf löscht · ESC bricht ab';
            field.addEventListener('click', (e) => {
                e.stopPropagation();
                if (field.classList.contains('km-listen')) return;
                field.classList.add('km-listen'); field.textContent = '…';
                const done = () => { field.classList.remove('km-listen'); window.removeEventListener('keydown', grab, true); };
                const grab = (ev) => {
                    ev.preventDefault(); ev.stopPropagation();
                    if (ev.key === 'Escape') { field.textContent = keyLabel(this._pendingKey[t.id] ?? cur) || '⌨'; return done(); }
                    if (ev.key === 'Backspace' || ev.key === 'Delete') { this._pendingKey[t.id] = ''; field.textContent = '⌨'; field.classList.add('km-empty'); return done(); }
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
        keyEl.textContent = lbl || '⌨';
        keyEl.classList.toggle('km-empty', !lbl);
        keyEl.style.display = this._keyEdit ? '' : 'none';
        // Doppelbelegung (nur relevant im Tasten-Modus)
        const col = this._collisions(t.id);
        const warn = t.badge.querySelector('.km-warn');
        warn.style.display = (this._keyEdit && col.length) ? '' : 'none';
        warn.title = col.length ? 'Dieselbe Taste auch bei: ' + col.map((o) => o.label).join(', ') : '';
        // MIDI-Zustand
        const mid = t.badge.querySelector('.km-mid');
        const bound = this.midi && this.midi.binding(t.id);
        mid.classList.toggle('km-on', !!bound);
        mid.title = bound ? 'MIDI: ' + midiName(bound) + ' — Klick zum Ändern' : 'MIDI-Learn';
        mid.style.display = this._midiEdit ? '' : 'none';
    }

    _listenKey(t, keyEl) {
        if (keyEl.classList.contains('km-listen')) return;
        keyEl.classList.add('km-listen'); keyEl.textContent = '…';
        const done = () => { keyEl.classList.remove('km-listen'); this._paintBadge(t); window.removeEventListener('keydown', grab, true); };
        const grab = (e) => {
            e.preventDefault(); e.stopPropagation();
            if (e.key === 'Escape') return done();
            if (e.key === 'Backspace' || e.key === 'Delete') { this._setKey(t.id, ''); return done(); }
            if (MOD_KEYS.has(e.key)) return;              // Modifikator durchlassen
            this._setKey(t.id, evKey(e));
            done();
            // Alle Badges neu malen — eine neue Belegung kann anderswo eine Kollision auslösen.
            this._targets.forEach((o) => this._paintBadge(o));
        };
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
        if (!this.midi) { this._banner = this._makeBanner('Web-MIDI in diesem Browser nicht verfügbar.', t.label); return; }
        this._bannerId = t.id;
        if (this.midi.binding(t.id)) this._paintBanner(t); else this._startListen(t);
    }
    _makeBanner(text, label) {
        const el = document.createElement('div'); el.className = 'km-banner';
        const ico = document.createElement('span'); ico.className = 'km-b-ico'; ico.textContent = '🎹';
        const txt = document.createElement('span'); txt.className = 'km-b-txt';
        if (label) txt.append(Object.assign(document.createElement('b'), { textContent: label }), ': ');
        txt.append(text);
        const x = document.createElement('button'); x.className = 'km-b-x'; x.textContent = '✕';
        x.addEventListener('click', () => this._closeBanner());
        el.append(ico, txt, x);
        document.body.appendChild(el);
        return el;
    }
    _startListen(t) {
        this.midi.startLearn(t.id);
        this._closeBannerEl();
        this._banner = this._makeBanner('jetzt eine Note spielen oder einen Regler bewegen · ESC bricht ab', t.label);
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
        this._banner = el;
    }
    _onLearn(id, st) {
        if (this._bannerId !== id) return;
        const t = this._targets.get(id); if (!t) return;
        if (st && typeof st === 'object') { this._paintBanner(t); this._paintBadge(t); }   // gebunden
    }
    _closeBannerEl() { if (this._banner) { this._banner.remove(); this._banner = null; } }
    _closeBanner() {
        this._closeBannerEl();
        if (this.midi && this._bannerId) this.midi.cancelLearn();
        this._bannerId = null;
    }
}
