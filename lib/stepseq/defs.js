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
// Das Step-Muster selbst (seqLen/seqSteps) ist KEIN GROUPS-Knob, sondern das eigene
// `u:seqGrid`-Unikat-Control (lib/stepseq/ui/StepSeqGrid.js, mountInGroup in werkbank.js) —
// dieselbe Bauart wie Keyboard/Speicher in polysynth/defs.js.
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
            // Output-Selector (@dpa: „er kriegt ein Output selector — die kriegen im Moment
            // AmpEnv mit OSZ"): aktuell EINE funktionierende Quelle, bewusst als Auswahl
            // angelegt statt fest verdrahtet, damit spätere Ziele nur eine neue Option +
            // Routing brauchen, keinen Umbau.
            seqOutput: 'AmpEnv+OSZ',
        },

        KNOBS: {
            seqMult: { label: 'Multiplikator', min: 1, max: 32, step: 1, curve: 'linear', unit: '×', decimals: 0,
                       title: '1/1 = exakt ein Beat (seqMult=1, seqDiv=1). Höher = schneller/vervielfacht.' },
            seqDiv: { label: 'Teiler', min: 1, max: 256, step: 1, curve: 'linear', unit: '', decimals: 0,
                      title: '1/1 = exakt ein Beat (seqMult=1, seqDiv=1). Höher = langsamer/geteilt.' },
        },

        SELECTS: {
            seqOutput: { label: 'Output', options: ['AmpEnv+OSZ'] },
        },

        TOGGLES: {
            seqEnabled: { label: 'An', title: 'Scharf — läuft nur bei laufendem Transport (Takt/Metronom). Jeder aktive Step triggert dann die gewählte Output-Quelle, im Takt-Tempo (Beat × Multiplikator ÷ Teiler).' },
        },

        GROUPS: [
            {
                name: 'Stepsequenzer',
                toggles: ['seqEnabled'],
                selects: ['seqOutput'],
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
