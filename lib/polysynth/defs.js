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
// kbStart/kbOctaves/kbHold (Gruppe "Keyboard") steuern ui/PlayKeyboard.js — seit den
// Poly-Synth-Nacharbeiten (@dpa 20260721_203557) ein echtes `u:playKb`-Control (Settings,
// strukturell in der Gruppe), gemountet in werkbank.js über GroupHost.mountInGroup(), NICHT
// mehr lose als Geschwister-Element neben dem Panel.

export function polySynthDefs(opts = {}) {
    const onAction = opts.onAction || (() => {});
    return {
        DEFAULTS: {
            // Base-Frq (teslacoil State.js: baseSrc/baseHz/baseBand/harmonizeMix)
            baseSrc: 'Freq',       // 'Freq' | 'Tempo' | 'Ton' — 'Tempo' erst mit Engine-Anschluss wirksam
            baseHz: 55,
            baseNote: 'C',         // Quelle 'Ton': Tonklasse (nur die BaseKeyboard-Anzeige nutzt das, Schritt 2+)
            baseBand: 55,
            harmonizeMix: 0,   // 0 = roh gespielt, 1 = voll auf n·baseHz gerastet (Poly-Synth-Schritt 3, Blend wie teslacoil)
            pitchSmooth: 0.05,  // s: LP-Glide der Osc-Frequenz, wenn BaseFrq/harmonizeMix LIVE eine gehaltene Note verschiebt.
                                // 0 = harter Sprung (Vergleich); Default subtil — finaler Wert noch @dpa nach dem Hören.
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
            kbStart: 4,         // Oktave der untersten Taste (4 = C4/MIDI 60, wie bisher fest verdrahtet)
            kbOctaves: 3,       // 1..9 Oktaven, aufwärts ab kbStart
            kbHold: false,      // AN = NoteOffs werden zurückgehalten, bis Hold wieder AUS geht
            // Akkord-Bündel + Speicher (@dpa 20260722, ddw.md Z.466–468): AkIO ist EIN
            // gebündeltes Gate über alle aktiven Tasten (On=Akkord klingt, Off=ganzer Akkord
            // still, Zustand bleibt gemerkt). Der Speicher schnappt die im Trigger-Moment
            // aktiven Tasten in ein Slot-Raster (akMemCols×akMemRows, Menge einstellbar);
            // belegten Slot drücken = Recall (schaltet AkIO mit an, kurz NoteOff-alt→NoteOn-neu),
            // bei aktivem akReset [R] = Slot löschen statt abrufen. akMemory reist als Teil des
            // polySynthState in der Snapshot-/Config-Kette mit (keine eigene Persistenz).
            // akio/akReset sind KEIN State mehr (@dpa 20260722_004312: „sollten Buttons sein"):
            // als latchende b:-Buttons (mode 'toggle') geführt, ihr On-Zustand lebt im Keyboard
            // (PlayKeyboard._akio/_resetMode), nicht im persistierten State.
            akMemCols: 3,       // Speicher-Raster Spalten (Menge einstellbar, zunächst 3×3)
            akMemRows: 3,       // Speicher-Raster Zeilen
            akMemory: [],       // Slots: je null (leer) oder [{note,vel}, …] (gemerkter Akkord)
        },

        KNOBS: {
            baseHz:        { label: 'Base-Frq',  min: 1,    max: 500,  curve: 'log',    unit: ' Hz', decimals: 1 },
            baseBand:      { label: 'Band',      min: 0.05, max: 8000, curve: 'log',    unit: ' Hz', decimals: 2,
                             formatValue: (v) => { const d = v < 20 ? 2 : 0; return `${v.toFixed(d)}–${(v * 2).toFixed(d)}`; } },
            harmonizeMix:  { label: 'Harmonize', min: 0,    max: 1,    curve: 'linear', unit: '',    decimals: 2 },
            pitchSmooth:   { label: 'Pitch-Glide', min: 0,  max: 1,    curve: 'linear', unit: ' s',  decimals: 2 },
            duty:          { label: 'PW',        min: 0.01, max: 0.99, curve: 'linear', unit: '',    decimals: 2 },
            fmFeedback:    { label: 'FM',        min: 0,    max: 1,    curve: 'linear', unit: '',    decimals: 2 },
            polyMax:       { label: 'Poly',      min: 1,    max: 8,    step: 1, curve: 'linear', unit: '', decimals: 0 },
            detune:        { label: 'Detune',    min: 0,    max: 99,   step: 1, curve: 'linear', unit: ' ct', decimals: 0 },
            ampAttack:     { label: 'Attack',     min: 0,    max: 2,    curve: 'linear', unit: ' s', decimals: 2 },
            ampDecay:      { label: 'Decay',      min: 0,    max: 2,    curve: 'linear', unit: ' s', decimals: 2 },
            ampSustain:    { label: 'Sustain',     min: 0,    max: 1,    curve: 'linear', unit: '',   decimals: 2 },
            ampRelease:    { label: 'Release',    min: 0,    max: 3,    curve: 'linear', unit: ' s', decimals: 2 },
            kbStart:       { label: 'Oktav-Start', min: 0,  max: 7,    step: 1, curve: 'linear', unit: '', decimals: 0,
                             formatValue: (v) => 'C' + Math.round(v) },
            kbOctaves:     { label: 'Oktaven',    min: 1,    max: 9,    step: 1, curve: 'linear', unit: '', decimals: 0 },
            akMemCols:     { label: 'Spk-Spalten', min: 1,   max: 8,    step: 1, curve: 'linear', unit: '', decimals: 0 },
            akMemRows:     { label: 'Spk-Zeilen',  min: 1,   max: 8,    step: 1, curve: 'linear', unit: '', decimals: 0 },
        },

        SELECTS: {
            baseSrc:   { label: 'BaseFrq-Quelle', options: ['Freq', 'Tempo', 'Ton'] },
            oscEngine: { label: 'Engine', options: ['Square-PW', 'Sine-FM'] },
        },

        TOGGLES: {
            osc2On:     { label: 'Osc2', title: 'Zweiter Oszillator pro Stimme, symmetrisch um ±Detune/2 Cent verstimmt (Schwebung). Aus = nur Osc1 exakt auf der Note, ohne zweiten Node.' },
            voiceSteal: { label: 'Stealing', title: 'Bei voller Polyphonie (Poly): AN = älteste gehaltene Note sanft stehlen, AUS = neue Note ignorieren. Finaler Default noch @dpa nach dem Hören.' },
            kbHold:     { label: 'Hold', title: 'AN: losgelassene Tasten klingen weiter, NoteOffs laufen erst nach, wenn Hold wieder ausgeschaltet wird. Gilt für Maus UND MIDI-Eingang gleichermaßen.' },
        },

        // AkIO/R als latchende Buttons (@dpa 20260722_004312) statt Toggles — mode 'toggle'
        // heißt hier: Klick schaltet an/aus und der Zustand bleibt sichtbar stehen (kein Impuls).
        BUTTONS: {
            akio:    { label: 'AkIO', mode: 'toggle', title: 'Akkord-Ein/Aus: schickt ALLE aktiven Tasten als EIN gebündeltes Gate an den Synth. Aus = der ganze Akkord verstummt (der Zustand bleibt gemerkt), An = er klingt wieder. Ein Speicher-Recall schaltet AkIO automatisch an.', onClick: () => onAction('akio') },
            akReset: { label: 'R',    mode: 'toggle', title: 'Reset-Modus für den Akkord-Speicher: solange aktiv, LÖSCHT ein Klick auf einen belegten Slot dessen Akkord, statt ihn abzurufen.', onClick: () => onAction('akReset') },
        },

        GROUPS: [
            {
                name: 'Base-Frq',
                selects: ['baseSrc'],
                knobs: ['baseBand', 'baseHz', 'harmonizeMix', 'pitchSmooth'],
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
                buttons: ['akio', 'akReset'],
                knobs: ['kbStart', 'kbOctaves', 'akMemCols', 'akMemRows'],
            },
        ],
    };
}
