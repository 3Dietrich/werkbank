// modules.js — Manifest der Gruppen (Transport · Tempo · Takt/Metronom).
//
// Eine Gruppe = { id, title, actions?, controls?, settingsInfo? }.
// Ein Control ist DEKLARATIV an einen State-Key gebunden:
//   { key, type:'range|toggle|segment|keybind', label, min,max,step, unit?, fmt?,
//     options?, info?, tech?, drag? }
//
//   tech: true → lebt im Abschnitt „Technik" der Gruppen-Settings, nicht im Hauptteil.
//   drag: true → ein `range` wird dort NICHT als Fader gezeigt, sondern als gezogener Wert
//                („Knob ohne Knob", @dpa 20260717) – waagerecht ziehen / Pfeile / Rad.
//
// Die Settings sind in ZWEI Abschnitte geteilt (@dpa 20260717: „die üblichen (farbe,
// größe..)" und „die technischen"): „Ansicht" baut die UI selbst aus jeder Gruppe (Farbe,
// Größe, Sichtbarkeit) — hier stehen nur die technischen.
//
// Ein modulares Host-System (die Werkbank) liest genau dieses Manifest → es kennt damit
// alle Parameter, Bereiche und Automations-Ziele, ohne die UI zu kennen. Neue Gruppen hier
// ergänzen; die generische UI (ui.js) baut sie automatisch.

export const MODULES = [
    {
        id: 'transport', title: 'Transport',
        actions: ['transport'],   // Start/Stop | ! | !! | − | +  (+ BPM-Anzeige, Beat-Punkte)
        controls: [
            { key: 'maxBpm', type: 'range', label: 'max. BPM', min: 100, max: 900, step: 10, unit: ' BPM', tech: true, drag: true,
              info: 'Obergrenze fürs Tempo. Zu schnell Getipptes wird auf die höchste Hälfte darunter gelegt (nicht abgeschnitten).' },
            { key: 'nudgeAmount', type: 'range', label: 'Anschieben ±', min: 1, max: 20, step: 1, unit: ' BPM', tech: true, drag: true,
              info: 'Wie weit − / + das Tempo biegen, solange gedrückt. Beim Loslassen springt das Original zurück.' },
            { key: 'nudgeRampMs', type: 'range', label: 'Anlauf', min: 0, max: 1500, step: 50, unit: ' ms', tech: true, drag: true,
              info: 'Zeit bis zum vollen Anschub. 0 = sofort.' },
            // `act` = die Action, die MIDI/Taste auslösen (Knopf-Ziel, nicht der State-Key –
            // der hält nur die Tastenbelegung). Ohne `act` ist ein Keybind nicht MIDI-lernbar.
            { key: 'keyStart', type: 'keybind', label: 'Start/Stop', tech: true, act: 'start', info: 'Taste für Start/Stop.' },
            { key: 'keyBang', type: 'keybind', label: '!', tech: true, act: 'bang', info: 'Taste für „!" — der nächste Schlag wird zur 1.' },
            { key: 'keyBang2', type: 'keybind', label: '!!', tech: true, act: 'bang2', info: 'Taste für „!!" — die 1 fällt sofort.' },
            { key: 'keySlow', type: 'keybind', label: 'Bremsen', tech: true, act: 'slow', info: 'Taste zum Bremsen, wirkt solange sie gehalten wird.' },
            { key: 'keyFast', type: 'keybind', label: 'Anschieben', tech: true, act: 'fast', info: 'Taste zum Anschieben, wirkt solange sie gehalten wird.' },
            // Präfix-Taste: braucht danach eine Ziffer, darum bewusst KEIN `act` (MIDI-Trigger
            // ohne Ziffer wäre sinnlos).
            { key: 'keyBeats', type: 'keybind', label: 'Beats/Takt', tech: true,
              info: 'Präfix für Beats/Takt: diese Taste, dann eine Ziffer 1–9 (Standard: b3 = 3 Beats/Takt).' },
        ],
    },
    {
        id: 'tempo', title: 'Tempo',
        actions: ['tap'],   // Tab-Button
        controls: [
            { key: 'keyTap', type: 'keybind', label: 'Tab', tech: true, act: 'tap', info: 'Taste zum Mittippen.' },
            { key: 'keyTapReset', type: 'keybind', label: 'Tap-Reset', tech: true, act: 'tapReset',
              info: 'Taste, die die Tap-Serie verwirft. Das laufende Tempo bleibt – erst der 2. Tab danach setzt ein neues.' },
            { key: 'tapMode', type: 'segment', label: 'Modus',
              options: [{ v: 1, l: '1 · konstant' }, { v: 2, l: '2 · folgend' }], tech: true,
              info: 'Mode 1: über alle Klicks mitteln (stabil). Mode 2: gleitendes Fenster, folgt Tempo-Drifts, ab Tap 3 live.' },
            { key: 'tapWait', type: 'range', label: 'wait (Pause ab)', min: 500, max: 5000, step: 100, unit: ' ms', tech: true,
              info: 'Pause, ab der eine neue Tap-Serie beginnt.' },
            { key: 'tapTol', type: 'range', label: '±Fenster', min: 5, max: 40, step: 1, unit: ' %', tech: true,
              info: 'Toleranzfenster: Klicks außerhalb gelten als Ausreißer (Mode 1) bzw. Sprung (Mode 2).' },
            { key: 'tapWin', type: 'range', label: 'Fenster (Mode 2)', min: 2, max: 12, step: 1, tech: true,
              info: 'Mittelungsbreite in Beats (nur Mode 2).' },
        ],
    },
    {
        id: 'metro', title: 'Takt / Metronom',
        controls: [
            { key: 'beatsPerBar', type: 'range', label: 'Beats/Takt', min: 1, max: 12, step: 1,
              info: 'Schläge pro Takt; Schlag 1 ist die 1 der Anzeige.' },
            { key: 'metroOn', type: 'toggle', label: 'aktiv', info: 'Metronom-Klick an/aus.' },
            { key: 'metroLevel', type: 'range', label: 'Level', min: 0, max: 1, step: 0.05, fmt: v => v.toFixed(2),
              info: 'Ausgangspegel des Klicks.' },
            { key: 'metroL', type: 'range', label: 'l', min: 1, max: 16, step: 1,
              info: 'Klick-Periode = Schlag · (l/m). l=1, m=1 → auf jeden Schlag; l=1, m=2 → doppelt so oft.' },
            { key: 'metroM', type: 'range', label: 'm', min: 1, max: 16, step: 1,
              info: 'Nenner der Klick-Periode (s. l).' },
            { key: 'metroMorph', type: 'range', label: 'LP↔HP', min: 0, max: 1, step: 0.01, fmt: v => v.toFixed(2),
              info: 'Filter-Morph: 0 = Tiefpass · 0,5 = Bypass · 1 = Hochpass.' },
            { key: 'metroCutoff', type: 'range', label: 'Cutoff', min: 50, max: 18000, step: 10, unit: ' Hz', fmt: v => Math.round(v),
              info: 'Filter-Cutoff des Klicks.' },
            { key: 'metroReso', type: 'range', label: 'Reso', min: 0.1, max: 20, step: 0.1, unit: ' Q', fmt: v => v.toFixed(1),
              info: 'Resonanz. Hohe Werte lassen den Klick nachklingen.' },
        ],
    },
];
