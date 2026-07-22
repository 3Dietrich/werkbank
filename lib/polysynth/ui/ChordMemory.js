/**
 * ChordMemory.js — der Akkord-Speicher des Poly-Synth als EIGENER, autarker Control
 * (@dpa 20260722_004312: „er soll autark neben keyboard als eigenen Control `speicher`
 * werden"). Vorher war das Raster im PlayKeyboard eingebettet — jetzt ein selbstständiges
 * `u:speicher`-Control mit eigenen Rechtsklick-Settings, das nur über die schmale Naht des
 * Keyboards (snapshotChord/gateChordOn/releaseChordGate/onChordChange) an den gespielten
 * Akkord kommt.
 *
 * Slot-Raster (memCols×memRows, NUR über die Settings einstellbar — keine Panel-Knobs mehr):
 *  • Klick auf einen LEEREN Slot  → snapshotChord() hinein (Slot wird „belegt", färbt sich VG2).
 *  • Ein BELEGTER Slot ist selbst ein Gate (@dpa 20260722_013727: „AkIO brauchen wir nicht —
 *    die Gate-Funktion gehört auf die Speicher-Buttons"): Maus RUNTER → gateChordOn() (Akkord
 *    übernimmt+klingt sofort), Maus LOS → releaseChordGate() (Release-Ausklang, wie eine normale
 *    Taste). Bei `kbHold` AN bleibt der Akkord nach dem Loslassen an; ERNEUTES Runterdrücken
 *    DESSELBEN Slots schaltet ihn dann aus (toggleOffChordGate, „Umschalten wie gehabt"). Der
 *    Slot wird zum „aktiven Slot" (VG3), bis er losgelassen/ausgeschaltet oder am Keyboard neu
 *    gespielt wird.
 *  • [R] durchschaltbar (@dpa 20260722, ddw.md: Doppelklick kollidierte mit musikalisch
 *    schnell wiederholten Klicks — RAUS, stattdessen ein Zyklus 'off' → 'rename' → 'reset' →
 *    'off'): im Modus 'rename' benennt ein Klick auf einen Slot ihn um (Prompt, eigenes
 *    Kürzel — leer = zurück zur Nummer); im Modus 'reset' LÖSCHT ein Klick einen belegten
 *    Slot sofort (kein Gate, sofort bei Mousedown). 'off' = normales Speicher-Verhalten
 *    (Gate/Merken) wie oben beschrieben.
 *
 * Farben (Settings): BG = Rasterfläche, VG1 = leerer Slot, VG2 = belegter Slot, VG3 = aktiver
 * (zuletzt abgerufener) Slot. Slot-Größe = Kantenlänge eines quadratischen Slots.
 *
 * Persistenz: die gemerkten Akkorde (`akMemory`) und Kürzel (`akMemLabels`) liegen im
 * polySynthState und reisen in der Snapshot-/Config-Kette mit; Raster-Maße/Farben/Größe
 * liegen als Control-Style (ctrlStyles['u:speicher']) — beides ohne eigene Persistenz.
 *
 * Fernauslöser (@dpa 20260722_033950: „jeder Speicherplatz soll remote learnen können"): jeder
 * Slot meldet sich EINZELN bei KeyMidi an (`u:speicher:<i>`, eigenes `data-ctrl` am Slot-Button
 * — Tasten-/MIDI-Overlay selektiert dann genau diesen Slot, nicht das ganze Raster). Da KeyMidi
 * Notennachrichten grundsätzlich als Auslöser behandelt (nur die steigende Flanke kommt durch,
 * s. Midi.js), simuliert der Fernauslöser dieselbe kurze Halte-Geste wie die gate-Buttons in
 * GroupHost.js: Gate an, ~120 ms später automatisch los — echte Notendauer-Verfolgung ist damit
 * bewusst NICHT drin, konsistent mit dem Rest der Werkbank. Weil das Raster in den Settings
 * schrumpfen kann, meldet `_build()` VOR jedem Neuaufbau alle bisherigen Slot-Ids wieder ab
 * (KeyMidi.unregister) — sonst blieben Geister-Slots mit gelöstem DOM-Element im Overlay hängen.
 */
import { midiToName } from '../pitch/Scaler.js';
import { hint } from '../../i18n.js';

