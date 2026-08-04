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
 *
 * Ports (@dpa 20260804, Nachrüstung „echte Ein-/Ausgänge statt harter Verdrahtung" —
 * s. docs/CONTROLS.md „Pflicht-Rückfragen" Punkt 1): Amp-/Pitch-ADSR-Ausgang und die
 * Oszillator-Modulationseingänge sind jetzt echte `ports` (Metadaten hier, Bindung/
 * Default-Verdrahtung in pitchosc.js). Vorher moduliierte engine.js den eigenen Oszillator
 * fest im JS-Code — das war nach der alten Regel „bei explizit genannter Verbindung fest
 * verdrahten" erlaubt, @dpa möchte es aber nachträglich auf Ports umstellen.
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
                // adsrOutput (Output-PickMenu, s. pitchosc.js createAdsrOutputPicker()) ist
                // KEIN Knob/Select aus defs.KNOBS/SELECTS — extraSoundKeys nimmt den Key
                // trotzdem in Sound-Snapshots/Combos auf (1:1 das multiEnv.js-Muster,
                // dort über addGroup() statt einer statischen GROUPS-Zeile gesetzt).
                extraSoundKeys: ['adsrOutput'],
            },
            {
                ...adsrGroupDef('Pitch-ADSR', '_p'),
                toggles: ['adsrAOn_p', 'adsrDOn_p', 'adsrSOn_p', 'adsrROn_p', 'adsrInv_p', 'adsrVerlauf_p'],
                segments: ['adsrTrigMode_p'],
                extraSoundKeys: ['adsrOutput_p'],
            },
        ],
        // Port-Schema (Phase 2, PLAN_OPERA.md/PHASE2_SPEC.md; ddw.md 20260804 Nachrüstung):
        // reine Metadaten, KEIN Verhalten — Bindung (read/write) macht pitchosc.js beim
        // registerModule() der Registry (s. lib/routing/Registry.js bindPorts()). Ersetzt die
        // vorher intern im Engine-Code hartverdrahtete Amp-/Pitch-Modulation (@dpa 20260804:
        // „Ja! alles bekommt seine Ein- und Ausgänge (Panel oder 'versteckt' in Settings
        // einstellbar wie andere Controls)"). Default bleibt derselbe Klang (Amp-/Pitch-ADSR
        // modulieren weiterhin DIESEN Oszillator) — aber jetzt über eine echte, lösbare
        // routing.connect()-Verbindung statt festem JS (s. pitchosc.js, createAdsrOutputPicker
        // in lib/adsrPanel.js).
        ports: {
            outputs: [
                { id: 'ampOut', label: 'Amp-Env', type: 'Value', group: 'Amp-ADSR' },
                { id: 'pitchOut', label: 'Pitch-Env', type: 'Value', group: 'Pitch-ADSR' },
            ],
            inputs: [
                // min/max nötig, sonst filtert inputTargets() den Port als Ziel weg (Registry.js:
                // „Nur Ports, die eine Wertspanne DEKLARIEREN"). -1..1 deckt den unveränderten
                // Bereich UND inv (negative Env) ab. KEIN eigener Panel-Control (bleibt in den
                // Settings „versteckt", wie jeder andere reine Ziel-Port im Projekt — trig/clock/
                // baseFreqIn haben ebenfalls keinen eigenen Panel-Regler): sichtbar wird
                // stattdessen der AUSGANG, je ein Output-PickMenu auf Amp-ADSR/Pitch-ADSR
                // (lib/adsrPanel.js createAdsrOutputPicker(), Muster aus multiEnv.js).
                { id: 'ampIn', label: 'Amp-Mod', type: 'Value', min: -1, max: 1, stepSize: 0.01, offAllowed: true, group: 'Oszillator' },
                { id: 'pitchIn', label: 'Pitch-Mod', type: 'Value', min: -1, max: 1, stepSize: 0.01, offAllowed: true, group: 'Oszillator' },
            ],
        },
    };
}