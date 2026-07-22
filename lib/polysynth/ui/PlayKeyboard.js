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
 *    Voice hält, `_vels` merkt die Anschlagstärke pro Note für Speicher-Snapshots.
 *
 * Speicher-Gate (@dpa 20260722_013727: „AkIO brauchen wir nicht — die Gate-Funktion gehört
 * auf die Speicher-Buttons selbst"): der separate AkIO-Button ist WIEDER RAUS. Stattdessen
 * ist ein belegter Speicher-Slot direkt ein momentanes Gate: Maus runter → `gateChordOn()`
 * (Akkord übernehmen + sofort anschlagen), Maus los → `releaseChordGate()` (Release-Trigger,
 * genau wie ein normales Tasten-Loslassen). Ist `kbHold` an, bleibt der Akkord beim Loslassen
 * an (wie eine gehaltene Taste) — ein erneutes Runterdrücken DESSELBEN Slots schaltet ihn dann
 * per `toggleOffChordGate()` aus (derselbe Umschalt-Bugfix wie bei normalen gehaltenen Tasten,
 * s.u.). Die Slot-seitige Zustandsverwaltung (welcher Slot gerade unten/gehalten ist) lebt in
 * ChordMemory.js, nicht hier.
 *
 * Der Akkord-Speicher ist seit @dpa 20260722_004312 ein EIGENER, autarker Control
 * (`lib/polysynth/ui/ChordMemory.js`, control-id `u:speicher`) NEBEN dem Keyboard — nicht
 * mehr in dieses Brett eingebettet. Dieses Keyboard exponiert dafür nur die Naht:
 * `snapshotChord()` (aktuellen Akkord als [{note,vel}] auslesen), `gateChordOn(notes)` /
 * `releaseChordGate()` / `toggleOffChordGate()` (das Gate) und `onChordChange(cb)` (feuert bei
 * jeder Spiel-Änderung des Akkords, damit der Speicher seine „aktiver Slot"-Hervorhebung
 * wieder aufheben kann). Das [R]-Reset lebt weiterhin im Speicher-Control, nicht hier.
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
        this._sounding = new Set();  // Teilmenge von _active, die die Engine GERADE als Voice hält (für das Speicher-Gate)
        this._vels = new Map();      // Note -> zuletzt gespielte Velocity (für Speicher-Snapshots)
        this._keyEls = new Map();    // MIDI-Note -> Tasten-Button (nur aktuell gerenderter Bereich)
        this._preview = new Set();   // Tasten-Buttons mit aktivem Speicher-Hover-Rahmen (previewNotes)
        this._mouseNote = null;      // per Maus GERADE heruntergedrückte Note (für den globalen Loslass-Fang)
        this._chordCb = null;        // Callback bei Spiel-Änderung des Akkords (Speicher-Control hebt „aktiver Slot" auf)

        this.element = document.createElement('div');
        this.element.className = 'keyboard play-keyboard';
        hint(this.element, 'Spiel-Tastatur — Klick = Ton (feste Anschlagstärke). „Hold" hält Töne nach dem Loslassen, bis er wieder ausgeschaltet wird (erneuter Klick auf eine gehaltene Taste schaltet sie aus). MIDI-Eingang spielt direkt mit, Hold-bewusst. Belegte Speicher-Slots (eigener Control) sind selbst ein Gate: halten = Akkord klingt, loslassen = Release.');
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

    // ── Speicher-Naht (@dpa 20260722_004312: Speicher ist ein EIGENER Control) ───────────
    /** Aktuellen Akkord als [{note,vel}] auslesen (aufsteigend). Leerer Akkord → []. */
    snapshotChord() {
        return [...this._active].sort((a, b) => a - b).map((n) => ({ note: n, vel: this._vels.get(n) ?? 127 }));
    }
    /** Callback registrieren, der bei jeder SPIEL-Änderung des Akkords feuert (nicht bei
     *  gateChordOn — der Speicher hebt darüber seine „aktiver Slot"-Hervorhebung auf). */
    onChordChange(cb) { this._chordCb = cb; }
    /** Spiel-Änderung des Akkords melden (Maus/MIDI-Anschlag, echtes Loslassen, Hold-Flush). */
    _notifyChord() { if (this._chordCb) this._chordCb(); }

    /** Aktuellen Akkord LIVE transponieren (@dpa 20260722_152438, ddw.md: „zwei Buttons +/-,
     *  schalten den Akkord (live) ± Halbton") — verschiebt _active/_sounding/_pending/_vels
     *  auf die neuen Notenwerte (Bookkeeping ist notenwert-indiziert, muss also mitziehen),
     *  zieht die Tasten-Optik nach und stimmt die Engine über transposeHeld() live um (kein
     *  Neuanschlag, kein Zipper — dieselbe Glide-Naht wie retuneHeld). */
    transposeActive(semitones) {
        if (!this._active.size || !semitones) return;
        const shift = (n) => n + semitones;
        for (const note of this._active) this._visual(note, false);
        this._active = new Set([...this._active].map(shift));
        this._sounding = new Set([...this._sounding].map(shift));
        this._pending = new Set([...this._pending].map(shift));
        this._vels = new Map([...this._vels].map(([n, v]) => [shift(n), v]));
        for (const note of this._active) this._visual(note, true);
        this.engine.transposeHeld(semitones);
        this._notifyChord();
    }

    /** Unterste MIDI-Note aus `kbStart` (Oktave, 4 = C4 = MIDI 60 — wie vorher fest verdrahtet). */
    _baseMidi() { return (Math.max(0, Math.min(7, this.state.get('kbStart') | 0 || 0)) + 1) * 12; }

    /** Tasten-DOM aus kbStart/kbOctaves neu aufbauen (1–9 Oktaven, klemmen gegen Fehlwerte).
     *  Bereits klingende Noten (`_active`) bleiben optisch aktiv, falls sie im neuen Bereich liegen. */
    _build() {
        const base = this._baseMidi();
        const octaves = Math.max(1, Math.min(9, this.state.get('kbOctaves') | 0 || 1));
        this._rows.innerHTML = '';
        this._preview.clear();   // alte Tasten-Buttons sind gleich weg (innerHTML='')
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

    /** Speicher-Mouseover (@dpa 20260722_155726, ddw.md: „mouse Over über den Speichern soll
     *  die gespeicherten Noten auf den Rahmen der Keyboard-Tasten anzeigen") — NUR der Rahmen
     *  (wie `.kb-anchor`), keine Füllung, damit es nicht mit tatsächlich klingenden Tasten
     *  (`.kb-active`) verwechselt wird. Noten außerhalb des gerade gerenderten Bereichs werden
     *  stillschweigend übergangen (kein Fehler, einfach nicht sichtbar). */
    previewNotes(notes) {
        this.clearPreview();
        for (const note of notes) { const el = this._keyEls.get(note); if (el) { el.classList.add('kb-mem-preview'); this._preview.add(el); } }
    }
    clearPreview() { this._preview.forEach((el) => el.classList.remove('kb-mem-preview')); this._preview.clear(); }

    /** Note anschlagen: läuft für Maus-Klick UND MIDI-Note-on gleichermaßen. */
    _gateOn(note, velocity) {
        this._pending.delete(note);   // erneuter Anschlag einer noch (Hold-)gehaltenen Note = Retrigger
        this.engine.noteOn(note, velocity);
        this._active.add(note);
        this._sounding.add(note);     // Engine hält die Voice jetzt (für das Speicher-Gate)
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

    /** Speicher-Gate AN (Slot-Mousedown, @dpa 20260722_013727: „Speicher-Recall mit Gate ON
     *  verbinden"): erst ALLE gerade klingenden Töne kurz loslassen (ddw.md Z.468: „kurz
     *  NoteOffs und die neuen NoteOns"), dann den Slot-Akkord als neuen aktuellen Akkord
     *  übernehmen und SOFORT anschlagen. Feuert bewusst KEIN _notifyChord (der Gate-Trigger
     *  SETZT ja gerade den „aktiven Slot" — erst das nächste Spielen/volle Loslassen hebt ihn
     *  wieder auf). */
    gateChordOn(notes) {
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
        for (const note of this._active) {
            this.engine.noteOn(note, this._vels.get(note) ?? 127);
            this._sounding.add(note);
        }
    }

    /** Speicher-Gate LOS (Slot-Mouseup): genau wie ein normales Tasten-Loslassen — bei
     *  `kbHold` AN bleibt der Akkord an (Umschalten wie gehabt, `_onHoldChange`/
     *  `toggleOffChordGate` holen das später nach), sonst echtes noteOff mit ampRelease-
     *  Ausklang. Rückgabe: true = an Hold hängen geblieben (Slot bleibt „gehalten"),
     *  false = voll losgelassen. */
    releaseChordGate() {
        if (this.state.get('kbHold')) {
            for (const note of this._sounding) this._pending.add(note);
            return true;
        }
        for (const note of this._sounding) {
            this.engine.noteOff(note);
            this._vels.delete(note);
            this._active.delete(note);
            this._visual(note, false);
        }
        this._sounding.clear();
        this._notifyChord();
        return false;
    }

    /** Erneutes Mousedown auf einen bereits per Hold gehaltenen Speicher-Slot: schaltet den
     *  Akkord AUS statt ihn zu retriggern — derselbe Umschalt-Bugfix wie `_toggleOffHeld` für
     *  normale Tasten (die Noten klingen ja gerade NUR wegen des vorherigen Hold). */
    toggleOffChordGate() {
        for (const note of this._sounding) {
            this.engine.noteOff(note);
            this._vels.delete(note);
            this._pending.delete(note);
            this._active.delete(note);
            this._visual(note, false);
        }
        this._sounding.clear();
        this._notifyChord();
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
    /** @dpa 20260722_152438 (ddw.md): „zusätzlicher Toggle für Bereich/visible range und
     *  (okt-)Offset. D.h. MIDI-Noten werden nur von-bis dem angezeigten Bereich 'angenommen',
     *  mit Offset wird die Tastatur oktav-weise verschoben." kbMidiOffset verschiebt JEDE
     *  eingehende Note um N Oktaven, BEVOR sie geprüft/gespielt wird (z.B. ein MIDI-Keyboard,
     *  das in einer anderen Oktave steht als der angezeigte Bereich). kbMidiRange AN: Noten
     *  außerhalb des GERADE SICHTBAREN Tastenbereichs (kbStart…kbStart+kbOctaves) werden
     *  komplett ignoriert (kein Ton) statt außerhalb der Tastatur unsichtbar mitzuspielen. */
    _onMidiMessage(msg) {
        const [status, d1, d2] = msg.data, cmd = status & 0xf0;
        if (cmd !== 0x90 && cmd !== 0x80) return;   // „Controls u.a. werden ignoriert" — nur Note on/off
        const note = d1 + (this.state.get('kbMidiOffset') | 0) * 12;
        if (note < 0 || note > 127) return;
        if (this.state.get('kbMidiRange')) {
            const base = this._baseMidi();
            const octaves = Math.max(1, Math.min(9, this.state.get('kbOctaves') | 0 || 1));
            if (note < base || note >= base + octaves * 12) return;
        }
        // Toggle-Bugfix gilt gleichermaßen für Performance-MIDI: eine Note, die gerade nur
        // wegen Hold weiterklingt, schaltet ein erneutes Note-on AUS statt sie zu retriggern.
        if (cmd === 0x90 && d2 > 0) {
            if (this.state.get('kbHold') && this._pending.has(note)) this._toggleOffHeld(note);
            else this._gateOn(note, d2);
        }
        else this._gateOff(note);
    }

    mount(parent) { parent.appendChild(this.element); }
}
