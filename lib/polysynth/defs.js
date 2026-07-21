// defs.js — Base-Frq + Audio-Osz als GroupHost-defs (Poly-Synth-Instrument Schritt 1,
// @dpa 20260721), analog zu taktmetro/defs.js: EINE deklarative Quelle, gemappt aus
// teslacoils app.js (KNOBS/SELECTS/TOGGLES/GROUPS-Einträge) + State.js (Defaults).
//
// Bewusst NUR die Controls, noch KEINE Engine (wie taktmetro's P1 „flashNoAudio"-Stufe):
// baseSrc='Tempo' braucht z.B. einen echten BPM-Wert, baseSrc='Ton' + die BaseKeyboard-
// Anzeige (lib/polysynth/ui/BaseKeyboard.js, bereits portiert) brauchen die live berechnete
// effektive BaseFreq (teslacoils `TeslaEngine.get baseFreq()`) — das kommt erst mit der
// Voice-Engine (Poly-Synth-Schritt 2/3), zusammen mit der Harmonisier-Quantisierung
// (lib/polysynth/pitch/Scaler.js: harmonicSnap/foldToBand, ebenfalls schon portiert).
//
// polyMax/oscEngine/duty/fmFeedback sind hier nur SICHTBAR — SquareOsc.js (bereits
// portiert, lib/polysynth/audio/) wird erst in Schritt 2 an einen Trigger-Pfad angeschlossen.

export function polySynthDefs(opts = {}) {
    return {
        DEFAULTS: {
            // Base-Frq (teslacoil State.js: baseSrc/baseHz/baseBand/harmonizeMix/baseTestOn/baseTestLevel)
            baseSrc: 'Freq',       // 'Freq' | 'Tempo' | 'Ton' — 'Tempo' erst mit Engine-Anschluss wirksam
            baseHz: 55,
            baseNote: 'C',         // Quelle 'Ton': Tonklasse (nur die BaseKeyboard-Anzeige nutzt das, Schritt 2+)
            baseBand: 55,
            harmonizeMix: 0,
            baseTestOn: false,
            baseTestLevel: 0.2,
            // Audio-Osz (teslacoil State.js: oscEngine/duty/fmFeedback/polyMax)
            oscEngine: 'Square-PW',   // 'Square-PW' | 'Sine-FM'
            duty: 0.5,
            fmFeedback: 0,
            polyMax: 8,
        },

        KNOBS: {
            baseHz:        { label: 'Base-Frq',  min: 1,    max: 500,  curve: 'log',    unit: ' Hz', decimals: 1 },
            baseBand:      { label: 'Band',      min: 0.05, max: 8000, curve: 'log',    unit: ' Hz', decimals: 2,
                             formatValue: (v) => { const d = v < 20 ? 2 : 0; return `${v.toFixed(d)}–${(v * 2).toFixed(d)}`; } },
            harmonizeMix:  { label: 'Harmonize', min: 0,    max: 1,    curve: 'linear', unit: '',    decimals: 2 },
            baseTestLevel: { label: 'Test-Vol',  min: 0,    max: 0.6,  curve: 'linear', unit: '',    decimals: 2 },
            duty:          { label: 'PW',        min: 0.01, max: 0.99, curve: 'linear', unit: '',    decimals: 2 },
            fmFeedback:    { label: 'FM',        min: 0,    max: 1,    curve: 'linear', unit: '',    decimals: 2 },
            polyMax:       { label: 'Poly',      min: 1,    max: 8,    step: 1, curve: 'linear', unit: '', decimals: 0 },
        },

        SELECTS: {
            baseSrc:   { label: 'BaseFrq-Quelle', options: ['Freq', 'Tempo', 'Ton'] },
            oscEngine: { label: 'Engine', options: ['Square-PW', 'Sine-FM'] },
        },

        TOGGLES: {
            baseTestOn: { label: 'Test-Ton', title: 'Reiner Sinus auf der effektiven BaseFrq, trocken am Master (Vergleichs-Hören). Wirkt erst mit der Voice-Engine (Schritt 2).' },
        },

        GROUPS: [
            {
                name: 'Base-Frq',
                selects: ['baseSrc'],
                toggles: ['baseTestOn'],
                knobs: ['baseBand', 'baseHz', 'harmonizeMix', 'baseTestLevel'],
            },
            {
                name: 'Audio-Osz',
                selects: ['oscEngine'],
                knobs: ['duty', 'fmFeedback', 'polyMax'],
            },
        ],
    };
}
