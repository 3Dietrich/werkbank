/**
 * PlayKeyboard.js – die eigentliche Spiel-Tastatur des Poly-Synth (Poly-Synth-Instrument
 * Schritt 5, @dpa 20260721): mehrere Oktaven (1–9, State-Key `kbOctaves`), Klick = Gate mit
 * fester Velocity 127 (Maus kennt keine Anschlagstärke), Hold-Toggle (`kbHold`) UND rohe
 * Performance-MIDI sind beide „Hold-bewusst" über dieselbe Gate-Logik verdrahtet.
 *
 * Bewusst NICHT teslacoils Keyboard.js (Skala-Maske) oder BaseKeyboard.js (EIN Basiston,
 * meist reine Anzeige) — hier ist jede Taste ein direkter noteOn/noteOff-Trigger auf die
 * Voice-Engine (lib/polysynth/engine.js), startend bei MIDI 60 (C4) aufwärts.
 *
 * Hold-Prinzip (@dpa: „NoteOffs erst beim Ausschalten"): ist `kbHold` an, hält
 * `_gateOff()` das eigentliche `engine.noteOff()` zurück (Note klingt weiter) — es läuft
 * erst nach, sobald `kbHold` wieder ausgeschaltet wird (`_onHoldChange`). Das gilt
 * GLEICHERMASSEN für Maus-Klicks UND eingehende MIDI-Note-off-Nachrichten, weil beide
 * Pfade durch dieselben `_gateOn`/`_gateOff` laufen.
 *
 * Rohe Performance-MIDI ist ein EIGENER, unabhängiger `navigator.requestMIDIAccess()`-
 * Zugriff — NICHT das Control-Learn aus `lib/keymidi/Midi.js` (das bindet Noten/CCs an
 * einzelne Regler/Schalter über die ganze Werkbank; hier soll dagegen JEDE eingehende Note
 * direkt die Voice-Engine spielen, wie eine echte Klaviatur).
 */
import { midiToName } from '../pitch/Scaler.js';
import { hint } from '../../i18n.js';

const BLACK = new Set([1, 3, 6, 8, 10]);
const BASE_MIDI = 60;   // C4 = unterste Taste bei kbOctaves=1..9 (aufwärts)

export class PlayKeyboard {
    /**
     * @param {import('../../MiniState.js').MiniState} state
     * @param {ReturnType<import('../engine.js').createPolySynthEngine>} engine
     */
    constructor(state, engine) {
        this.state = state;
        this.engine = engine;
        this._pending = new Set();   // Noten, deren noteOff wegen Hold zurückgehalten wird
        this._active = new Set();    // aktuell klingende (gedrückt ANGEZEIGTE) Noten
        this._keyEls = new Map();    // MIDI-Note -> Tasten-Button (nur aktuell gerenderter Bereich)
        this._mouseNote = null;      // per Maus GERADE heruntergedrückte Note (für den globalen Loslass-Fang)

        this.element = document.createElement('div');
        this.element.className = 'keyboard play-keyboard';
        hint(this.element, 'Spiel-Tastatur — Klick = Ton (feste Anschlagstärke). „Hold" hält Töne nach dem Loslassen, bis er wieder ausgeschaltet wird. MIDI-Eingang spielt direkt mit, Hold-bewusst.');
        this._rows = document.createElement('div');
        this._rows.className = 'kb-octaves';
        this.element.appendChild(this._rows);

        // Maus kann außerhalb der gedrückten Taste losgelassen werden (Drag über den Rand
        // hinaus) — der globale Fang stellt sicher, dass das Gate trotzdem sauber schließt.
        this._boundMouseUp = () => { if (this._mouseNote != null) { this._gateOff(this._mouseNote); this._mouseNote = null; } };
        window.addEventListener('mouseup', this._boundMouseUp);

        this._build();
        this._initMidi();

        state.subscribe((k) => {
            if (k === 'kbOctaves' || k === '*') this._build();
            else if (k === 'kbHold') this._onHoldChange();
        });
    }

