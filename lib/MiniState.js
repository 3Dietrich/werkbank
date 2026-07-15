/**
 * MiniState.js – die kleinste Hülle, die die Bausteine erwarten.
 *
 * KnobMetaEditor und ElementSettings nehmen ein State-Objekt entgegen und rufen darauf
 * nur `get(key)` / `set(key, val)` – für Farb-Presets (`knobColorPresets`) und die
 * Control-Optik (`ctrlStyles`). Den kompletten teslacoil-State (alle Sound-Parameter,
 * Snapshots, Recall-Ebenen) brauchen sie dafür NICHT.
 *
 * Deshalb hier nur das Interface statt einer Kopie: die Werkbank soll die Bausteine
 * zeigen, nicht teslacoils Zustandsverwaltung mitschleppen. Wer die Bausteine in ein
 * echtes Projekt kopiert, hängt sie an den State DIESES Projekts – das ist genau die
 * Nahtstelle, die hier sichtbar bleiben soll.
 *
 * Persistenz: localStorage, damit die Werkbank einen Reload übersteht.
 */
const LS_KEY = 'werkbank_state';

export class MiniState {
    constructor(defaults = {}) {
        this._data = { knobColorPresets: [], ctrlStyles: {}, knobMeta: {}, ...defaults };
        try {
            const saved = JSON.parse(localStorage.getItem(LS_KEY));
            if (saved && typeof saved === 'object') Object.assign(this._data, saved);
        } catch { /* korrupter Stand → Defaults */ }
        this._subs = [];
    }

    get(key) { return this._data[key]; }

    set(key, val) {
        this._data[key] = val;
        this._persist();
        this._subs.forEach((fn) => fn(key, this._data));
    }

    subscribe(fn) { this._subs.push(fn); }

    toJSON() { return { ...this._data }; }

    _persist() {
        try { localStorage.setItem(LS_KEY, JSON.stringify(this._data)); } catch { /* voll → egal */ }
    }

    /** Werkbank auf Anfang (der Demo-Seite genügt ein Reload danach). */
    static reset() { try { localStorage.removeItem(LS_KEY); } catch { /* noop */ } }
}
