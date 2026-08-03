/**
 * adsrOsc/defs.js – deklarative Controls für das ADSR+OSZ-Instrument (@dpa 20260803).
 *
 * Drei Gruppen:
 *   - "Oszillator": Wellenform, Grundfrequenz, FM-Intensität (wie stark die Pitch-ADSR
 *     die Frequenz moduliert), Amp-Offset (Grundlautstärke) + Gate-Button.
 *   - "Amp-ADSR": Hüllkurve auf die Lautstärke (A/D/S/R, Peak, Len, Trig/Gate, inv).
 *   - "Pitch-ADSR": Hüllkurve auf die Frequenz (multiplikativ, Sine-FM-artig).
 *
 * Die ADSR-Gruppen teilen sich die Key-Namen mit multiEnv.js (adsrA/adsrD/…), damit die
 * vorhandenen DSP-Bausteine (AdsrCore/EnvEngine) 1:1 wiederverwendet werden können. Die
 * beiden Envelopes bekommen je einen eigenen State-Scope (Amp-Env ohne Suffix, Pitch-Env
 * mit Suffix '_p'), s. engine.js.
 */
export function adsrOscDefs({ onAction } = {}) {
    return {
        DEFAULTS: {
            // Oszillator
            oscWave: 'sine',        // sine | square | saw | triangle
            oscFreq: 220,           // Grundfrequenz in Hz
            fmAmount: 0.5,          // 0..1 – wie stark die Pitch-ADSR die Frequenz moduliert
            ampOffset: 0.0,         // 0..1 – Grundlautstärke ohne Amp-Env (0 = nur Env)
            // Amp-ADSR (Suffix '' – Scope 'amp')
            adsrA: 0.01, adsrD: 0.15, adsrS: 0.7, adsrR: 0.3,
            adsrPeak: 1, adsrAOn: true, adsrDOn: true, adsrSOn: true, adsrROn: true,
            adsrInv: false, adsrVerlauf: false,
            adsrACurve: 'lin', adsrDCurve: 'log', adsrRCurve: 'log',
            adsrASkew: 1, adsrDSkew: 1, adsrRSkew: 1,
            adsrTrigMode: 'trig', adsrLenUnit: 'ms', adsrLenMs: 300, adsrLenBeat: 1,
            adsrLenFest: true, adsrNullpunkt: false, adsrOutput: 'amp',
            // Pitch-ADSR (Suffix '_p' – Scope 'pitch')
            adsrA_p: 0.01, adsrD_p: 0.15, adsrS_p: 0.5, adsrR_p: 0.3,
            adsrPeak_p: 1, adsrAOn_p: true, adsrDOn_p: true, adsrSOn_p: true, adsrROn_p: true,
            adsrInv_p: false, adsrVerlauf_p: false,
            adsrACurve_p: 'lin', adsrDCurve_p: 'log', adsrRCurve_p: 'log',
            adsrASkew_p: 1, adsrDSkew_p: 1, adsrRSkew_p: 1,
            adsrTrigMode_p: 'trig', adsrLenUnit_p: 'ms', adsrLenMs_p: 300, adsrLenBeat_p: 1,
            adsrLenFest_p: true, adsrNullpunkt_p: false, adsrOutput_p: 'pitch',
        },
        KNOBS: {
            oscFreq: { label: 'Freq', min: 20, max: 2000, step: 1, unit: 'Hz', default: 220 },
            fmAmount: { label: 'FM', min: 0, max: 1, step: 0.01, default: 0.5 },
            ampOffset: { label: 'Amp', min: 0, max: 1, step: 0.01, default: 0 },
            // Amp-ADSR
            adsrA: { label: 'A', min: 0.001, max: 5, step: 0.001, unit: 's', default: 0.01 },
            adsrD: { label: 'D', min: 0.001, max: 5, step: 0.001, unit: 's', default: 0.15 },
            adsrS: { label: 'S', min: 0, max: 1, step: 0.01, default: 0.7 },
            adsrR: { label: 'R', min: 0.001, max: 5, step: 0.001, unit: 's', default: 0.3 },
            adsrPeak: { label: 'Peak', min: 0, max: 2, step: 0.01, default: 1 },
            adsrLenMs: { label: 'Len', min: 10, max: 5000, step: 10, unit: 'ms', default: 300 },
            adsrLenBeat: { label: 'Len', min: 0.1, max: 16, step: 0.1, unit: 'b', default: 1 },
            // Pitch-ADSR
            adsrA_p: { label: 'A', min: 0.001, max: 5, step: 0.001, unit: 's', default: 0.01 },
            adsrD_p: { label: 'D', min: 0.001, max: 5, step: 0.001, unit: 's', default: 0.15 },
            adsrS_p: { label: 'S', min: 0, max: 1, step: 0.01, default: 0.5 },
            adsrR_p: { label: 'R', min: 0.001, max: 5, step: 0.001, unit: 's', default: 0.3 },
            adsrPeak_p: { label: 'Peak', min: 0, max: 2, step: 0.01, default: 1 },
            adsrLenMs_p: { label: 'Len', min: 10, max: 5000, step: 10, unit: 'ms', default: 300 },
            adsrLenBeat_p: { label: 'Len', min: 0.1, max: 16, step: 0.1, unit: 'b', default: 1 },
        },
        SELECTS: {
            oscWave: { label: 'Wave', options: ['sine', 'square', 'saw', 'triangle'], default: 'sine' },
        },
        TOGGLES: {
            adsrAOn: { label: 'A', default: true },
            adsrDOn: { label: 'D', default: true },
            adsrSOn: { label: 'S', default: true },
            adsrROn: { label: 'R', default: true },
            adsrInv: { label: 'Inv', default: false },
            adsrVerlauf: { label: 'Verlauf', default: false },
            adsrAOn_p: { label: 'A', default: true },
            adsrDOn_p: { label: 'D', default: true },
            adsrSOn_p: { label: 'S', default: true },
            adsrROn_p: { label: 'R', default: true },
            adsrInv_p: { label: 'Inv', default: false },
            adsrVerlauf_p: { label: 'Verlauf', default: false },
        },
        SEGMENTS: {
            adsrTrigMode: { label: 'Trig', options: ['trig', 'gate'], default: 'trig' },
            adsrTrigMode_p: { label: 'Trig', options: ['trig', 'gate'], default: 'trig' },
        },
        BUTTONS: {
            gate: { label: 'Gate', mode: 'gate', default: false, onClick: (key, phase) => onAction(key, phase) },
            adsrLenFest: { label: 'Fest', mode: 'toggle', default: true },
            adsrLenFest_p: { label: 'Fest', mode: 'toggle', default: true },
        },
        GROUPS: [
            { name: 'Oszillator', selects: ['oscWave'], knobs: ['oscFreq', 'fmAmount', 'ampOffset'], buttons: ['gate'] },
            { name: 'Amp-ADSR', knobs: ['adsrA', 'adsrD', 'adsrS', 'adsrR', 'adsrPeak', 'adsrLenMs', 'adsrLenBeat'], toggles: ['adsrAOn', 'adsrDOn', 'adsrSOn', 'adsrROn', 'adsrInv', 'adsrVerlauf'], segments: ['adsrTrigMode'], buttons: ['adsrLenFest'] },
            { name: 'Pitch-ADSR', knobs: ['adsrA_p', 'adsrD_p', 'adsrS_p', 'adsrR_p', 'adsrPeak_p', 'adsrLenMs_p', 'adsrLenBeat_p'], toggles: ['adsrAOn_p', 'adsrDOn_p', 'adsrSOn_p', 'adsrROn_p', 'adsrInv_p', 'adsrVerlauf_p'], segments: ['adsrTrigMode_p'], buttons: ['adsrLenFest_p'] },
        ],
    };
}