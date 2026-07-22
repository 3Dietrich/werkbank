/**
 * Midi.js — Web-MIDI-Learn für ALLE Controls.
 *
 * TREUER PORT aus taktgeber (../../../taktgeber/midi.js, @dpa 20260717 „unbedingt
 * übernehmen"), unverändert bis auf diesen Kopf: generischer Verteiler, kein Wissen über
 * einzelne Parameter. Er kennt Bindungen (targetId → {type,data1,ch}, im State unter
 * `midiBindings`) und meldet eingehende, GELERNTE Nachrichten an einen Anwender weiter
 * (`onApply`). WAS ein Ziel mit dem Wert tut — einen Regler setzen, einen Knopf auslösen —
 * entscheidet der Aufrufer (KeyMidi.js). So bleibt die MIDI-Schicht frei von Manifest-Details.
 *
 * Der Kanal (Ch) wird beim Lernen mitgeschrieben und ist danach ein simpler 0–16-Wert
 * (0 = alle Kanäle), den man nachziehen kann.
 */
export class Midi {
    constructor(state) {
        this.state = state;
        this.access = null;
        this.learning = null;          // targetId, auf den gerade gelernt wird (oder null)
        this._apply = () => {};
        this._onLearn = () => {};       // (targetId, binding|'listening'|null)
        this._onStatus = () => {};
        this._edge = {};                // targetId → letzter on-Zustand (Flankenerkennung)
        this._init();
    }

    onApply(fn) { this._apply = fn; }
    onLearn(fn) { this._onLearn = fn; }
    onStatus(fn) { this._onStatus = fn; }

    bindings() { return this.state.get('midiBindings') || {}; }
    binding(id) { return this.bindings()[id] || null; }
    /** Immer als NEUES Objekt setzen — Store vergleicht mit `===`. */
    setBinding(id, b) { this.state.set('midiBindings', { ...this.bindings(), [id]: b }); }
    clear(id) { const m = { ...this.bindings() }; delete m[id]; this.state.set('midiBindings', m); }
    setChannel(id, ch) { const b = this.binding(id); if (b) this.setBinding(id, { ...b, ch }); }

    startLearn(id) { this.learning = id; this._onLearn(id, 'listening'); }
    cancelLearn() { const id = this.learning; this.learning = null; if (id) this._onLearn(id, this.binding(id)); }

    _init() {
        if (!navigator.requestMIDIAccess) { this._onStatus('Web-MIDI in diesem Browser nicht verfügbar.'); return; }
        navigator.requestMIDIAccess().then((access) => {
            this.access = access;
            // addEventListener statt der onmidimessage-PROPERTY (@dpa-Bug, entdeckt 20260722):
            // dieselben MIDIInput-Objekte werden von DREI Midi.js-Instanzen (Takt/Poly-Synth/
            // Rec, je ein eigenes new Midi() pro mountGroups()) UND PlayKeyboard.js/
            // BaseKeyboard.js' eigenem Roh-MIDI-Zugriff geteilt — mit `.onmidimessage =`
            // überschreibt die zuletzt attachte Stelle alle anderen (nur EIN Handler pro
            // Input möglich), addEventListener erlaubt beliebig viele nebeneinander. `_attached`
            // verhindert Doppel-Listener, wenn `attach()` erneut auf onstatechange läuft.
            const attached = new Set();
            const attach = () => {
                for (const inp of access.inputs.values()) {
                    if (attached.has(inp)) continue;
                    attached.add(inp);
                    inp.addEventListener('midimessage', (m) => this._handle(m));
                }
            };
            attach(); access.onstatechange = attach;
            this._report();
        }).catch(() => this._onStatus('Web-MIDI verweigert.'));
    }
    _report() {
        const n = this.access ? this.access.inputs.size : 0;
        this._onStatus(n ? `Web-MIDI aktiv · ${n} Eingang/Eingänge` : 'Web-MIDI aktiv · kein Gerät');
    }

    /** Rohnachricht → normalisiertes Ereignis. Note-on (vel>0) und CC>0 sind „on", der
     *  Wert 0..1 kommt aus Velocity bzw. CC-Wert. Note-off/vel0/CC0 sind „off". */
    _decode(data) {
        const [status, d1, d2] = data, cmd = status & 0xf0, ch = (status & 0x0f) + 1;
        if (cmd === 0x90 && d2 > 0) return { type: 'note', data1: d1, ch, on: true, value01: d2 / 127 };
        if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) return { type: 'note', data1: d1, ch, on: false, value01: 0 };
        if (cmd === 0xb0) return { type: 'cc', data1: d1, ch, on: d2 > 0, value01: d2 / 127 };
        return null;
    }

    _handle(msg) {
        const e = this._decode(msg.data);
        if (!e) return;
        if (this.learning) {
            // Note-off nicht als Belegung nehmen (das Loslassen der Lern-Taste).
            if (e.type === 'note' && !e.on) return;
            const id = this.learning; this.learning = null;
            this.setBinding(id, { type: e.type, data1: e.data1, ch: e.ch });
            this._onLearn(id, this.binding(id));
            return;
        }
        const m = this.bindings();
        for (const id in m) {
            const b = m[id];
            if (b.type !== e.type || b.data1 !== e.data1) continue;
            if (b.ch !== 0 && b.ch !== e.ch) continue;
            this._apply(id, e);
        }
    }

    /** Flankenerkennung für Auslöser-Ziele (Knöpfe): true nur beim Wechsel off→on. */
    rising(id, on) {
        const was = !!this._edge[id]; this._edge[id] = on;
        return on && !was;
    }
}

/** MIDI-Notennummer → Tonname (C4 = 60, wissenschaftlich): z.B. 61 → „C#2"-Stil.
 *  Oktave = floor(n/12) − 1. */
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const noteName = (n) => NOTE_NAMES[((n % 12) + 12) % 12] + (Math.floor(n / 12) - 1);

/** Lesbarer Name einer Bindung für die Anzeige. Bei Noten mit Tonname (@dpa 20260719). */
export const midiName = (b) => {
    if (!b) return '—';
    if (b.type === 'note') return `Note ${noteName(b.data1)} (${b.data1}) · Ch ${b.ch || 'alle'}`;
    return `CC ${b.data1} · Ch ${b.ch || 'alle'}`;
};
