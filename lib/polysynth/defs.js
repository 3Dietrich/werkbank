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
// oscEngine/duty/fmFeedback backen die Wellenform; polyMax/voiceSteal/osc2On/detune steuern
// die Voice-Engine (Poly-Synth-Schritt 2, lib/polysynth/engine.js: noteOn/noteOff) — Tastatur/
// MIDI-gespielte Polyphonie, Voice-Stealing und der optionale zweite, verstimmte Oszillator.
// ampAttack/ampDecay/ampSustain/ampRelease (Gruppe "Amp-Env", Poly-Synth-Schritt 4) sind das
// echte ADSR pro Voice — Attack linear, Decay/Release log/exponentiell.
// kbOctaves/kbHold (Gruppe "Keyboard", Poly-Synth-Schritt 5) steuern die eigenständig
// gemountete Spiel-Tastatur ui/PlayKeyboard.js (kein GroupHost-Control, eigenes Widget).

export function polySynthDefs(opts = {}) {
    return {
        DEFAULTS: {
            // Base-Frq (teslacoil State.js: baseSrc/baseHz/baseBand/harmonizeMix/baseTestOn/baseTestLevel)
            baseSrc: 'Freq',       // 'Freq' | 'Tempo' | 'Ton' — 'Tempo' erst mit Engine-Anschluss wirksam
            baseHz: 55,
            baseNote: 'C',         // Quelle 'Ton': Tonklasse (nur die BaseKeyboard-Anzeige nutzt das, Schritt 2+)
            baseBand: 55,
            harmonizeMix: 0,   // 0 = roh gespielt, 1 = voll auf n·baseHz gerastet (Poly-Synth-Schritt 3, Blend wie teslacoil)
            pitchSmooth: 0.05,  // s: LP-Glide der Osc-Frequenz, wenn BaseFrq/harmonizeMix LIVE eine gehaltene Note verschiebt.
                                // 0 = harter Sprung (Vergleich); Default subtil — finaler Wert noch @dpa nach dem Hören.
            baseTestOn: false,
            baseTestLevel: 0.2,
            // Audio-Osz (teslacoil State.js: oscEngine/duty/fmFeedback/polyMax)
            oscEngine: 'Square-PW',   // 'Square-PW' | 'Sine-FM'
            duty: 0.5,
            fmFeedback: 0,
            polyMax: 8,
            // Voice-Engine (Poly-Synth-Schritt 2, @dpa 20260721)
            voiceSteal: true,   // AN = ältestes stehlen (bisheriges SquareOsc-Verhalten), AUS = neue Note ignorieren.
                                // Default hier auf „stehlen" — @dpa entscheidet den finalen Default später nach dem Hören.
            osc2On: false,      // zweiter, symmetrisch verstimmter Oszillator pro Voice
            detune: 10,         // Cent (0..99), wirkt NUR bei osc2On — Osc1/Osc2 stehen ±detune/2 auseinander
            // Amp-Env (Poly-Synth-Schritt 4, @dpa 20260721): echtes ADSR statt der alten
            // Anti-Klick-Rampe. Attack linear, Decay/Release log (exponentiell) — Peak UND
            // Sustain hängen an DERSELBEN Velocity-Skalierung (kein zweiter Vel-Bezug).
            // Werte hier sind ein plausibler Startpunkt — @dpa stellt sie nach dem Hören ein.
            ampAttack: 0.01,    // s
            ampDecay: 0.15,     // s
            ampSustain: 0.7,    // 0..1, Anteil vom Peak
            ampRelease: 0.3,    // s
            // Keyboard-UI (Poly-Synth-Schritt 5, @dpa 20260721): ui/PlayKeyboard.js
            kbOctaves: 3,       // 1..9 Oktaven, Start bei C4 (MIDI 60) aufwärts
            kbHold: false,      // AN = NoteOffs werden zurückgehalten, bis Hold wieder AUS geht
        },

        KNOBS: {
            baseHz:        { label: 'Base-Frq',  min: 1,    max: 500,  curve: 'log',    unit: ' Hz', decimals: 1 },
            baseBand:      { label: 'Band',      min: 0.05, max: 8000, curve: 'log',    unit: ' Hz', decimals: 2,
                             formatValue: (v) => { const d = v < 20 ? 2 : 0; return `${v.toFixed(d)}–${(v * 2).toFixed(d)}`; } },
            harmonizeMix:  { label: 'Harmonize', min: 0,    max: 1,    curve: 'linear', unit: '',    decimals: 2 },
            pitchSmooth:   { label: 'Pitch-Glide', min: 0,  max: 1,    curve: 'linear', unit: ' s',  decimals: 2 },
            baseTestLevel: { label: 'Test-Vol',  min: 0,    max: 0.6,  curve: 'linear', unit: '',    decimals: 2 },
            duty:          { label: 'PW',        min: 0.01, max: 0.99, curve: 'linear', unit: '',    decimals: 2 },
            fmFeedback:    { label: 'FM',        min: 0,    max: 1,    curve: 'linear', unit: '',    decimals: 2 },
            polyMax:       { label: 'Poly',      min: 1,    max: 8,    step: 1, curve: 'linear', unit: '', decimals: 0 },
            detune:        { label: 'Detune',    min: 0,    max: 99,   step: 1, curve: 'linear', unit: ' ct', decimals: 0 },
            ampAttack:     { label: 'Attack',     min: 0,    max: 2,    curve: 'linear', unit: ' s', decimals: 2 },
            ampDecay:      { label: 'Decay',      min: 0,    max: 2,    curve: 'linear', unit: ' s', decimals: 2 },
            ampSustain:    { label: 'Sustain',     min: 0,    max: 1,    curve: 'linear', unit: '',   decimals: 2 },
            ampRelease:    { label: 'Release',    min: 0,    max: 3,    curve: 'linear', unit: ' s', decimals: 2 },
            kbOctaves:     { label: 'Oktaven',    min: 1,    max: 9,    step: 1, curve: 'linear', unit: '', decimals: 0 },
        },

        SELECTS: {
            baseSrc:   { label: 'BaseFrq-Quelle', options: ['Freq', 'Tempo', 'Ton'] },
            oscEngine: { label: 'Engine', options: ['Square-PW', 'Sine-FM'] },
        },

        TOGGLES: {
            baseTestOn: { label: 'Test-Ton', title: 'Reiner Sinus auf der effektiven BaseFrq, trocken am Master (Vergleichs-Hören). Wirkt erst mit der Voice-Engine (Schritt 2).' },
            osc2On:     { label: 'Osc2', title: 'Zweiter Oszillator pro Stimme, symmetrisch um ±Detune/2 Cent verstimmt (Schwebung). Aus = nur Osc1 exakt auf der Note, ohne zweiten Node.' },
            voiceSteal: { label: 'Stealing', title: 'Bei voller Polyphonie (Poly): AN = älteste gehaltene Note sanft stehlen, AUS = neue Note ignorieren. Finaler Default noch @dpa nach dem Hören.' },
            kbHold:     { label: 'Hold', title: 'AN: losgelassene Tasten klingen weiter, NoteOffs laufen erst nach, wenn Hold wieder ausgeschaltet wird. Gilt für Maus UND MIDI-Eingang gleichermaßen.' },
        },

        GROUPS: [
            {
                name: 'Base-Frq',
                selects: ['baseSrc'],
                toggles: ['baseTestOn'],
                knobs: ['baseBand', 'baseHz', 'harmonizeMix', 'pitchSmooth', 'baseTestLevel'],
            },
            {
                name: 'Audio-Osz',
                selects: ['oscEngine'],
                toggles: ['osc2On', 'voiceSteal'],
                knobs: ['duty', 'fmFeedback', 'polyMax', 'detune'],
            },
            {
                name: 'Amp-Env',
                knobs: ['ampAttack', 'ampDecay', 'ampSustain', 'ampRelease'],
            },
            {
                name: 'Keyboard',
                toggles: ['kbHold'],
                knobs: ['kbOctaves'],
            },
        ],
    };
}