const DEF = { memCols: 3, memRows: 3, slotSize: 22, bg: '', vg1: '', vg2: '', vg3: '' };

export class ChordMemory {
    /**
     * @param {import('../../MiniState.js').MiniState} state
     * @param {import('./PlayKeyboard.js').PlayKeyboard} keyboard
     * @param {import('../../keymidi/KeyMidi.js').KeyMidi} [keyMidi] optional — ohne sie bleiben
     *   die Slots nur per Maus bedienbar (kein Tasten-/MIDI-Learn).
     */
    constructor(state, keyboard, keyMidi) {
        this.state = state;
        this.keyboard = keyboard;
        this.keyMidi = keyMidi || null;
        this._style = { ...DEF };
        // [R] durchschaltbar (@dpa 20260722, ddw.md: „Doppelclick für Name ändern geht leider
        // nicht … vielleicht den R Button durchschaltbar: [aus, rename, reset]?") — Doppelklick
        // kollidierte mit musikalisch schnell wiederholten Klicks auf denselben Slot, darum
        // ganz raus; [R] zyklisch statt binär: 'off' → 'rename' → 'reset' → 'off' …
        this._mode = 'off';         // 'off' | 'rename' | 'reset' — bestimmt, was ein Slot-Klick auslöst
        this._activeSlot = -1;      // gerade gegatetes/gehaltenes Slot (VG3-Hervorhebung); -1 = keiner
        this._downSlot = -1;        // Slot, dessen Maustaste GERADE unten ist (für den globalen Loslass-Fang)
        this._heldSlot = -1;        // Slot, dessen Akkord wegen kbHold weiter klingt (für Umschalten-Toggle)
        this._slotEls = [];

        this.element = document.createElement('div');
        this.element.className = 'speicher';
        hint(this.element, 'Akkord-Speicher — leerer Slot: aktuellen Akkord merken · belegter Slot ist ein Gate: halten = Akkord klingt, loslassen = Release (bei Hold: bleibt an, nochmal drücken schaltet aus) · Doppelklick: eigenes Kürzel · bei aktivem [R]: belegten Slot löschen. Rastergröße/Farben in den Settings (Rechtsklick).');

        // Maus kann außerhalb des Slots losgelassen werden (Drag über den Rand hinaus) — der
        // globale Fang stellt sicher, dass das Gate trotzdem sauber schließt (wie PlayKeyboard).
        this._boundMouseUp = () => { if (this._downSlot !== -1) this._onSlotUp(); };
        window.addEventListener('mouseup', this._boundMouseUp);

        // Am Keyboard gespielt (oder Gate voll losgelassen) → die „aktiver Slot"-Hervorhebung
        // (VG3) wieder aufheben.
        keyboard.onChordChange(() => { if (this._activeSlot !== -1) { this._activeSlot = -1; this._paintActive(); } });

        this._build();
        state.subscribe((k) => { if (k === 'akMemory' || k === 'akMemLabels' || k === '*') this._build(); });
    }

    /** Control-Style anwenden (Rastergröße/Farben/Slot-Größe) — von ElementSettings gerufen. */
    applyStyle(s) {
        this._style = { ...DEF, ...(s || {}) };
        this._build();
    }

    /** b:akReset gedrückt → einen Schritt weiter im Zyklus 'off' → 'rename' → 'reset' → 'off'.
     *  Rückgabe: der neue Modus — werkbank.js malt den Button danach (setCtrlOn/setCtrlBlink),
     *  weil BUTTONS (anders als der frühere reine 2-Zustands-Toggle) hier zwei unabhängige
     *  Bits braucht (an/aus + blinkend), die nur von außen gesetzt werden können. */
    cycleMode() {
        this._mode = this._mode === 'off' ? 'rename' : this._mode === 'rename' ? 'reset' : 'off';
        return this._mode;
    }
    get mode() { return this._mode; }

    _cols() { return Math.max(1, Math.min(12, this._style.memCols | 0 || DEF.memCols)); }
    _rows() { return Math.max(1, Math.min(12, this._style.memRows | 0 || DEF.memRows)); }

