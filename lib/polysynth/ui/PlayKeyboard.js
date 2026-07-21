/**
 * PlayKeyboard.js – die eigentliche Spiel-Tastatur des Poly-Synth: mehrere Oktaven (1–9,
 * State-Key `kbOctaves`, unterste Oktave `kbStart`), Klick = Gate mit fester Velocity 127
 * (Maus kennt keine Anschlagstärke), Hold-Toggle (`kbHold`) UND rohe Performance-MIDI sind
 * beide „Hold-bewusst" über dieselbe Gate-Logik verdrahtet.
 *
 * Bewusst NICHT teslacoils Keyboard.js (Skala-Maske) oder BaseKeyboard.js (EIN Basiston,
 * meist reine Anzeige) — hier ist jede Taste ein direkter noteOn/noteOff-Trigger auf die
 * Voice-Engine (lib/polysynth/engine.js).
 *
 * Hold-Prinzip (@dpa: „NoteOffs erst beim Ausschalten"): ist `kbHold` an, hält
 * `_gateOff()` das eigentliche `engine.noteOff()` zurück (Note klingt weiter) — es läuft
 * erst nach, sobald `kbHold` wieder ausgeschaltet wird (`_onHoldChange`). Das gilt
 * GLEICHERMASSEN für Maus-Klicks UND eingehende MIDI-Note-off-Nachrichten, weil beide
 * Pfade durch dieselben `_gateOn`/`_gateOff` laufen.
 * Toggle-Bugfix (@dpa 20260721_203557): klickt man bei `kbHold`=an auf eine bereits durch
 * Hold gehaltene Taste, soll DAS die Note ausschalten (Toggle), nicht neu antriggern —
 * `_pending` verrät genau das (die Note klingt nur noch, weil ihr noteOff zurückgehalten
 * wird); `_gateOrToggle` prüft das VOR jedem neuen Anschlag, für Maus UND MIDI-Note-on.
 *
 * Rohe Performance-MIDI ist ein EIGENER, unabhängiger `navigator.requestMIDIAccess()`-
 * Zugriff — NICHT das Control-Learn aus `lib/keymidi/Midi.js` (das bindet Noten/CCs an
 * einzelne Regler/Schalter über die ganze Werkbank; hier soll dagegen JEDE eingehende Note
 * direkt die Voice-Engine spielen, wie eine echte Klaviatur).
 *
 * Seit den Poly-Synth-Nacharbeiten (@dpa 20260721_203557) ein echtes `u:playKb`-Control
 * (registerCtrlStyle über GroupHost.kbStyle, Settings wie das Base-Frq-Keyboard: Größe/
 * Farbe/Tastenabstand) — gemountet in der GroupHost-Gruppe „Keyboard" (werkbank.js via
 * `polySynth.mountInGroup()`), NICHT mehr lose als Geschwister-Element neben dem Panel.
 *
 * Akkord-Bündel (@dpa 20260722, ddw.md Z.466–468):
 *  • Der „aktuelle Akkord" = die Menge der gerade aktiven Tasten (`_active`, inkl. der per
 *    Hold gehaltenen). `_sounding` verrät zusätzlich, welche davon der Engine GERADE als
 *    Voice hält (nötig, um AkIO als Block zu schalten, ohne klingende Töne zu retriggern),
 *    `_vels` merkt die Anschlagstärke pro Note für Speicher-Snapshots.
 *  • AkIO (b:akio-Button): schaltet ALLE aktiven Tasten als EIN gebündeltes Gate. Off →
 *    ganzer Akkord verstummt (NoteOff), `_active` bleibt aber gemerkt; On → der gemerkte
 *    Akkord klingt wieder. `_onAkioChange` reagiert (auch MIDI-lernbar).
 *
 * Der Akkord-Speicher ist seit @dpa 20260722_004312 ein EIGENER, autarker Control
 * (`lib/polysynth/ui/ChordMemory.js`, control-id `u:speicher`) NEBEN dem Keyboard — nicht
 * mehr in dieses Brett eingebettet. Dieses Keyboard exponiert dafür nur die Naht:
 * `snapshotChord()` (aktuellen Akkord als [{note,vel}] auslesen), `recallChord(notes)` (einen
 * gespeicherten Akkord übernehmen + über AkIO anschlagen) und `onChordChange(cb)` (feuert bei
 * jeder Spiel-Änderung des Akkords, damit der Speicher seine „aktiver Slot"-Hervorhebung
 * wieder aufheben kann). Das [R]-Reset lebt jetzt im Speicher-Control, nicht hier.
 */
import { midiToName } from '../pitch/Scaler.js';
import { hint } from '../../i18n.js';

