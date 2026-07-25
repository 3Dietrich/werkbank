/**
 * midi.js — Web-MIDI-Learn für ALLE Controls (@dpa 20260717).
 *
 * Ein generischer Verteiler, kein Wissen über einzelne Parameter: er kennt Bindungen
 * (targetId → {type,data1,ch}, im State unter `midiBindings`) und meldet eingehende, GELERNTE
 * Nachrichten an einen Anwender weiter (`onApply`). WAS ein Ziel mit dem Wert tut — einen
 * Regler setzen, einen Knopf auslösen — entscheidet der Aufrufer (index.html), genauso wie die
 * Aktions-Blöcke der UI. So bleibt die MIDI-Schicht frei von Manifest-Details.
 *
 * Der Kanal (Ch) wird beim Lernen mitgeschrieben und ist danach ein simpler 0–16-Wert
 * (0 = alle Kanäle), den man in den Settings nachziehen kann (@dpa: „nicht als Select …
 * sondern als simples 0–16 draggable value").
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
            const attach = () => { for (const inp of access.inputs.values()) inp.onmidimessage = (m) => this._handle(m); };
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

/** Lesbarer Name einer Bindung für die Anzeige. */
export const midiName = (b) => !b ? '—' : `${b.type === 'note' ? 'Note' : 'CC'} ${b.data1} · Ch ${b.ch || 'alle'}`;
