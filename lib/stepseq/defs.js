// defs.js — Stepsequenzer als eigenes ISM (@dpa 20260722_203201, ddw.md: „neues ISM
// Stepsequenzer: Stepsequenzer, Basisclock (n*BaseFreq) mit Teiler (Clock/n) als trigger
// source. Erstmal aus teslacoil 'rüberkopieren' und technisch einbinden. er kriegt ein
// Output selector - die kriegen im Moment AmpEnv mit OSZ)").
//
// Eigenes Instrument (eigener MiniState, eigene GroupHost-Gruppe), NICHT Teil der
// Poly-Synth-defs — die Basisclock hängt seit PHASE4_SPEC.md Paket 4A am Takt-Tempo
// (getBeatDurMs-Closure, engine.js bekommt sie von außen gereicht, werkbank.js), nicht
// mehr an Poly-Synths BaseFreq. Trigger-Takt/Muster bleiben ein eigenständiger Baustein,
// der später auch andere Ziele als „AmpEnv+OSZ" ansteuern können soll (daher der
// Output-Selector, statt fest zu verdrahten).
//
// Das Step-MUSTER (seqSteps, das Werte-Array) ist KEIN GROUPS-Knob, sondern das eigene
// `u:seqGrid`-Unikat-Control (lib/stepseq/ui/StepSeqGrid.js, mountInGroup in werkbank.js) —
// dieselbe Bauart wie Keyboard/Speicher in polysynth/defs.js. seqLen (Anzahl sichtbarer
// Steps) ist dagegen seit @dpa 20260724_122929 ein GANZ NORMALER Knob (vorher ein
// handgebautes Zahlenfeld in StepSeqGrid.js) — dadurch bekommt er automatisch Rechtsklick-
// Settings (KnobMetaEditor) UND ist im e-Mode wie jeder andere Knob einzeln verschiebbar.
import { makeSeqSteps } from './seqCore.js';

export function stepSeqDefs() {
    return {
        DEFAULTS: {
            seqEnabled: false,   // AN = Basisclock ist scharf, läuft aber nur bei laufendem Transport
            seqLen: 8,           // sichtbare/aktive Steps (1..SEQ_MAX)
            seqSteps: makeSeqSteps('first'),
            // Basisclock (PHASE4_SPEC.md 4A.2): Trigger-Intervall = Beat-Dauer · Teiler ÷
            // Multiplikator. seqMult=1/seqDiv=1 → intervalMs == ein Beat, 1/1 trifft GENAU den
            // Takt-Klick — der Sequenzer ist ein Transport-Kind (Tempo/Start/Sync), kein
            // BaseFreq-gekoppelter Insel-Puls mehr.
            seqMult: 1,
            seqDiv: 1,
            // Output-Ziel (Punkt 1, ddw.md — @dpas Entscheidung: Ziele deklarieren sich
            // DEZENTRAL an ihren eigenen ports.inputs, keine feste Liste hier mehr). Der Wert
            // ist ein 'modul.port'-String aus der Registry (routing.inputTargets), NICHT mehr
            // das alte Enum 'AmpEnv+OSZ' — die PickMenu-UI dafür baut multiSq.js (nicht über
            // GROUPS/SELECTS, s. dort „warum kein <select>").
            seqOutput: 'polysynth.trig',
        },

        KNOBS: {
            seqMult: { label: 'Multiplikator', min: 1, max: 32, step: 1, curve: 'linear', unit: '×', decimals: 0,
                       title: '1/1 = exakt ein Beat (seqMult=1, seqDiv=1). Höher = schneller/vervielfacht.' },
            seqDiv: { label: 'Teiler', min: 1, max: 256, step: 1, curve: 'linear', unit: '', decimals: 0,
                      title: '1/1 = exakt ein Beat (seqMult=1, seqDiv=1). Höher = langsamer/geteilt.' },
            // @dpa 20260724_122929: "mach einen Knob aus 'Steps' [1-64]" — vorher ein
            // handgebautes Zahlenfeld in StepSeqGrid.js. Bewusst 1..64 (nicht SEQ_MAX=120,
            // s. seqCore.js): praktischer Bedienbereich über den Knob, das Pattern-Array
            // selbst bleibt technisch bis SEQ_MAX groß.
            seqLen: { label: 'Steps', min: 1, max: 64, step: 1, curve: 'linear', unit: '', decimals: 0,
                      title: 'Sichtbare/aktive Steps (1–64).' },
        },

        // Kein SELECTS.seqOutput mehr (Punkt 1, ddw.md): das Output-Ziel ist jetzt eine
        // PickMenu (multiSq.js buildSq(), dieselbe Bauart wie die Design-Presets-Menüs in
        // ElementSettings.js) statt eines <select> — dynamisch aus der Registry befüllt,
        // nicht aus einer festen Optionsliste hier.
        TOGGLES: {
            seqEnabled: { label: 'An', title: 'Scharf — läuft nur bei laufendem Transport (Takt/Metronom). Jeder aktive Step triggert dann die gewählte Output-Quelle, im Takt-Tempo (Beat × Multiplikator ÷ Teiler).' },
        },

        GROUPS: [
            {
                name: 'Stepsequenzer',
                toggles: ['seqEnabled'],
                knobs: ['seqMult', 'seqDiv'],
            },
        ],

        // Port-Schema (Phase 2, PLAN_OPERA.md/PHASE2_SPEC.md): reine Metadaten, KEIN Verhalten
        // hier — die Bindung (read/write) macht werkbank.js beim registerModule() der Registry.
        ports: {
            outputs: [
                { id: 'amp', label: 'AmpEnv+OSZ', type: 'AmpEnv' },
            ],
            inputs: [],
        },
    };
}