    /** Beschriftung eines Slots: eigenes Kürzel (akMemLabels), sonst Nummer ab 1. */
    _labelFor(i) {
        const labels = this.state.get('akMemLabels') || {};
        const custom = labels[i];
        return (custom != null && custom !== '') ? String(custom) : String(i + 1);
    }

    _build() {
        const cols = this._cols(), rows = this._rows();
        const size = Math.max(12, Math.min(80, this._style.slotSize | 0 || DEF.slotSize));
        const mem = this.state.get('akMemory') || [];
        const el = this.element;
        // Alte Fernauslöser-Registrierungen abmelden, BEVOR die Slot-Buttons (und ihre Anzahl)
        // sich ändern — sonst blieben bei einem verkleinerten Raster Geister-Slots im
        // Tasten-/MIDI-Overlay hängen (s. Kopf-Kommentar).
        if (this.keyMidi) for (let i = 0; i < this._slotEls.length; i++) this.keyMidi.unregister('u:speicher:' + i);
        el.innerHTML = '';
        el.style.setProperty('--spk-cols', cols);
        el.style.setProperty('--spk-slot', size + 'px');
        if (this._style.bg) el.style.setProperty('--spk-bg', this._style.bg); else el.style.removeProperty('--spk-bg');
        if (this._style.vg1) el.style.setProperty('--spk-vg1', this._style.vg1); else el.style.removeProperty('--spk-vg1');
        if (this._style.vg2) el.style.setProperty('--spk-vg2', this._style.vg2); else el.style.removeProperty('--spk-vg2');
        if (this._style.vg3) el.style.setProperty('--spk-vg3', this._style.vg3); else el.style.removeProperty('--spk-vg3');
        this._slotEls = [];
        for (let i = 0; i < cols * rows; i++) {
            const slot = mem[i];
            const filled = Array.isArray(slot) && slot.length > 0;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'spk-slot' + (filled ? ' filled' : '') + (i === this._activeSlot ? ' active' : '');
            btn.textContent = this._labelFor(i);
            // hint() statt btn.title (@dpa 20260722, ddw.md: „bei mouse overs über den
            // Speichern anzeigen") — native title-Tooltips fallen aus dem Rahmen: keine
            // eigene Optik, keine Reaktion auf den globalen Hints-Schalter, anderer Delay
            // als überall sonst. Die App hat dafür schon ein System (HintBubble/data-hint).
            hint(btn, filled
                ? (slot.map((s) => midiToName(s.note)).join(' ') + ' — halten: Akkord klingt · loslassen: Release · [R]-Zyklus: rename/löschen')
                : 'Leer — Klick merkt den aktuell aktiven Akkord · [R]-Zyklus: rename/löschen');
            // Gate statt Klick (@dpa 20260722_013727): nur mousedown verdrahten, das Loslassen
            // fängt der globale window-Handler ab (_boundMouseUp) — wie PlayKeyboards Tasten.
            // KEIN dblclick mehr (@dpa 20260722, ddw.md: „das wiederholte drücken ist musikalisch
            // sinnvoll und passiert ständig ungewollt") — Umbenennen läuft jetzt über den
            // [R]-Zyklus ('rename'), Doppelklick kollidierte damit mit normalem Spielen.
            btn.addEventListener('mousedown', (e) => { if (e.button === 0) this._onSlotDown(i); });
            // Mouseover-Vorschau (@dpa 20260722_155726): welche Tasten dieser Slot hält, als
            // Rahmen auf der Tastatur zeigen — nur bei belegten Slots, nichts zu zeigen bei leeren.
            if (filled) {
                btn.addEventListener('mouseenter', () => this.keyboard.previewNotes(slot.map((s) => s.note)));
                btn.addEventListener('mouseleave', () => this.keyboard.clearPreview());
            }
            // Fernauslöser (@dpa 20260722_033950): eigener data-ctrl je Slot, damit das Tasten-/
            // MIDI-Overlay genau DIESEN Slot selektiert (nicht das ganze Raster).
            if (this.keyMidi) {
                btn.dataset.ctrl = 'u:speicher:' + i;
                this.keyMidi.register('u:speicher:' + i, btn, 'Speicher ' + this._labelFor(i), () => this._remoteTrigger(i));
            }
            el.appendChild(btn);
            this._slotEls.push(btn);
        }
    }

