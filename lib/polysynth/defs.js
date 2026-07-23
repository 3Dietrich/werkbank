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
            baseNote: 'C',         // Quelle 'Ton': Tonklasse, gewählt über das KB (BaseKeyboard.js)
            baseBand: 55,
            kammerton: 440,    // Referenz-Frequenz A4 (@dpa 20260722_013727), wirkt auf ALLE Frequenzberechnungen
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
            oscTilt: 0,         // 0..200 (@dpa ddw.md Z.855-856): direkt am OSZ Höhen dämpfen, damit die
                                // AmpEnv EINE Instanz bleiben kann. 0=flach, 100=linearer Abfall bis SR/2→0,
                                // 200=nur tiefste Frequenzen hörbar (Faktor 2, Nullstelle bei SR/4).
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
            // MIDI-Learn-Feinschliff (@dpa 20260722_152438, ddw.md): kbMidiRange AN = eingehende
            // MIDI-Noten außerhalb des GERADE SICHTBAREN Tastenbereichs (kbStart…+kbOctaves)
            // werden ignoriert, statt unsichtbar mitzuspielen. kbMidiOffset verschiebt jede
            // eingehende Note um N Oktaven, BEVOR sie geprüft/gespielt wird — für ein MIDI-
            // Keyboard, das in einer anderen Oktavlage steht als der angezeigte Bereich.
            kbMidiRange: false,
            kbMidiOffset: 0,
            // Gelernter MIDI-Kanal (@dpa-Vorwurf 20260723 aus PLAN_OPERA.md 1.2: der „besondere"
            // Learn kalibrierte bisher nur das Offset und LÖSCHTE die Bindung sofort wieder —
            // kein Kanal wurde tatsächlich gelernt. Jetzt bleibt die Bindung, der Kanal wird
            // hier gespiegelt und ist ein AKTIVER Filter in PlayKeyboard._onMidiMessage (0 = alle
            // Kanäle, wie überall in keymidi/Midi.js).
            kbMidiChannel: 0,
            // BaseKeyboard-MIDI (@dpa 20260722_155726, ddw.md): eingehende MIDI-Noten setzen
            // direkt die Basis-Tonklasse (Note mod 12) — NUR bei Quelle „Ton" (s. BaseKeyboard.js
            // _onMidiMessage). baseMidiRange AN: nur Noten aus der GELERNTEN Oktave (baseMidiOctave,
            // via das custom MIDI-Learn-Banner von u:baseKb kalibriert, @dpa 20260722_203201)
            // zählen, alle anderen Oktaven werden ignoriert. Beide leben NICHT mehr als Panel-
            // Toggle/Button (s. GROUPS['Base-Frq']), sondern im Lern-Banner (werkbank.js).
            baseMidiRange: false,
            baseMidiOctave: null,
            // s. kbMidiChannel oben — dasselbe Prinzip für BaseKeyboard.js.
            baseMidiChannel: 0,
            // Akkord-Speicher (@dpa 20260722, ddw.md Z.466–468, Gate-Umbau 20260722_013727):
            // ein belegter Speicher-Slot IST das Gate — kein separater AkIO-Button mehr („AkIO
            // brauchen wir nicht — die Gate-Funktion gehört auf die Speicher-Buttons"). Der
            // Speicher schnappt die im Trigger-Moment aktiven Tasten in ein Slot-Raster
            // (akMemCols×akMemRows, Menge einstellbar); Slot halten = Gate an (kurz NoteOff-
            // alt→NoteOn-neu), loslassen = Release, bei aktivem akReset [R] = Slot löschen statt
            // abrufen. akMemory reist als Teil des polySynthState in der Snapshot-/Config-Kette
            // mit (keine eigene Persistenz).
            // akReset ist seit @dpa 20260722_194404 ein w:-Wechsel-Button (GroupHost.js
            // makeWechsel) — sein State IST der Modus-Index: 0 use · 1 over · 2 kill
            // (ChordMemory._curMode() liest ihn direkt, keine externe Naht mehr nötig).
            // Raster-Maße/Farben/Slot-Größe liegen als Control-Style (ctrlStyles['u:speicher']),
            // NUR über die Speicher-Settings einstellbar (@dpa 20260722_004312) — keine Panel-Knobs.
            akReset: 0,
            akMemory: [],       // Slots: je null (leer) oder [{note,vel}, …] (gemerkter Akkord)
            akMemLabels: {},    // eigene Kürzel je Slot-Index (Doppelklick); leer = Nummer ab 1
        },

        KNOBS: {
            baseHz:        { label: 'Base-Frq',  min: 1,    max: 500,  curve: 'log',    unit: ' Hz', decimals: 1 },
            baseBand:      { label: 'Band',      min: 0.05, max: 8000, curve: 'log',    unit: ' Hz', decimals: 0,
                             // Dezimalstellen kommen aus den Settings (Dez.-Feld, @dpa 20260722_013727)
                             // statt aus einer eigenen, vom Settings-Feld unabhängigen Rundung.
                             formatValue: (v, d) => `${v.toFixed(d)}–${(v * 2).toFixed(d)}` },
            kammerton:     { label: 'Kammerton', min: 400,  max: 480,  step: 1, curve: 'linear', unit: ' Hz', decimals: 0 },
            harmonizeMix:  { label: 'Harmonize', min: 0,    max: 1,    curve: 'linear', unit: '',    decimals: 2 },
            pitchSmooth:   { label: 'Pitch-Glide', min: 0,  max: 1,    curve: 'linear', unit: ' s',  decimals: 2 },
            duty:          { label: 'PW',        min: 0.01, max: 0.99, curve: 'linear', unit: '',    decimals: 2 },
            fmFeedback:    { label: 'FM',        min: 0,    max: 1,    curve: 'linear', unit: '',    decimals: 2 },
            polyMax:       { label: 'Poly',      min: 1,    max: 8,    step: 1, curve: 'linear', unit: '', decimals: 0 },
            detune:        { label: 'Detune',    min: 0,    max: 99,   step: 1, curve: 'linear', unit: ' ct', decimals: 0 },
            oscTilt:       { label: 'Höhen-Dämpf', min: 0,   max: 200,  step: 1, curve: 'linear', unit: '',    decimals: 0 },
            ampAttack:     { label: 'Attack',     min: 0,    max: 2,    curve: 'linear', unit: ' s', decimals: 2 },
            ampDecay:      { label: 'Decay',      min: 0,    max: 2,    curve: 'linear', unit: ' s', decimals: 2 },
            ampSustain:    { label: 'Sustain',     min: 0,    max: 1,    curve: 'linear', unit: '',   decimals: 2 },
            ampRelease:    { label: 'Release',    min: 0,    max: 3,    curve: 'linear', unit: ' s', decimals: 2 },
            kbStart:       { label: 'Oktav-Start', min: 0,  max: 7,    step: 1, curve: 'linear', unit: '', decimals: 0,
                             formatValue: (v) => 'C' + Math.round(v) },
            kbOctaves:     { label: 'Oktaven',    min: 1,    max: 9,    step: 1, curve: 'linear', unit: '', decimals: 0 },
            kbMidiOffset:  { label: 'MIDI-Okt-Off', min: -4,  max: 4,    step: 1, curve: 'linear', unit: '', decimals: 0 },
        },

        SELECTS: {
            baseSrc:   { label: 'BaseFrq-Quelle', options: ['Freq', 'Tempo', 'Ton'] },
            oscEngine: { label: 'Engine', options: ['Square-PW', 'Sine-FM'] },
        },

        TOGGLES: {
            osc2On:     { label: 'Osc2', title: 'Zweiter Oszillator pro Stimme, symmetrisch um ±Detune/2 Cent verstimmt (Schwebung). Aus = nur Osc1 exakt auf der Note, ohne zweiten Node.' },
            voiceSteal: { label: 'Stealing', title: 'Bei voller Polyphonie (Poly): AN = älteste gehaltene Note sanft stehlen, AUS = neue Note ignorieren. Finaler Default noch @dpa nach dem Hören.' },
        },

        // kbHold als Button statt Checkbox (@dpa: „hold bitte als Button") — bleibt inhaltlich
        // derselbe polySynthState-Key wie vorher (Snapshot-/Config-Kette unverändert), nur die
        // UI ist jetzt der Button; werkbank.js hält isOn synchron (onAction + state.subscribe
        // → setCtrlOn), weil BUTTONS anders als TOGGLES nicht automatisch an den State
        // gebunden sind (s. GroupHost.makeButton/makeToggle).
        BUTTONS: {
            kbHold:  { label: 'Hold', mode: 'toggle', title: 'AN: losgelassene Tasten klingen weiter, NoteOffs laufen erst nach, wenn Hold wieder ausgeschaltet wird. Gilt für Maus UND MIDI-Eingang gleichermaßen.', onClick: () => onAction('kbHold') },
            // Akkord-Transponieren (@dpa 20260722_152438, ddw.md): reiner Impuls (kein
            // an/aus-Zustand) — jeder Klick verschiebt den GERADE klingenden Akkord live um
            // einen Halbton, ohne Neuanschlag (PlayKeyboard.transposeActive/engine.transposeHeld).
            chordDown: { label: '−', mode: 'trigger', title: 'Aktuell klingenden Akkord live einen Halbton nach unten.', onClick: () => onAction('chordDown') },
            chordUp:   { label: '+', mode: 'trigger', title: 'Aktuell klingenden Akkord live einen Halbton nach oben.', onClick: () => onAction('chordUp') },
        },

        // Wechsel-Button (@dpa 20260722_194404, ddw.md: „ein besseres Kürzel für
        // wechselButton" → `w:`, GroupHost.js makeWechsel): [R] durchschaltbar statt binär,
        // jetzt generisch mit n=3 fest vorgegebenen, KI-vorgefertigten Stufen (Caption/Farbe/
        // Kurzbeschreibung bleiben in den Settings editier-/umsortierbar).
        WECHSEL: {
            akReset: {
                label: 'R',
                modes: [
                    { caption: 'use', color: '', desc: 'Normales Speicher-Verhalten: leerer Slot merkt den aktuellen Akkord, belegter Slot ist ein Gate (halten = klingt, loslassen = Release).' },
                    { caption: 'over', color: '#7a3d1a', desc: 'Jeder Klick überschreibt den geklickten Slot sofort mit dem aktuellen Akkord — auch schon belegte Slots, ohne Gate.' },
                    { caption: 'kill', color: '#7a1a1a', desc: 'Jeder Klick löscht einen belegten Slot sofort, ohne Gate.' },
                ],
                // Kein onClick nötig: ChordMemory.js liest den Modus-Index direkt aus dem
                // geteilten polySynthState (this.state.get('akReset')), keine externe Naht.
            },
        },

        GROUPS: [
            {
                name: 'Base-Frq',
                selects: ['baseSrc'],
                // baseMidiRange/baseMidiLearn NICHT mehr hier (@dpa 20260722_203201: „genauso
                // wie in Keyboard/Keyboard" ins Lernfenster) — leben jetzt im custom MIDI-
                // Learn-Banner von u:baseKb (werkbank.js), Zustand/Defaults unverändert im State.
                knobs: ['baseBand', 'baseHz', 'kammerton', 'harmonizeMix', 'pitchSmooth'],
            },
            {
                name: 'Audio-Osz',
                selects: ['oscEngine'],
                toggles: ['osc2On', 'voiceSteal'],
                knobs: ['duty', 'fmFeedback', 'polyMax', 'detune', 'oscTilt'],
            },
            {
                name: 'Amp-Env',
                knobs: ['ampAttack', 'ampDecay', 'ampSustain', 'ampRelease'],
            },
            {
                name: 'Keyboard',
                buttons: ['kbHold', 'chordDown', 'chordUp'],
                wechsel: ['akReset'],
                // kbMidiRange/kbMidiOffset NICHT mehr hier (@dpa 20260722_194404: „sollen in
                // (den speziellen) Midilearn fenster") — leben jetzt im custom MIDI-Learn-
                // Banner von u:playKb (werkbank.js), Zustand/Defaults unverändert im State.
                knobs: ['kbStart', 'kbOctaves'],
            },
        ],

        // Port-Schema (Phase 2, PLAN_OPERA.md/PHASE2_SPEC.md): reine Metadaten, KEIN Verhalten
        // hier — die Bindung (read/write) macht werkbank.js beim registerModule() der Registry.
        ports: {
            outputs: [
                { id: 'baseFreq', label: 'BaseFrq (Hz)', type: 'OSZ-F' },
                { id: 'baseTone', label: 'BaseFreq-Ton', type: 'BaseFreq-Ton' },
            ],
            inputs: [
                { id: 'trig', label: 'Trigger', type: 'AmpEnv' },
            ],
        },
    };
}