const BLACK = new Set([1, 3, 6, 8, 10]);

export class PlayKeyboard {
    /**
     * @param {import('../../MiniState.js').MiniState} state
     * @param {ReturnType<import('../engine.js').createPolySynthEngine>} engine
     */
    constructor(state, engine) {
        this.state = state;
        this.engine = engine;
        this._pending = new Set();   // Noten, deren noteOff wegen Hold zurückgehalten wird
        this._active = new Set();    // aktuell klingende (gedrückt ANGEZEIGTE) Noten = „aktueller Akkord"
        this._sounding = new Set();  // Teilmenge von _active, die die Engine GERADE als Voice hält (für AkIO-Blockschaltung)
        this._vels = new Map();      // Note -> zuletzt gespielte Velocity (für Speicher-Snapshots)
        this._keyEls = new Map();    // MIDI-Note -> Tasten-Button (nur aktuell gerenderter Bereich)
        this._mouseNote = null;      // per Maus GERADE heruntergedrückte Note (für den globalen Loslass-Fang)
        this._akio = false;          // AkIO-Zustand (gebündeltes Gate an/aus) — b:akio-Button-getrieben
        this._akioCb = null;         // Callback, um den b:akio-Button visuell nachzuführen (Recall schaltet AkIO an)
        this._chordCb = null;        // Callback bei Spiel-Änderung des Akkords (Speicher-Control hebt „aktiver Slot" auf)

        this.element = document.createElement('div');
        this.element.className = 'keyboard play-keyboard';
        hint(this.element, 'Spiel-Tastatur — Klick = Ton (feste Anschlagstärke). „Hold" hält Töne nach dem Loslassen, bis er wieder ausgeschaltet wird (erneuter Klick auf eine gehaltene Taste schaltet sie aus). MIDI-Eingang spielt direkt mit, Hold-bewusst. „AkIO" schaltet alle aktiven Tasten als EIN gebündeltes Gate; der Speicher (eigener Control) merkt ganze Akkorde.');
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
            if (k === 'kbOctaves' || k === 'kbStart' || k === '*') this._build();
            else if (k === 'kbHold') this._onHoldChange();
        });
    }

    // ── AkIO als Button-Aktion (@dpa 20260722_004312: „sollte ein Button sein") ──────────
    // Der latchende b:akio-Button ruft diese Methoden (über defs onAction → werkbank). Der
    // Zustand lebt hier, nicht im persistierten State.
    /** b:akio gedrückt → gebündeltes Gate an/aus. */
    toggleAkio() { this._setAkio(!this._akio); }
    /** AkIO-Zustand setzen und das Gate anwenden; Button per Callback nachführen (für Recall). */
    _setAkio(on) { this._akio = !!on; this._onAkioChange(); if (this._akioCb) this._akioCb(this._akio); }
    /** werkbank registriert hier den b:akio-Nachführer (host.setCtrlOn('b:akio', on)). */
    onAkio(cb) { this._akioCb = cb; }

    // ── Speicher-Naht (@dpa 20260722_004312: Speicher ist ein EIGENER Control) ───────────
    /** Aktuellen Akkord als [{note,vel}] auslesen (aufsteigend). Leerer Akkord → []. */
    snapshotChord() {
        return [...this._active].sort((a, b) => a - b).map((n) => ({ note: n, vel: this._vels.get(n) ?? 127 }));
    }
    /** Callback registrieren, der bei jeder SPIEL-Änderung des Akkords feuert (nicht bei Recall/
     *  AkIO — der Speicher hebt darüber seine „aktiver Slot"-Hervorhebung auf). */
    onChordChange(cb) { this._chordCb = cb; }
    /** Spiel-Änderung des Akkords melden (Maus/MIDI-Anschlag, echtes Loslassen, Hold-Flush). */
    _notifyChord() { if (this._chordCb) this._chordCb(); }

    /** Unterste MIDI-Note aus `kbStart` (Oktave, 4 = C4 = MIDI 60 — wie vorher fest verdrahtet). */
    _baseMidi() { return (Math.max(0, Math.min(7, this.state.get('kbStart') | 0 || 0)) + 1) * 12; }

    /** Tasten-DOM aus kbStart/kbOctaves neu aufbauen (1–9 Oktaven, klemmen gegen Fehlwerte).
     *  Bereits klingende Noten (`_active`) bleiben optisch aktiv, falls sie im neuen Bereich liegen. */
    _build() {
        const base = this._baseMidi();
        const octaves = Math.max(1, Math.min(9, this.state.get('kbOctaves') | 0 || 1));
        this._rows.innerHTML = '';
        this._keyEls.clear();
        for (let o = 0; o < octaves; o++) {
            const row = document.createElement('div');
            row.className = 'kb-keys';
            for (let pc = 0; pc < 12; pc++) {
                const note = base + o * 12 + pc;
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
                    // Toggle-Bugfix: bei Hold AN + bereits gehaltener Note schaltet der Klick
                    // sie AUS, statt sie neu anzutriggern (s. Kopf-Kommentar).
                    if (this.state.get('kbHold') && this._pending.has(note)) { this._toggleOffHeld(note); return; }
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
        this._sounding.add(note);     // Engine hält die Voice jetzt (für AkIO-Blockschaltung)
        this._vels.set(note, velocity);
        this._visual(note, true);
        this._notifyChord();          // Spiel-Änderung → Speicher hebt „aktiver Slot" auf
    }

    /** Note loslassen: bei `kbHold` AN wird das eigentliche noteOff zurückgehalten (Note
     *  klingt weiter) — sie läuft erst nach, wenn Hold wieder ausgeschaltet wird. */
    _gateOff(note) {
        if (this.state.get('kbHold')) { this._pending.add(note); return; }
        this.engine.noteOff(note);
        this._sounding.delete(note);
        this._vels.delete(note);
        this._active.delete(note);
        this._visual(note, false);
        this._notifyChord();
    }

    /** Hold wurde ausgeschaltet: alle bisher zurückgehaltenen NoteOffs jetzt nachholen. */
    _onHoldChange() {
        if (this.state.get('kbHold')) return;
        for (const note of this._pending) { this.engine.noteOff(note); this._sounding.delete(note); this._vels.delete(note); this._active.delete(note); this._visual(note, false); }
        this._pending.clear();
        this._notifyChord();
    }

    /** Toggle-Bugfix (@dpa 20260721_203557): eine durch Hold gehaltene Note per erneutem
     *  Anschlag AUSSCHALTEN statt retriggern — echtes noteOff, sofort, unabhängig vom
     *  aktuellen Hold-Zustand (die Note klingt ja gerade NUR wegen des vorherigen Hold). */
    _toggleOffHeld(note) {
        this.engine.noteOff(note);
        this._sounding.delete(note);
        this._vels.delete(note);
        this._pending.delete(note);
        this._active.delete(note);
        this._visual(note, false);
        this._notifyChord();
    }

    /** AkIO-Toggle: das gebündelte Gate über ALLE aktiven Tasten. On → jede aktive, noch nicht
     *  klingende Note anschlagen (klingende bleiben stehen, kein Retrigger). Off → alle gerade
     *  klingenden Noten loslassen, `_active` (der gemerkte Akkord) bleibt aber erhalten. */
    _onAkioChange() {
        if (this._akio) {
            for (const note of this._active) {
                if (this._sounding.has(note)) continue;   // klingt schon → nicht retriggern
                this.engine.noteOn(note, this._vels.get(note) ?? 127);
                this._sounding.add(note);
            }
        } else {
            for (const note of this._sounding) this.engine.noteOff(note);
            this._sounding.clear();
        }
    }

    /** Einen gespeicherten Akkord abrufen (ddw.md Z.468: „kurz NoteOffs und die neuen NoteOns"):
     *  erst ALLE gerade klingenden Töne loslassen, dann den Slot-Akkord als neuen aktuellen
     *  Akkord übernehmen und über AkIO als Block anschlagen. Feuert bewusst KEIN _notifyChord
     *  (der Recall SETZT ja gerade den „aktiven Slot" — erst das nächste Spielen hebt ihn auf). */
    recallChord(notes) {
        for (const note of this._sounding) this.engine.noteOff(note);   // kurz NoteOffs (alte)
        this._sounding.clear();
        for (const note of this._active) this._visual(note, false);
        this._active.clear();
        this._pending.clear();
        this._vels.clear();
        for (const { note, vel } of notes) {
            this._active.add(note);
            this._vels.set(note, vel ?? 127);
            this._visual(note, true);
        }
        // AkIO mit anschalten (ddw.md: „AkIO muss mit den Speicherabrufen mit angehen"):
        // schlägt die neuen NoteOns an UND führt den b:akio-Button nach (_akioCb).
        this._setAkio(true);
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
        // Toggle-Bugfix gilt gleichermaßen für Performance-MIDI: eine Note, die gerade nur
        // wegen Hold weiterklingt, schaltet ein erneutes Note-on AUS statt sie zu retriggern.
        if (cmd === 0x90 && d2 > 0) {
            if (this.state.get('kbHold') && this._pending.has(d1)) this._toggleOffHeld(d1);
            else this._gateOn(d1, d2);
        }
        else if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) this._gateOff(d1);
    }

    mount(parent) { parent.appendChild(this.element); }
}
