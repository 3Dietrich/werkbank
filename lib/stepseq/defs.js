// defs.js — Stepsequenzer als eigenes ISM (@dpa 20260722_203201, ddw.md: „neues ISM
// Stepsequenzer: Stepsequenzer, Basisclock (n*BaseFreq) mit Teiler (Clock/n) als trigger
// source. Erstmal aus teslacoil 'rüberkopieren' und technisch einbinden. er kriegt ein
// Output selector - die kriegen im Moment AmpEnv mit OSZ)").
//
// Eigenes Instrument (eigener MiniState, eigene GroupHost-Gruppe), NICHT Teil der
// Poly-Synth-defs — die Basisclock hängt zwar an Poly-Synths BaseFreq (StepSeqEngine.js
// bekommt sie von außen gereicht, werkbank.js), aber Trigger-Takt/Muster sind ein
// eigenständiger Baustein, der später auch andere Ziele als „AmpEnv+OSZ" ansteuern können
// soll (daher der Output-Selector, statt fest zu verdrahten).
//
// Das Step-Muster selbst (seqLen/seqSteps) ist KEIN GROUPS-Knob, sondern das eigene
// `u:seqGrid`-Unikat-Control (lib/stepseq/ui/StepSeqGrid.js, mountInGroup in werkbank.js) —
// dieselbe Bauart wie Keyboard/Speicher in polysynth/defs.js.
import { makeSeqSteps } from '../stepSeq.js';

export function stepSeqDefs() {
    return {
        DEFAULTS: {
            seqEnabled: false,   // AN = Basisclock läuft, triggert die Output-Quelle bei jedem aktiven Step
            seqLen: 8,           // sichtbare/aktive Steps (1..SEQ_MAX)
            seqSteps: makeSeqSteps('first'),
            // Basisclock (@dpa 20260722_203201): Trigger-Hz = BaseFreq · Multiplikator ÷ Teiler.
            // An die Poly-Synth-BaseFreq gekoppelt statt ans Metronom-BPM — ein eigener,
            // audioratengebundener Puls (teslacoil-Ethos: „getakteter Puls-Synth").
            seqMult: 1,
            seqDiv: 16,
            // Output-Selector (@dpa: „er kriegt ein Output selector — die kriegen im Moment
            // AmpEnv mit OSZ"): aktuell EINE funktionierende Quelle, bewusst als Auswahl
            // angelegt statt fest verdrahtet, damit spätere Ziele nur eine neue Option +
            // Routing brauchen, keinen Umbau.
            seqOutput: 'AmpEnv+OSZ',
        },

        KNOBS: {
            seqMult: { label: 'Multiplikator', min: 1, max: 32, step: 1, curve: 'linear', unit: '×', decimals: 0 },
            seqDiv: { label: 'Teiler', min: 1, max: 256, step: 1, curve: 'linear', unit: '', decimals: 0 },
        },

        SELECTS: {
            seqOutput: { label: 'Output', options: ['AmpEnv+OSZ'] },
        },

        TOGGLES: {
            seqEnabled: { label: 'An', title: 'Basisclock läuft (BaseFreq × Multiplikator ÷ Teiler) — jeder aktive Step triggert die gewählte Output-Quelle.' },
        },

        GROUPS: [
            {
                name: 'Stepsequenzer',
                toggles: ['seqEnabled'],
                selects: ['seqOutput'],
                knobs: ['seqMult', 'seqDiv'],
            },
        ],
    };
}
