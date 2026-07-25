// state.js — Single Source of Truth für den Taktgeber.
//
// Flaches Parameter-Objekt + Event-API (wie teslacoils State.js). Ein modulares
// Host-System (die Werkbank) kann später GENAU diesen State lesen/schreiben und aus dem
// Manifest (modules.js) Controls, Wertebereiche und Automations-Ziele ableiten.
//
// Trennung wie in teslacoil (LAYOUT_KEYS): VALUE_KEYS = Laufzeit/Klang (Snapshot),
// SETTINGS_KEYS = Optik/Meta/Bedienung (unabhängig vom Klang-Snapshot).

export const DEFAULTS = {
    // --- Tempo (Laufzeit) ---
    bpm: 120,
    // Obergrenze fürs Tempo (@dpa 20260717). Zu schnell Getipptes wird darauf HALBIERT,
    // nicht geklemmt (s. foldBpm in tapTempo.js) – der Puls bleibt erhalten.
    maxBpm: 400,
    // --- Tempo-Nudge (temporäres Bremsen/Gasgeben) ---
    nudgeAmount: 2,       // BPM, um die −/+ das Tempo biegt (nur solange gedrückt)
    nudgeRampMs: 500,     // Anlaufzeit bis zum vollen Nudge
    // --- Tap-Tempo ---
    tapMode: 1,
    tapWait: 2000,
    tapTol: 15,
    tapWin: 4,
    // --- Takt / Metronom (Klang 1:1 aus teslacoil, s. metro.js) ---
    beatsPerBar: 4,
    metroOn: true,
    metroL: 1,            // Klick-Periode = Schlag · (l/m); 1/1 = auf jeden Schlag
    metroM: 1,
    metroLevel: 0.5,
    metroMorph: 0.5,      // Filter: 0 = LP · 0.5 = Bypass · 1 = HP
    metroCutoff: 2000,    // Vadim-SVF-Cutoff (Hz)
    metroReso: 2,         // Vadim-SVF-Resonanz (Q)
    // --- Shortcuts (Bedienung, frei belegbar – @dpa 20260717) ---
    // Werte sind KeyboardEvent.key (kleingeschrieben) bzw. 'space'. Leer = aus.
    keyStart: 'space',
    keyBang: '1',
    keyBang2: '2',
    keySlow: '[',
    keyFast: ']',
    keyTap: 't',
    keyTapReset: 'r',
    // Beats/Takt auf Tastendruck: Präfix + Ziffer (b3 = 3 Beats/Takt). Ein Präfix, weil
    // die nackten Ziffern schon für ! und !! reserviert sind.
    keyBeats: 'b',
    // --- Settings / Optik ---
    // „die üblichen (farbe, größe..)" (@dpa 20260717) – je Gruppe, id → Wert. Ein Objekt
    // statt eines Keys pro Gruppe: eine neue Gruppe im Manifest soll keine State-Änderung
    // brauchen (fehlt ihr Eintrag, gilt der Default).
    // VG und BG getrennt (@dpa 20260717_151145) – wie teslacoils Farb-Presets, die seit
    // 20260716 beides tragen. Eine Akzentfarbe allein kann eine Gruppe nicht absetzen.
    groupColors: {},      // id → CSS-Farbe: Vordergrund (Titel, Rahmen, Regler)
    groupBgs: {},         // id → CSS-Farbe: Hintergrund der Gruppe
    groupScales: {},      // id → Faktor (0.8 … 1.6), skaliert Schrift + Knöpfe der Gruppe
    hiddenControls: [],   // key-Liste ausgeblendeter Controls
    closedGroups: [],     // eingeklappte Gruppen (id-Liste)
    // MIDI-Learn für ALLE Controls (@dpa 20260717). targetId → { type:'note'|'cc', data1, ch }.
    // targetId = der State-Key eines Wert-Controls ODER die Action-id eines Knopfes
    // (start/bang/bang2/tap/tapReset/slow/fast). Ch 0 = alle Kanäle. Ein Objekt, damit eine
    // neue Gruppe keine State-Änderung braucht (fehlt der Eintrag, ist nichts gelernt).
    midiBindings: {},
};

// Was NICHT zum Laufzeit-Snapshot gehört (Optik/Meta/Bedienung) — analog LAYOUT_KEYS.
export const SETTINGS_KEYS = [
    'groupColors', 'groupBgs', 'groupScales', 'hiddenControls', 'closedGroups', 'maxBpm',
    'nudgeAmount', 'nudgeRampMs', 'midiBindings',
    'keyStart', 'keyBang', 'keyBang2', 'keySlow', 'keyFast', 'keyTap', 'keyTapReset', 'keyBeats',
];

export class Store {
    constructor(defaults) {
        this.defaults = { ...defaults };
        this.v = { ...defaults };
        this._k = {};      // key → [fn]
        this._any = [];    // [fn]
    }
    get(k) { return this.v[k]; }
    set(k, val) {
        if (this.v[k] === val) return;
        this.v[k] = val;
        (this._k[k] || []).forEach(f => f(val, k));
        this._any.forEach(f => f(k, val));
    }
    on(k, fn) { (this._k[k] || (this._k[k] = [])).push(fn); return fn; }
    /** Gegenstück zu `on`. Wer die UI neu baut, MUSS seine alten Horcher abmelden: sie
     *  hängen an weggeworfenem DOM und liefen sonst bei jedem Neubau einmal mehr mit. */
    off(k, fn) { const l = this._k[k]; if (!l) return; const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); }
    onAny(fn) { this._any.push(fn); return fn; }
    patch(obj) { for (const k in obj) this.set(k, obj[k]); }
    reset(k) { this.set(k, this.defaults[k]); }
    // Modular verwendbar: Werte- vs. Settings-Snapshot getrennt exportieren.
    exportValues() { const o = {}; for (const k in this.v) if (!SETTINGS_KEYS.includes(k)) o[k] = this.v[k]; return o; }
    exportSettings() { const o = {}; for (const k of SETTINGS_KEYS) o[k] = this.v[k]; return o; }
}

export const state = new Store(DEFAULTS);
