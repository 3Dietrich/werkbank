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
 * vorhandenen DSP-Bausteine (AdsrCore/EnvEngine) 1:1 wiederverwendet werden können. Knobs/
 * Buttons/Settings/Defaults kommen aus lib/adsrPanel.js (@dpa 20260803, Nachbesserung) —
 * EINE Quelle statt einer Kopie hier: beide Gruppen tragen `groupKind:'ADSR'` (wie die
 * echte Multi-ADSR in polysynth/multiEnv.js) und unterscheiden sich nur über ihr
 * `instanceSuffix` ('' bzw. '_p') — GroupHost reicht das bei jedem Settings-Aufruf
 * automatisch an den EINEN gemeinsamen Hook durch (s. lib/adsrPanel.js Dateikopf), Amp und
 * Pitch bekommen dadurch garantiert getrennte State-Keys, nie einen gemeinsamen Speicher.
 */
import { adsrKnobs, adsrButtons, adsrGroupDef, adsrDefaultsFor } from '../adsrPanel.js';

export function adsrOscDefs({ onAction } = {}) {
    const knobsAmp = adsrKnobs();
    const knobsPitch = adsrKnobs();
    const suffixKeys = (obj, sfx) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k + sfx, v]));

    return {
        DEFAULTS: {
            // Oszillator
            oscWave: 'sine',        // sine | square | saw | triangle
            oscFreq: 220,           // Grundfrequenz in Hz
            fmAmount: 0.5,          // 0..1 – wie stark die Pitch-ADSR die Frequenz moduliert
            ampOffset: 0.0,         // 0..1 – Grundlautstärke ohne Amp-Env (0 = nur Env)
            // Amp-ADSR (Suffix '') + Pitch-ADSR (Suffix '_p') aus lib/adsrPanel.js, mit den
            // für dieses Instrument gehörten/bestätigten Abweichungen vom Baustein-Default
            // (Len 300ms/1 Beat statt 100ms/0 Beat, Pitch-Sustain 0.5 statt 0.7) — @dpas
            // Ohr-Regel: bestehende Klang-Defaults werden NICHT stillschweigend „korrigiert".
            ...adsrDefaultsFor(''),
            adsrLenMs: 300, adsrLenBeat: 1,
            ...adsrDefaultsFor('_p'),
            adsrS_p: 0.5, adsrLenMs_p: 300, adsrLenBeat_p: 1,
        },
        KNOBS: {
            oscFreq: { label: 'Freq', min: 20, max: 2000, step: 1, unit: 'Hz', default: 220 },
            fmAmount: { label: 'FM', min: 0, max: 1, step: 0.01, default: 0.5 },
            ampOffset: { label: 'Amp', min: 0, max: 1, step: 0.01, default: 0 },
            ...suffixKeys(knobsAmp, ''),
            ...suffixKeys(knobsPitch, '_p'),
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
            ...suffixKeys(adsrButtons(onAction), ''),
            ...suffixKeys(adsrButtons(onAction), '_p'),
        },
        GROUPS: [
            { name: 'Oszillator', selects: ['oscWave'], knobs: ['oscFreq', 'fmAmount', 'ampOffset'], buttons: ['gate'] },
            {
                ...adsrGroupDef('Amp-ADSR', ''),
                toggles: ['adsrAOn', 'adsrDOn', 'adsrSOn', 'adsrROn', 'adsrInv', 'adsrVerlauf'],
                segments: ['adsrTrigMode'],
            },
            {
                ...adsrGroupDef('Pitch-ADSR', '_p'),
                toggles: ['adsrAOn_p', 'adsrDOn_p', 'adsrSOn_p', 'adsrROn_p', 'adsrInv_p', 'adsrVerlauf_p'],
                segments: ['adsrTrigMode_p'],
            },
        ],
    };
}