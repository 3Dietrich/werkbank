// defs.js — Transport/Tempo + Takt/Metronom als teslacoil-`defs` für mountGroups.
//
// Die „Fusion" aus UMBAU_KONFLIKTE.md (K1): EINE deklarative Quelle — hier gemappt aus
// taktgebers Manifest (../taktgeber/modules.js) und dessen Defaults (../taktgeber/state.js)
// — füttert teslacoils Fabriken (lib/group/GroupHost.js). Für @dpa sichtbar ist nur
// teslacoil-Stil; taktgebers eigene UI (ui.js) wird NICHT verwendet.
//
// Entscheidungen, die hier sichtbar werden:
//  • K3 — gezogene Werte („ohne Knob"): Knob mit meta:{ viewSize:'none' }. Betrifft die
//    Transport/Tempo-Technikwerte (max. BPM, Anschieben, Anlauf, Tap-Fenster …). Die
//    Metronom-Klangregler bleiben echte Regler (Dial).
//  • K5 — `segment` ist eine neue Sorte (tapMode). `keybind` kommt als reine DATEN mit
//    (die keyXxx-Defaults), aber OHNE sichtbares Control — seine Overlay-UI ist P3.
//  • K7 — UI zuerst, kein Ton: die Action-Buttons rufen nur `onAction(id)` (Attrappe).
//
// Zwei Gruppen (K2), im e-Mode frei verschiebbar: „Transport / Tempo" und „Takt / Metronom".

import { DEFAULTS as TAKT_DEFAULTS } from '../taktgeber/state.js';