    /** Nur die „aktiver Slot"-Klasse neu setzen (ohne vollen Rebuild) — für die VG3-Hervorhebung. */
    _paintActive() {
        this._slotEls.forEach((b, i) => b.classList.toggle('active', i === this._activeSlot));
    }

    /** Kern-Entscheidung eines Slot-Triggers (Maus-Runter ODER Fernauslöser): im [R]-Zyklus
     *  'rename' benennt den Slot um (Prompt, wie vorher der Doppelklick), 'reset' löscht einen
     *  belegten Slot sofort (kein Gate). Ist DIESER Slot gerade per Hold gehalten (`_heldSlot`),
     *  schaltet ein erneuter Trigger ihn AUS (Umschalten wie gehabt). Sonst: belegt → Gate AN,
     *  leer → aktuellen Akkord merken. Rückgabe: true, wenn ein Gate angeschlagen wurde (dann
     *  erwartet der Aufrufer später ein passendes Loslassen), sonst false. */
    _activateSlot(i) {
        const mem = (this.state.get('akMemory') || []).slice();
        const slot = mem[i];
        const filled = Array.isArray(slot) && slot.length > 0;
        if (this._mode === 'rename') { this._onSlotRename(i); return false; }
        if (this._mode === 'reset') {
            if (filled) { mem[i] = null; if (i === this._activeSlot) this._activeSlot = -1; this.state.set('akMemory', mem); }
            return false;
        }
        if (filled) {
            if (i === this._heldSlot) {
                this.keyboard.toggleOffChordGate();   // per Hold gehalten + nochmal getriggert → aus
                this._heldSlot = -1;
                return false;
            }
            this.keyboard.gateChordOn(slot);   // Gate an: Akkord übernehmen + sofort anschlagen
            this._heldSlot = -1;               // ein anderer/neuer Slot löst den alten Hold-Stand ab
            this._activeSlot = i;              // dieser Slot ist jetzt der aktive (VG3)
            this._paintActive();
            return true;
        }
        const snap = this.keyboard.snapshotChord();   // merken
        if (!snap.length) return false;               // nichts aktiv → nichts speichern
        mem[i] = snap;
        this.state.set('akMemory', mem);
        return false;
    }

    /** Maus runter auf einen Slot. */
    _onSlotDown(i) {
        if (this._activateSlot(i)) this._downSlot = i;   // für den Loslass-Fang (_onSlotUp)
    }

    /** Maus los (global gefangen): das Gate des gerade gehaltenen Slots loslassen. Bleibt der
     *  Akkord wegen kbHold an, merkt sich `_heldSlot`, wofür ein erneuter Trigger dann das
     *  Ausschalten ist (_activateSlot). */
    _onSlotUp() {
        const i = this._downSlot;
        this._downSlot = -1;
        if (i === -1) return;
        const stillHeld = this.keyboard.releaseChordGate();
        this._heldSlot = stillHeld ? i : -1;
    }

    /** Fernauslöser (Taste/MIDI, @dpa 20260722_033950). Simuliert dieselbe kurze Halte-Geste
     *  wie die gate-Buttons in GroupHost.js (echte Notendauer kommt bei KeyMidi grundsätzlich
     *  nicht durch, s. Kopf-Kommentar) — Gate an, ~120 ms später automatisch los. */
    _remoteTrigger(i) {
        if (!this._activateSlot(i)) return;
        setTimeout(() => {
            const stillHeld = this.keyboard.releaseChordGate();
            this._heldSlot = stillHeld ? i : -1;
        }, 120);
    }

    /** Doppelklick: eigenes Kürzel vergeben (leer = zurück zur Nummer). */
    _onSlotRename(i) {
        const labels = { ...(this.state.get('akMemLabels') || {}) };
        const cur = labels[i] != null ? labels[i] : '';
        const next = window.prompt(`Kürzel für Slot ${i + 1} (leer = Nummer ${i + 1}):`, cur);
        if (next == null) return;                     // abgebrochen
        if (next.trim() === '') delete labels[i]; else labels[i] = next.trim();
        this.state.set('akMemLabels', labels);
    }

    mount(parent) { parent.appendChild(this.element); }
}