    /** Tasten-DOM aus kbOctaves neu aufbauen (1–9 Oktaven, klemmen gegen Fehlwerte). Bereits
     *  klingende Noten (`_active`) bleiben optisch aktiv, falls sie im neuen Bereich liegen. */
    _build() {
        const octaves = Math.max(1, Math.min(9, this.state.get('kbOctaves') | 0 || 1));
        this._rows.innerHTML = '';
        this._keyEls.clear();
        for (let o = 0; o < octaves; o++) {
            const row = document.createElement('div');
            row.className = 'kb-keys';
            for (let pc = 0; pc < 12; pc++) {
                const note = BASE_MIDI + o * 12 + pc;
                const key = document.createElement('button');
                key.type = 'button';
                key.className = 'kb-key ' + (BLACK.has(pc) ? 'kb-black' : 'kb-white');
                const ind = document.createElement('div'); ind.className = 'kb-ind';
                const id = document.createElement('div'); id.className = 'kb-id'; id.textContent = midiToName(note);
                key.appendChild(ind); key.appendChild(id);
                // Nur mousedown verdrahten — das Loslassen fängt der globale window-Handler
                // (_boundMouseUp) ab, auch wenn die Maus über eine andere Taste/außerhalb
                // losgelassen wird (sonst bliebe die Voice bei einem Drag-Release hängen).
                key.addEventListener('mousedown', (e) => {
                    if (e.button !== 0) return;
                    e.preventDefault();
                    this._mouseNote = note;
                    this._gateOn(note, 127);   // Klick = feste Velocity 127 (Maus kennt keine Anschlagstärke)
                });
                row.appendChild(key);
                this._keyEls.set(note, key);
                if (this._active.has(note)) key.classList.add('kb-active');
            }
            this._rows.appendChild(row);
        }
    }

    _visual(note, on) {
        const el = this._keyEls.get(note);
        if (el) el.classList.toggle('kb-active', on);
    }

    /** Note anschlagen: läuft für Maus-Klick UND MIDI-Note-on gleichermaßen. */
    _gateOn(note, velocity) {
        this._pending.delete(note);   // erneuter Anschlag einer noch (Hold-)gehaltenen Note = Retrigger
        this.engine.noteOn(note, velocity);
        this._active.add(note);
        this._visual(note, true);
    }

    /** Note loslassen: bei `kbHold` AN wird das eigentliche noteOff zurückgehalten (Note
     *  klingt weiter) — sie läuft erst nach, wenn Hold wieder ausgeschaltet wird. */
    _gateOff(note) {
        if (this.state.get('kbHold')) { this._pending.add(note); return; }
        this.engine.noteOff(note);
        this._active.delete(note);
        this._visual(note, false);
    }

    /** Hold wurde ausgeschaltet: alle bisher zurückgehaltenen NoteOffs jetzt nachholen. */
    _onHoldChange() {
        if (this.state.get('kbHold')) return;
        for (const note of this._pending) { this.engine.noteOff(note); this._active.delete(note); this._visual(note, false); }
        this._pending.clear();
    }

    /** Eigener, unabhängiger Web-MIDI-Zugriff für die Performance-Eingabe (nicht das
     *  Control-Learn aus keymidi/Midi.js) — jede eingehende Note-on/off spielt direkt die
     *  Voice-Engine, über dieselben _gateOn/_gateOff wie die Maus (also Hold-bewusst). */
    _initMidi() {
        if (!navigator.requestMIDIAccess) return;   // z.B. Firefox ohne Flag — Maus bleibt nutzbar
        navigator.requestMIDIAccess().then((access) => {
            const attach = () => { for (const inp of access.inputs.values()) inp.onmidimessage = (m) => this._onMidiMessage(m); };
            attach(); access.onstatechange = attach;
        }).catch(() => { /* verweigert/nicht verfügbar */ });
    }
    _onMidiMessage(msg) {
        const [status, d1, d2] = msg.data, cmd = status & 0xf0;
        if (cmd === 0x90 && d2 > 0) this._gateOn(d1, d2);
        else if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) this._gateOff(d1);
    }

    mount(parent) { parent.appendChild(this.element); }
}