export function taktMetroDefs(opts = {}) {
    const onAction = opts.onAction || (() => {});
    // mode: 'toggle' (an/aus je Klick) · 'trigger' (Impuls, Farbe fadet an→aus) ·
    // 'gate' (an solange gedrückt). Default 'toggle', wenn nicht angegeben.
    // phase (Gate-Knöpfe): 'down'/'up' → an onAction weiterreichen, damit slow/fast als
    // gehaltener ASR-Nudge wirken können (engine.js). Trigger/Toggle bekommen phase=undefined.
    const btn = (label, act, title, mode) => ({ label, title, mode, onClick: (k, phase) => onAction(act, phase) });

    return {
        // Alle Werte + Settings-Objekte aus taktgeber übernehmen, damit der State von Anfang
        // an vollständig ist. Die erprobten Tastenbelegungen (taktgebers keyStart/keyBang/…)
        // kommen als `keyBindings`, jetzt aber pro data-ctrl-id (P3-Overlay statt keybind-
        // Control): so tragen die Transport-Knöpfe von Haus aus Space/1/2/[/]/t/r (@dpa
        // 20260717 „unbedingt übernehmen"). midiBindings bleibt leer (wird gelernt).
        DEFAULTS: {
            ...TAKT_DEFAULTS,
            // metro.js kennt seit 20260718 kein l/m mehr und mischt beide Teile über EINEN
            // Pegel (0..1). Die Werkbank benutzt dafür `metroLevel` statt taktgebers metroAmp
            // (0–100) — ein Wert, den der Regler direkt an Metro.setLevel gibt. Default 0.8.
            metroLevel: 0.8,
            // Teil 2 (Offbeat) im VERHÄLTNIS zu Teil 1 (Onbeat), nicht als Hz-Addition
            // (@dpa 20260720: „der Offbeat … im Verhältnis zum Onbeat … nicht Frequenz-
            // Addition"). Faktor × metroCutoff. Default 0.5 = Offbeat halb so hell (dumpfer);
            // praktischer Bereich [0.2–0.99], Knob-Range [0.2–4].
            metroCutoffRatio: 0.5,
            keyBindings: {
                'b:start': 'space', 'b:bang': '1', 'b:bang2': '2',
                'b:slow': '[', 'b:fast': ']', 'b:tap': 't', 'b:tapReset': 'r',
                'k:beatsPerBar': 'b',
            },
        },

        KNOBS: {
            // ── Transport / Tempo — gezogene Werte („ohne Knob", K3) ──
            bpm:         { label: 'BPM',             min: 20,  max: 900,   step: 1,   unit: ' BPM', decimals: 0, meta: { viewSize: 'none' } },
            maxBpm:      { label: 'max. BPM',        min: 100, max: 900,   step: 10,  unit: ' BPM', decimals: 0, meta: { viewSize: 'none' } },
            nudgeAmount: { label: 'Anschieben ±',    min: 1,   max: 20,    step: 1,   unit: ' BPM', decimals: 0, meta: { viewSize: 'none' } },
            nudgeRampMs: { label: 'Anlauf',          min: 0,   max: 1500,  step: 50,  unit: ' ms',  decimals: 0, meta: { viewSize: 'none' } },
            tapWait:     { label: 'wait (Pause ab)', min: 500, max: 5000,  step: 100, unit: ' ms',  decimals: 0, meta: { viewSize: 'none' } },
            tapTol:      { label: '±Fenster',        min: 5,   max: 40,    step: 1,   unit: ' %',   decimals: 0, meta: { viewSize: 'none' } },
            tapWin:      { label: 'Fenster (M2)',    min: 2,   max: 12,    step: 1,   decimals: 0,  meta: { viewSize: 'none' } },
            // Latenz-Offset (@dpa 20260719_033654 „Latenz von taktgeber"): schiebt die
            // gefühlte Phase gegen einen externen Click. − = Vorlauf (Trigger früher, schluckt
            // Ausgabelatenz), + = später. Greift beim Ausgeben (engine).
            latencyOffset: { label: 'Latenz', min: -1000, max: 1000, step: 10, unit: ' ms', decimals: 0, meta: { viewSize: 'none' } },
            // ── Takt / Metronom — echte Regler (Klang, 1:1 aus metro.js). Kein l/m mehr
            //    (@dpa 20260718_012157: „keine L & Ms … nur der Cutoff ist unterschiedlich"):
            //    Teil 2 = Teil 1 + Cutoff-Offset. ──
            beatsPerBar:       { label: 'Beats/Takt', min: 1,   max: 12,    step: 1,    decimals: 0 },
            metroLevel:        { label: 'Level',      min: 0,   max: 1,     step: 0.05, decimals: 2 },
            metroMorph:        { label: 'LP↔HP',      min: 0,   max: 1,     step: 0.01, decimals: 2 },
            metroCutoff:       { label: 'Cutoff',     min: 50,  max: 18000, step: 10,   unit: ' Hz', decimals: 0, curve: 'log' },
            metroCutoffRatio:  { label: 'Teil 2 ×',   min: 0.2, max: 4,     step: 0.01, unit: ' ×',  decimals: 2 },
            metroReso:         { label: 'Reso',       min: 0.1, max: 20,    step: 0.1,  unit: ' Q',  decimals: 1, curve: 'log' },
        },

        SEGMENTS: {
            tapMode: { label: 'Modus', options: [
                { v: 1, l: '1 · konstant', title: 'Über alle Klicks mitteln (stabil).' },
                { v: 2, l: '2 · folgend',  title: 'Gleitendes Fenster, folgt Tempo-Drifts (ab Tap 3 live).' },
            ] },
        },

        TOGGLES: {
            metroOn: { label: 'aktiv', title: 'Metronom-Klick an/aus.' },
        },

        // Takt-Beat-Anzeige (@dpa 20260718_203341): passt sich an Beats/Takt an, hebt den
        // laufenden Beat hervor (aus taktgeber). Zählung folgt `beatsPerBar`.
        DISPLAYS: {
            beatView: { label: 'Takt-Anzeige', countKey: 'beatsPerBar', title: 'Schläge im Takt – der aktuelle leuchtet.' },
        },

        // Action-Buttons (K7-Attrappe): lösen nur onAction(id) aus, kein Ton in P1.
        BUTTONS: {
            start:    btn('▶ / ⏸', 'start', 'Start/Stop.', 'toggle'),
            bang:     btn('!',  'bang',  'Der nächste Schlag wird zur 1.', 'trigger'),
            bang2:    btn('!!', 'bang2', 'Die 1 fällt sofort.', 'trigger'),
            slow:     btn('−',  'slow',  'Bremsen, solange gedrückt.', 'gate'),
            fast:     btn('+',  'fast',  'Anschieben, solange gedrückt.', 'gate'),
            tap:      btn('Tab', 'tap',  'Mittippen.', 'trigger'),
            tapReset: btn('↺', 'tapReset', 'Tap-Serie verwerfen (laufendes Tempo bleibt).', 'trigger'),
        },

        GROUPS: [
            {
                name: 'Transport / Tempo',
                buttons: ['start', 'bang', 'bang2', 'slow', 'fast', 'tap', 'tapReset'],
                knobs: ['bpm'],
                // Die Tab/Tempo-Technik lebt jetzt in einem eigenen Sonderfenster (@dpa
                // 20260719_033654: „Tab ist … ein eigener Bereich, der wie Settings behandelt
                // werden müsste … ein unikat als ‚öffne sondersettings'"). Ein `unikat`-Knopf
                // öffnet es; darin kompakt Modus + die gezogenen Tempo/Tap-Werte + Latenz.
                specials: [{
                    key: 'tabSettings', label: '⚙ Tab', title: 'Tab/Tempo-Sondereinstellungen öffnen',
                    note: 'Tap-Tempo & Timing — hier eingestellt, oben getippt.',
                    segments: ['tapMode'],
                    knobs: ['maxBpm', 'nudgeAmount', 'nudgeRampMs', 'tapWait', 'tapTol', 'tapWin', 'latencyOffset'],
                }],
            },
            {
                name: 'Takt / Metronom',
                toggles: ['metroOn'],
                displays: ['beatView'],
                knobs: ['beatsPerBar', 'metroLevel', 'metroMorph', 'metroCutoff', 'metroCutoffRatio', 'metroReso'],
            },
        ],
    };
}
