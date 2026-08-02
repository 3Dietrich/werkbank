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
import { knobsToPorts, buttonsToPorts, groupOfControl } from '../routing/portGen.js';

export function polySynthDefs(opts = {}) {
    const onAction = opts.onAction || (() => {});

    const DEFAULTS = {
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
        oscTilt: 0,         // Höhen-Dämpfung (@dpa ddw.md 20260724_003531, KORRIGIERTE Vorstellung
                            // ggü. dem ersten Versuch): NICHT die Obertöne der Wellenform, sondern
                            // das Amp-Verhältnis jeder gespielten Note zur BaseFreq selbst — ratio =
                            // freq/baseFreq, gain = ratio^(-tilt/100). 0→1 (unverändert), 100→1/ratio,
                            // >100 exponentiell gegen 0 (nie exakt 0). S. engine.js tiltGainFor().
        // Amp-Env (Poly-Synth-Schritt 4, @dpa 20260721): echtes ADSR statt der alten
        // Anti-Klick-Rampe. Attack linear, Decay/Release log (exponentiell) — Peak UND
        // Sustain hängen an DERSELBEN Velocity-Skalierung (kein zweiter Vel-Bezug).
        // Werte hier sind ein plausibler Startpunkt — @dpa stellt sie nach dem Hören ein.
        ampAttack: 0.01,    // s
        ampDecay: 0.15,     // s
        ampSustain: 0.7,    // 0..1, Anteil vom Peak
        ampRelease: 0.3,    // s
        // Amp-Env auf dieselbe Engine wie Multi-ADSR umgemodelt (@dpa dd.md 20260802:
        // "die Env auf die ADSR übermodeln, so dass sie die selben Einstellungen hat") —
        // Amp-Env nutzt jetzt PRO VOICE eine eigene envCore.js AdsrCore-Instanz statt der
        // hart verdrahteten linear/exponentialRamp-Aufrufe (s. engine.js spawnVoice/
        // releaseVoice). Defaults hier bilden das BISHERIGE Verhalten 1:1 nach (alle
        // Segmente an, A linear, D/R log, kein Skew, kein Invert/Verlauf) — reine
        // Erweiterung, kein Klangunterschied ohne @dpas Zutun. Kein Peak/Len/TrigMode/
        // Nullpunkt wie beim Multi-ADSR: Peak kommt aus der Velocity, Amp-Env bleibt
        // konzeptionell immer „Gate offen bis noteOff", kein Trig-Modus.
        ampAOn: true, ampDOn: true, ampSOn: true, ampROn: true,
        ampInv: false, ampVerlauf: false,
        ampACurve: 'lin', ampDCurve: 'log', ampRCurve: 'log',
        ampASkew: 1, ampDSkew: 1, ampRSkew: 1,
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
    };

    // KNOBS/BUTTONS als lokale Konstanten (Punkt 3b, ddw.md 20260724): werden UNTEN sowohl
    // fürs Panel als auch für die Sq-Ziel-Ports (ports.inputs, via portGen.js) wiederverwendet
    // — dieselbe Quelle, keine zweite Pflegestelle für min/max/Label.
    const KNOBS = {
        baseHz:        { label: 'Base-Frq',  min: 1,    max: 20000, curve: 'log',    unit: ' Hz', decimals: 1,
                         title: 'Grundfrequenz bei Quelle „Freq" (Hz) — der Bezugston, von dem aus alle Stimmen gespielt werden.' },
        baseBand:      { label: 'Band',      min: 0.05, max: 20000, curve: 'log',    unit: ' Hz', decimals: 0,
                         // Dezimalstellen kommen aus den Settings (Dez.-Feld, @dpa 20260722_013727)
                         // statt aus einer eigenen, vom Settings-Feld unabhängigen Rundung.
                         formatValue: (v, d) => `${v.toFixed(d)}–${(v * 2).toFixed(d)}`,
                         title: 'Register: die Grundfrequenz wird in dieses Hz-Band gefaltet (30 → 30–60 Hz), egal welche Quelle sie liefert.' },
        kammerton:     { label: 'Kammerton', min: 400,  max: 480,  step: 1, curve: 'linear', unit: ' Hz', decimals: 0,
                         title: 'Referenz-Frequenz A4 — wirkt auf ALLE Frequenzberechnungen dieses Instruments.' },
        harmonizeMix:  { label: 'Harmonize', min: 0,    max: 1,    curve: 'linear', unit: '',    decimals: 2,
                         title: 'Zieht die gespielten Töne von roh (0) auf ganzzahlige Vielfache der Basis (1) — aus Akkorden wird Obertonreihe.' },
        pitchSmooth:   { label: 'Pitch-Glide', min: 0,  max: 1000000, curve: 'linear', unit: ' s',  decimals: 2,
                         title: 'LP-Glide der Oszillator-Frequenz, wenn Base-Frq/Harmonize live eine gehaltene Note verschiebt. 0 = harter Sprung.' },
        duty:          { label: 'PW',        min: 0.01, max: 0.99, curve: 'linear', unit: '',    decimals: 2,
                         title: 'Pulsweite: Anteil der Periode im oberen Zustand. 0.5 = Rechteck, kleine Werte = dünn und nasal. Nur bei Engine Square-PW.' },
        fmFeedback:    { label: 'FM',        min: 0,    max: 1,    curve: 'linear', unit: '',    decimals: 2,
                         title: 'Wie stark der Sinus sich selbst moduliert — von rein (0) bis rau (1). Nur bei Engine Sine-FM.' },
        polyMax:       { label: 'Poly',      min: 1,    max: 8,    step: 1, curve: 'linear', unit: '', decimals: 0,
                         title: 'Wie viele Stimmen gleichzeitig klingen dürfen.' },
        detune:        { label: 'Detune',    min: 0,    max: 1000000, step: 1, curve: 'linear', unit: ' ct', decimals: 0,
                         title: 'Verstimmung in Cent zwischen Osc1/Osc2 (±Detune/2), erzeugt Schwebung. Wirkt nur bei Osc2 an.' },
        oscTilt:       { label: 'Höhen-Dämpf', min: 0,   max: 200,  step: 1, curve: 'linear', unit: '',    decimals: 0,
                         title: 'Dämpft hohe Noten gegenüber der Base-Frq: 0 = unverändert, 100 = Pegel folgt 1/Verhältnis, darüber exponentiell leiser.' },
        ampAttack:     { label: 'Attack',     min: 0,    max: 1000000, curve: 'linear', unit: ' s', decimals: 2,
                         title: 'Anstiegszeit der Lautstärke (s), linear. 0 = senkrechter Einsatz.' },
        ampDecay:      { label: 'Decay',      min: 0,    max: 1000000, curve: 'linear', unit: ' s', decimals: 2,
                         title: 'Abfallzeit vom Attack-Peak zum Sustain-Pegel (s), exponentiell.' },
        ampSustain:    { label: 'Sustain',     min: 0,    max: 1,    curve: 'linear', unit: '',   decimals: 2,
                         title: 'Haltepegel, solange die Note gehalten wird — Anteil vom Attack-Peak.' },
        ampRelease:    { label: 'Release',    min: 0,    max: 1000000, curve: 'linear', unit: ' s', decimals: 2,
                         title: 'Ausklingzeit NACH dem Loslassen der Note (s), exponentiell.' },
        kbStart:       { label: 'Oktav-Start', min: 0,  max: 7,    step: 1, curve: 'linear', unit: '', decimals: 0,
                         formatValue: (v) => 'C' + Math.round(v),
                         title: 'Oktave der untersten Taste des Keyboards.' },
        kbOctaves:     { label: 'Oktaven',    min: 1,    max: 9,    step: 1, curve: 'linear', unit: '', decimals: 0,
                         title: 'Anzahl der Oktaven, aufwärts ab Oktav-Start.' },
        kbMidiOffset:  { label: 'MIDI-Okt-Off', min: -4,  max: 4,    step: 1, curve: 'linear', unit: '', decimals: 0,
                         title: 'Verschiebt jede eingehende MIDI-Note um N Oktaven, bevor sie geprüft/gespielt wird.' },
    };

    const SELECTS = {
        baseSrc:   { label: 'BaseFrq-Quelle', options: ['Freq', 'Tempo', 'Ton'] },
        oscEngine: { label: 'Engine', options: ['Square-PW', 'Sine-FM'] },
    };

    const TOGGLES = {
        osc2On:     { label: 'Osc2', title: 'Zweiter Oszillator pro Stimme, symmetrisch um ±Detune/2 Cent verstimmt (Schwebung). Aus = nur Osc1 exakt auf der Note, ohne zweiten Node.' },
        voiceSteal: { label: 'Stealing', title: 'Bei voller Polyphonie (Poly): AN = älteste gehaltene Note sanft stehlen, AUS = neue Note ignorieren. Finaler Default noch @dpa nach dem Hören.' },
    };

    // kbHold als Button statt Checkbox (@dpa: „hold bitte als Button") — bleibt inhaltlich
    // derselbe polySynthState-Key wie vorher (Snapshot-/Config-Kette unverändert), nur die
    // UI ist jetzt der Button; werkbank.js hält isOn synchron (onAction + state.subscribe
    // → setCtrlOn), weil BUTTONS anders als TOGGLES nicht automatisch an den State
    // gebunden sind (s. GroupHost.makeButton/makeToggle).
    const BUTTONS = {
        kbHold:  { label: 'Hold', mode: 'toggle', title: 'AN: losgelassene Tasten klingen weiter, NoteOffs laufen erst nach, wenn Hold wieder ausgeschaltet wird. Gilt für Maus UND MIDI-Eingang gleichermaßen.', onClick: () => onAction('kbHold') },
        // Akkord-Transponieren (@dpa 20260722_152438, ddw.md): reiner Impuls (kein
        // an/aus-Zustand) — jeder Klick verschiebt den GERADE klingenden Akkord live um
        // einen Halbton, ohne Neuanschlag (PlayKeyboard.transposeActive/engine.transposeHeld).
        chordDown: { label: '−', mode: 'trigger', title: 'Aktuell klingenden Akkord live einen Halbton nach unten.', onClick: () => onAction('chordDown') },
        chordUp:   { label: '+', mode: 'trigger', title: 'Aktuell klingenden Akkord live einen Halbton nach oben.', onClick: () => onAction('chordUp') },
    };

    // Wechsel-Button (@dpa 20260722_194404, ddw.md: „ein besseres Kürzel für
    // wechselButton" → `w:`, GroupHost.js makeWechsel): [R] durchschaltbar statt binär,
    // jetzt generisch mit n=3 fest vorgegebenen, KI-vorgefertigten Stufen (Caption/Farbe/
    // Kurzbeschreibung bleiben in den Settings editier-/umsortierbar).
    const WECHSEL = {
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
    };

    // ── Multi-ADSR Template-Defs (ddw.md 20260725) ─────────────────────────────────
    // Die eigentlichen Gruppen baut der EnvManager dynamisch (wie Multi-Sq) — hier nur
    // die Template-KNOBS/BUTTONS (Panel) + SETTINGS (Rechtsklick-Panel) + DEFAULTS.
    // Gate-Button: ECHTER defs-BUTTON (ARCHITEKTUR.md „Buttons → Audio: onAction(id)"),
    // kein loses DOM-Element — bekommt so KeyMidi, Element-Settings, e-Mode gratis.
    const ADSR_BUTTONS = {
        adsrGate: { label: '⏵', mode: 'trigger',
                    title: 'Env manuell auslösen (Trig) bzw. Gate an/aus (Gate-Modus).',
                    // GroupHost ruft onClick(key, phase) mit dem ECHTEN, indizierten Key
                    // ('adsrGate_0', 'adsrGate_1', …) — der alte fest verdrahtete String
                    // 'adsrGate' (ohne Suffix) traf werkbank.js' `id.startsWith('adsrGate_')`
                    // nie, darum feuerte der Button bei KEINER Instanz jemals (@dpa 20260726:
                    // „egal wie ich sie starte, bleibt bei 000" — der Klick kam nie an).
                    onClick: (key, phase) => onAction(key, phase) },
        // Len: fest/offen (@dpa ddw.md 20260726, Struktur-Klärung „Gate Länge"): nur bei
        // Modus=Gate sichtbar/wirksam (Trig ist per Definition immer 'fest', s. adsrLenMs/
        // adsrLenBeat). AN (fest) = Len-Knob schließt automatisch nach fester Zeit. AUS
        // (offen) = Gate bleibt live an, bis ein ECHTES Gate-Off eintrifft (Button-Loslassen
        // bzw. externes Sq-Ziel auf 'gate') — kein Auto-Timer, kein Knob nötig (Panel frei
        // von der Zeitangabe, s. multiEnv.js updateVisibility). Logik in envCore.js.
        //
        // Korrektur (@dpa ddw.md 20260727: „GateLen/*beatLen — es ist nur GateLen zu sehen",
        // „'beat' Len habe ich schon länger nicht mehr gesehen", „unlogisch, dass es in
        // Settings 'ms' heißt und der Knob mit s arbeitet"): Es gab bis hierhin ZWEI separate
        // Zeit-Konzepte — `adsrLen(Ms/Beat)` fürs Trig-Ende und ein eigenes, IMMER in Sekunden
        // arbeitendes `adsrGateLen` fürs Gate+fest-Ende, das die Len-Einheit (ms/beats)
        // komplett ignorierte. Das war der eigentliche Bug: im Gate-Modus gab es NIE einen
        // Beat-Knob zu sehen, ganz gleich was man einstellte. Jetzt EIN Konzept: adsrLenMs/
        // adsrLenBeat bestimmen die Länge in BEIDEN Fällen — Trig-Ende UND (bei fest)
        // Gate-Auto-Close — dieselben zwei Knobs, dieselbe Len-Einheit-Umschaltung. `adsrGateLen`
        // entfällt ersatzlos.
        adsrLenFest: { label: 'Fest', mode: 'toggle',
                       title: 'Nur bei Modus=Gate: AN = schließt automatisch nach Len (ms/Beat, s. Len-Einheit). AUS (offen) = bleibt an, bis ein echtes Gate-Off kommt.',
                       onClick: (key) => onAction(key) },
    };

    const ADSR_KNOBS = {
        adsrA:       { label: 'A', min: 0, max: 1000000, curve: 'linear', unit: ' s', decimals: 3,
                       title: 'Attack-Zeit (s). 0 = senkrechter Einsatz.' },
        adsrD:       { label: 'D', min: 0, max: 1000000, curve: 'linear', unit: ' s', decimals: 3,
                       title: 'Decay-Zeit (s) vom Peak zum Sustain-Pegel.' },
        adsrS:       { label: 'S', min: 0, max: 1, curve: 'linear', unit: '', decimals: 2,
                       title: 'Sustain-Pegel — Anteil vom Peak.' },
        adsrR:       { label: 'R', min: 0, max: 1000000, curve: 'linear', unit: ' s', decimals: 3,
                       title: 'Release-Zeit (s) nach Gate-Ende.' },
        // Kein Deckel bei 1 mehr (@dpa 20260727_135331: "Peak ist noch gelimitiert ... DAS IST
        // FALSCH! Und soll so nicht mehr verbaut werden!!" — reflexhafte "zur Sicherheit"-
        // Obergrenzen sind ausdrücklich unerwünscht, s. envCore.js trigger()-Kommentar).
        // Großzügiger Maximalwert statt striktem Limit, @dpas eigenes Beispiel (1000000).
        adsrPeak:    { label: 'Peak', min: 0.01, max: 1000000, curve: 'linear', unit: '', decimals: 2,
                       title: 'Maximaler Env-Wert (0.01–1 üblich, nach oben absichtlich offen).' },
        // Len als ZWEI getrennte Knobs statt einem umschaltbaren (@dpa 20260726, ddw.md
        // Struktur-Klärung: „zwei Controls für die Zeitlänge, beat und time"): jede Einheit
        // merkt sich ihren EIGENEN Wert, Len-Einheit (Settings-Select) blendet nur um, welcher
        // gerade GILT — kein Wert geht beim Hin-/Herschalten verloren. EIN Konzept für BEIDE
        // Modi (@dpa 20260727-Korrektur, s. adsrLenFest-Kommentar oben): sichtbar im Trig-Modus
        // (immer „fest") UND im Gate-Modus bei Fest=an; im Gate-Modus bei Fest=offen versteckt
        // (kein Auto-Close nötig, s. multiEnv.js updateVisibility).
        adsrLenMs:   { label: 'Len', min: 0, max: 1000000, curve: 'linear', unit: ' ms', decimals: 0,
                       title: 'Länge in Millisekunden (0 = 1 Sample) — Trig-Ende, oder bei Gate+fest die Auto-Close-Zeit.' },
        adsrLenBeat: { label: 'Len', min: 0, max: 1000000, curve: 'linear', unit: ' beat', decimals: 2, step: 0.25,
                       title: 'Länge in Beats (0 = 1 Sample) — Trig-Ende, oder bei Gate+fest die Auto-Close-Zeit.' },
    };

    // Settings (keine Panel-Controls — erscheinen im Gruppen-Rechtsklick-Panel via
    // groupKindSettings-Hook). Die Engine liest die Werte direkt aus dem State.
    const ADSR_SETTINGS_TOGGLES = {
        adsrAOn:     { label: 'A aktiv', title: 'Attack aktiv.' },
        adsrDOn:     { label: 'D aktiv', title: 'Decay aktiv.' },
        adsrSOn:     { label: 'S aktiv', title: 'Sustain aktiv.' },
        adsrROn:     { label: 'R aktiv', title: 'Release aktiv.' },
        adsrInv:     { label: 'Inv', title: 'Invertiert — Env läuft negativ (0-basiert, Ende immer 0).' },
        adsrVerlauf: { label: 'Verlauf', title: 'AN: letzter Wert wird übernommen, Attack darauf angesetzt. AUS: Trigger startet von vorne mit Outin-Fade.' },
    };

    const ADSR_SETTINGS_SELECTS = {
        adsrACurve:  { label: 'A-Kurve', options: ['lin', 'log'] },
        adsrDCurve:  { label: 'D-Kurve', options: ['lin', 'log'] },
        adsrRCurve:  { label: 'R-Kurve', options: ['lin', 'log'] },
        adsrTrigMode: { label: 'Modus', options: ['trig', 'gate'] },
        adsrLenUnit: { label: 'Len-Einheit', options: ['ms', 'beats'] },
    };

    // Skew-Knobs (im Rechtsklick-Panel als Zahlenfelder, nicht als Panel-Knobs). Max großzügig
    // statt strikt bei 100 gedeckelt (@dpa 20260727_135331, dieselbe "keine Reflex-Limits"-
    // Regel wie bei Peak — s. envCore.js segmentCurve()-Kommentar).
    const ADSR_SETTINGS_SKEWS = {
        adsrASkew:   { label: 'A-Skew', min: 0.01, max: 1000000, default: 1 },
        adsrDSkew:   { label: 'D-Skew', min: 0.01, max: 1000000, default: 1 },
        adsrRSkew:   { label: 'R-Skew', min: 0.01, max: 1000000, default: 1 },
    };

    // Nullpunktversatz (@dpa ddw.md 20260727, „Bug2"): die Env kreist immer um IHREN eigenen
    // Nullpunkt (Ende der Kurve = 0). Ein Ziel, das aber um einen ANDEREN Wert herum arbeitet
    // (z.B. Frequenz-Multiplikator, Ruhepunkt = 1, nicht 0), braucht einen einstellbaren
    // Basis-Versatz AN DER ENV SELBST — statt einer ziel-spezifischen Sonderformel im Consumer
    // (das alte, jetzt zurückgebaute `1 + mod` fest in engine.js, s. dort). Bewusst ein
    // `Setting` (Rechtsklick-Panel), nicht gleich ein Panel-Knob — @dpa: „als Setting (was man
    // später vielleicht auf das Panel schalten kann, siehe todos)" — wartet auf den generellen
    // Panel↔Settings-Umschalter (todos.md).
    const ADSR_SETTINGS_NUMS = {
        adsrNullpunkt: { label: 'Nullpunktversatz', min: -1000000, max: 1000000, default: 0 },
    };

    // Amp-Env-Settings (dieselbe Struktur wie ADSR_SETTINGS_* oben, für den
    // groupKindSettings-Hook 'Amp-Env' in werkbank.js) — kein Trig/Len/Nullpunkt/Peak,
    // s. Kommentar an den amp*-DEFAULTS oben.
    const AMPENV_SETTINGS_TOGGLES = {
        ampAOn:     { label: 'A aktiv', title: 'Attack aktiv.' },
        ampDOn:     { label: 'D aktiv', title: 'Decay aktiv.' },
        ampSOn:     { label: 'S aktiv', title: 'Sustain aktiv.' },
        ampROn:     { label: 'R aktiv', title: 'Release aktiv.' },
        ampInv:     { label: 'Inv', title: 'Invertiert — Env läuft negativ (0-basiert, Ende immer 0).' },
        ampVerlauf: { label: 'Verlauf', title: 'AN: letzter Wert wird übernommen, Attack darauf angesetzt. AUS: Anschlag startet von vorne mit Outin-Fade.' },
    };

    const AMPENV_SETTINGS_SELECTS = {
        ampACurve: { label: 'A-Kurve', options: ['lin', 'log'] },
        ampDCurve: { label: 'D-Kurve', options: ['lin', 'log'] },
        ampRCurve: { label: 'R-Kurve', options: ['lin', 'log'] },
    };

    const AMPENV_SETTINGS_SKEWS = {
        ampASkew: { label: 'A-Skew', min: 0.01, max: 1000000, default: 1 },
        ampDSkew: { label: 'D-Skew', min: 0.01, max: 1000000, default: 1 },
        ampRSkew: { label: 'R-Skew', min: 0.01, max: 1000000, default: 1 },
    };

    const ADSR_DEFAULTS = {
        adsrA: 0.01, adsrD: 0.15, adsrS: 0.7, adsrR: 0.3,
        adsrPeak: 1,
        adsrAOn: true, adsrDOn: true, adsrSOn: true, adsrROn: true,
        adsrInv: false, adsrVerlauf: false,
        adsrACurve: 'lin', adsrDCurve: 'log', adsrRCurve: 'log',
        adsrASkew: 1, adsrDSkew: 1, adsrRSkew: 1,
        // 100ms Default (@dpa 20260727-Korrektur: adsrLenMs ersetzt das alte, separate
        // adsrGateLen — 100ms war dessen bisheriger Default, hörbar statt eines 0-Sample-Blips).
        adsrTrigMode: 'trig', adsrLenMs: 100, adsrLenBeat: 0, adsrLenUnit: 'ms',
        adsrLenFest: true,   // fest = altes Verhalten (Auto-Close nach Len), offen = neu
        adsrNullpunkt: 0,    // 0 = wie bisher (Env kreist um 0); 1 = z.B. für Frequenz-Ziele
        adsrOutput: '',
    };

    const GROUPS = [
        {
            name: 'Base-Frq',
            selects: ['baseSrc'],
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
            knobs: ['kbStart', 'kbOctaves'],
            extraSoundKeys: ['akMemory', 'akMemLabels'],
        },
        // Multi-ADSR: Platzhalter-Gruppe — die echten Instanzen baut der AdsrManager
        // dynamisch (wie Multi-Sq). Die Template-KNOBS/TOGGLES/SELECTS/DEFAULTS werden
        // pro Instanz indiziert (adsrA_0, adsrA_1, …).
        {
            name: 'Multi-ADSR',
            // Keine statischen Knobs/Toggles/Selects — alles dynamisch via Manager.
        },
    ];

    return {
        DEFAULTS, KNOBS, SELECTS, TOGGLES, BUTTONS, WECHSEL, GROUPS,
        // Multi-ADSR Template-Defs (ddw.md 20260725) — für createAdsrManager
        ADSR_KNOBS, ADSR_DEFAULTS, ADSR_BUTTONS,
        ADSR_SETTINGS_TOGGLES, ADSR_SETTINGS_SELECTS, ADSR_SETTINGS_SKEWS, ADSR_SETTINGS_NUMS,
        // Amp-Env-Settings (ddw.md 20260802: Amp-Env auf dieselbe ADSR-Engine übermodelt)
        AMPENV_SETTINGS_TOGGLES, AMPENV_SETTINGS_SELECTS, AMPENV_SETTINGS_SKEWS,

        // Port-Schema (Phase 2, PLAN_OPERA.md/PHASE2_SPEC.md): reine Metadaten, KEIN Verhalten
        // hier — die Bindung (read/write) macht werkbank.js beim registerModule() der Registry.
        ports: {
            outputs: [
                { id: 'baseFreq', label: 'BaseFrq (Hz)', type: 'OSZ-F' },
                { id: 'baseTone', label: 'BaseFreq-Ton', type: 'BaseFreq-Ton' },
            ],
            inputs: [
                // min/max/stepSize/offAllowed (Punkt 1, ddw.md): Ziel-Ergonomie fürs
                // dynamische Sq-Output-Menü (routing.inputTargets). NICHT die 1..99 aus dem
                // types.js-Kopfkommentar (das war nie die reale Zustellung) — werkbank.js
                // bindet `trig` direkt auf triggerFromEnv(v), das v als 0..1-Bruchteil
                // (envHeight, dieselbe Skala wie bisher StepSeqGrid) auf 1..127 Velocity
                // skaliert. offAllowed: Step „aus" ist kein echter Wert dieses Ziels.
                { id: 'trig', label: 'Trigger', type: 'AmpEnv', min: 0, max: 1, stepSize: 0, offAllowed: true },
                // Punkt 3b (ddw.md 20260724): „ALLE Buttons, Knobs, Speicher-Abrufe, Keyboards
                // als Ziele" — Knobs/Buttons dezentral aus KNOBS/BUTTONS abgeleitet (portGen.js,
                // dieselbe Quelle wie das Panel, keine doppelte Pflege). Speicher-Slot-Auswahl
                // und Keyboard-Note sind je EIN skalarer Port (kein dynamisches Slot-Raster in
                // ports.inputs möglich — Slot-Anzahl ist laufzeit-variabel).
                // Gruppen-Namen für das Sq-Output-Menü „ISM / Gruppe → Control" (@dpa
                // 20260725) — abgeleitet aus denselben GROUPS wie das Panel (portGen.js).
                ...knobsToPorts(KNOBS, undefined, groupOfControl(GROUPS)),
                ...buttonsToPorts(BUTTONS, ['chordUp', 'chordDown', 'kbHold'], groupOfControl(GROUPS)),
                { id: 'speicher', label: 'Speicher-Slot', type: 'Gate', min: 0, max: 32, stepSize: 1, offAllowed: true, group: 'Keyboard' },
                { id: 'note', label: 'Note (KB)', type: 'Value', min: 0, max: 127, stepSize: 1, offAllowed: true, group: 'Keyboard' },
                // Ton-Wahl der Basis-Tastatur (u:baseKb) als Sq-Ziel (@dpa ddw.md 20260724_153349:
                // "es fehlt mir PolySynth-TonWahl! Der sollte auf 1-12 (moduloed?) reagieren
                // können."). 1..12 statt 0..11 (lesbarer als Zähl-Skala). offAllowed:false: eine
                // Tonklasse kennt kein sinnvolles "Aus" wie ein Gate — jeder Step trägt IMMER
                // einen Wert (Grid startet damit im Werte-Modus, s. StepSeqGrid._offMode()).
                // Werte außerhalb 1..12 wickeln sich zyklisch um (werkbank.js: (v-1) mod 12,
                // dort auch der Zugriff auf NOTE_NAMES).
                { id: 'tonWahl', label: 'Ton-Wahl', type: 'Value', min: 1, max: 12, stepSize: 1, offAllowed: false, group: 'Base-Frq' },
                // Akkord-Frequenz-Modulation (ddw.md 20260725, Multi-ADSR Sonderwunsch):
                // preQuantMod — VOR der Quantisierung (harmonicSnap), postQuantMod — NACH der
                // Überblendung roh↔gerastet. Beide multiplizieren die Frequenz DIREKT mit mod
                // (ddw.md 20260727 „Bug2", zurückgebaut: KEIN festes `1+mod` mehr in engine.js —
                // der Ruhepunkt 1 kommt jetzt vom Nullpunktversatz-Setting der sendenden ADSR,
                // s. multiEnv.js flush()). min/max ±1 ist die deklarierte MODULATIONS-SPANNE
                // (wie stark die Env um ihren Nullpunkt herum ausschlägt), nicht der Ruhepunkt.
                { id: 'preQuantMod', label: 'Pre-Quant-Mod', type: 'Value', min: -1, max: 1, stepSize: 0.01, offAllowed: true, group: 'Base-Frq' },
                { id: 'postQuantMod', label: 'Post-Quant-Mod', type: 'Value', min: -1, max: 1, stepSize: 0.01, offAllowed: true, group: 'Base-Frq' },
            ],
        },
    };
}
