/**
 * multiEnv.js — Multi-ADSR-Manager für PolySynth (ddw.md 20260725)
 *
 * Vervielfältigbare ADSR-Envelopes nach dem Multi-Sq-Muster: Jede Instanz ist eine
 * eigene GroupHost-Gruppe mit indizierten State-Keys (adsrA_0, adsrD_0, …).
 * Werte-Knobs (A,D,S,R,Peak,GateLen,Len) auf dem Panel; Settings (aktiv, Kurven,
 * Verlauf, Trig/Gate, Skew) im Gruppen-Rechtsklick-Panel via groupKindSettings-Hook.
 *
 * Engine: envCore.js (SR-basiert, setValueCurveAtTime). Ausgabe als Audio-Param-
 * Kurve auf einem GainNode; der aktuelle Wert ist per read() abrufbar (Value-Port).
 *
 * Nahtstellen: init() (Migration + Instanzen bauen), addEnv()/removeEnv() (+/−),
 * reconcile() (Recall), triggerAll() (für alle Instanzen).
 */
import { AdsrCore, msToSamples } from './envCore.js';
import { ensureAudio as ensureBus, getContext } from '../audioBus.js';

const VALUE_KEYS = [
    'adsrA', 'adsrD', 'adsrS', 'adsrR', 'adsrPeak', 'adsrGateLen', 'adsrLen',
    'adsrAOn', 'adsrDOn', 'adsrSOn', 'adsrROn', 'adsrInv', 'adsrVerlauf',
    'adsrACurve', 'adsrDCurve', 'adsrRCurve',
    'adsrASkew', 'adsrDSkew', 'adsrRSkew',
    'adsrTrigMode', 'adsrLenUnit', 'adsrOutput',
];

function envName(i) { return i === 0 ? 'ADSR' : 'ADSR ' + (i + 1); }

function scoped(st, sfx) {
    return { get: (k) => st.get(k + sfx), set: (k, v) => st.set(k + sfx, v) };
}

/**
 * Eine Env-Engine-Instanz. Nutzt AdsrCore für die Kurven und plant sie auf
 * einem GainNode via setValueCurveAtTime.
 */
class EnvEngine {
    constructor(state) {
        this.state = state;
        this._core = new AdsrCore();
        this._gain = null;
        this._getBpm = () => 120;
        this._gate = false;
    }

    _audio() {
        ensureBus();
        const ctx = getContext();
        if (!this._gain) {
            this._gain = ctx.createGain();
            this._gain.gain.value = 0;
        }
        return ctx;
    }

    read() {
        return this._gain ? this._gain.gain.value : 0;
    }

    setBpmSource(fn) { this._getBpm = fn || (() => 120); }

    _cfg() {
        const get = (k) => this.state.get(k);
        const bpm = this._getBpm();
        const lenUnit = get('adsrLenUnit') || 'ms';
        const lenMs = lenUnit === 'beats' ? (get('adsrLen') ?? 0) * 60000 / bpm : (get('adsrLen') ?? 0);
        const sr = this._audio().sampleRate;
        return {
            a: get('adsrA') ?? 0.01,
            d: get('adsrD') ?? 0.15,
            s: get('adsrS') ?? 0.7,
            r: get('adsrR') ?? 0.3,
            peak: get('adsrPeak') ?? 1,
            gateLen: get('adsrGateLen') ?? 0.1,
            aOn: !!get('adsrAOn'),
            dOn: !!get('adsrDOn'),
            sOn: !!get('adsrSOn'),
            rOn: !!get('adsrROn'),
            inv: !!get('adsrInv'),
            verlauf: !!get('adsrVerlauf'),
            aCurve: get('adsrACurve') || 'lin',
            dCurve: get('adsrDCurve') || 'log',
            rCurve: get('adsrRCurve') || 'log',
            aSkew: get('adsrASkew') ?? 1,
            dSkew: get('adsrDSkew') ?? 1,
            rSkew: get('adsrRSkew') ?? 1,
            trigMode: get('adsrTrigMode') || 'trig',
            lenSamples: msToSamples(lenMs, sr),
        };
    }

    trigger() {
        const ctx = this._audio();
        const t = ctx.currentTime;
        const cfg = this._cfg();
        const { curve, duration, startOffset } = this._core.trigger(cfg, ctx.sampleRate);
        const param = this._gain.gain;
        param.cancelScheduledValues(t);
        param.setValueAtTime(param.value, t);
        param.setValueCurveAtTime(curve, t + startOffset, duration);
        this._gate = true;
    }

    gateOn() {
        if (this._cfg().trigMode === 'trig') { this.trigger(); return; }
        this._gate = true;
        this.trigger();
    }

    gateOff() {
        if (!this._gate) return;
        const cfg = this._cfg();
        if (cfg.trigMode === 'trig') return;
        this._gate = false;
        const ctx = this._audio();
        const t = ctx.currentTime;
        const current = this._gain.gain.value;
        const { curve, duration } = this._core.gateOff(cfg, ctx.sampleRate, current);
        const param = this._gain.gain;
        param.cancelScheduledValues(t);
        param.setValueAtTime(current, t);
        param.setValueCurveAtTime(curve, t, duration);
    }
}

/**
 * Manager für dynamische ADSR-Instanzen (Multi-Sq-Muster).
 */
export function createEnvManager({ host, state, defs, tpl, routing, getBpm }) {
    const engines = [];

    function buildEnv(i) {
        const sfx = '_' + i;
        for (const k of Object.keys(tpl.KNOBS)) defs.KNOBS[k + sfx] = tpl.KNOBS[k];
        for (const k of Object.keys(tpl.DEFAULTS)) defs.DEFAULTS[k + sfx] = tpl.DEFAULTS[k];

        for (const k of VALUE_KEYS) {
            if (state.get(k + sfx) === undefined) state.set(k + sfx, tpl.DEFAULTS[k]);
        }

        host.addGroup({
            name: envName(i),
            knobs: Object.keys(tpl.KNOBS).map((k) => k + sfx),
            groupKind: 'ADSR',
            instanceSuffix: sfx,
            extraSoundKeys: VALUE_KEYS,
        });

        const st = scoped(state, sfx);
        const eng = new EnvEngine(st);
        eng.setBpmSource(getBpm);
        engines[i] = eng;
    }

    function teardownLast() {
        const i = engines.length - 1;
        if (i < 0) return;
        const sfx = '_' + i;
        engines.splice(i, 1);
        host.removeGroup(envName(i));
        for (const k of VALUE_KEYS) state.remove(k + sfx);
        for (const k of Object.keys(tpl.KNOBS)) delete defs.KNOBS[k + sfx];
        for (const k of Object.keys(tpl.DEFAULTS)) delete defs.DEFAULTS[k + sfx];
    }

    function reconcile() {
        let want = state.get('adsrCount');
        if (!(want >= 1)) want = 1;
        while (engines.length < want) buildEnv(engines.length);
        while (engines.length > want) teardownLast();
        state.set('adsrCount', engines.length);
        return engines.length;
    }

    function init() {
        if (state.get('adsrCount') == null) state.set('adsrCount', 1);
        reconcile();
    }

    function addEnv() {
        state.set('adsrCount', engines.length + 1);
        reconcile();
    }

    function removeEnv() {
        if (engines.length <= 1) return false;
        state.set('adsrCount', engines.length - 1);
        reconcile();
        return true;
    }

    function triggerAll() {
        for (const eng of engines) eng.trigger();
    }

    return { init, addEnv, removeEnv, engines, reconcile, triggerAll };
}
