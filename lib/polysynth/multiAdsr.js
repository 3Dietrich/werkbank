/**
 * multiAdsr.js — Multi-ADSR-Manager für PolySynth (@dpa ddw.md 20260725)
 *
 * Vervielfältigbare ADSR-Envelopes nach Vorbild der Multi-Sq-Architektur (multiSq.js):
 * Jede ADSR-Instanz ist eine eigene GroupHost-Gruppe mit indizierten State-Keys
 * (adsrA_0, adsrD_0, …). Engine läuft SR-basiert im Audio-Thread, Output als
 * kontinuierlicher Value-Port (pro Instanz ein Output-Element wie bei Seq).
 *
 * Kern-Features:
 * - A,D,S,R je aktiv/inv schaltbar
 * - A,D,R: lin/log mit skew in beiden Modi
 * - Verlauf on/off: off = Trigger startet von vorne mit Outin-Fade; on = letzter Wert
 *   wird übernommen, Attack darauf angesetzt
 * - Trig/Gate-Umschalter; bei Trig: len in ms/Beats (0=1 Sample)
 * - Spezialfälle: kein ADSR aktiv → 1-Sample-Puls; nur A → Attack + 0.5ms lin down;
 *   ADS ohne R → 0.5ms linear auf 0; ADR bei Trig → D überspringen, direkt A→R
 * - 0-basierte Envelopes (Ende immer 0), dazwischen positiv/negativ via inv
 * - Output in Audiospeed abrufbar (Value-Port, per flush() gesampelt)
 */
import { ensureAudio as ensureBus, getContext } from '../audioBus.js';

const OUTIN_MS = 0.5;  // Outin-Fade-Dauer in ms (@dpa: 0.5ms Crossfade alt→neu)

function clamp01(v) { return Math.max(0, Math.min(1, v)); }

/**
 * Eine ADSR-Engine-Instanz. Läuft im Audio-Thread: bei trigger()/gateOn()/gateOff()
 * werden AudioParam-Ramps geplant, der aktuelle Wert ist per read() abrufbar.
 */
class AdsrEngine {
    constructor(state) {
        this.state = state;
        this._gain = null;       // GainNode für den Env-Wert (Audio-Pegel)
        this._gate = false;
        this._getBpm = () => 120;
    }

    /** AudioContext holen (lazy, erst bei erstem Trigger). */
    _audio() {
        ensureBus();
        const ctx = getContext();
        if (!this._gain) {
            this._gain = ctx.createGain();
            this._gain.gain.value = 0;
        }
        return ctx;
    }

    /** Aktuellen Env-Wert lesen (für Value-Port-Sampling). */
    read() {
        return this._gain ? this._gain.gain.value : 0;
    }

    setBpmSource(fn) { this._getBpm = fn || (() => 120); }

    // ── Parameter aus dem State ────────────────────────────────────────────────
    _a() { return Math.max(0, this.state.get('adsrA') ?? 0.01); }
    _d() { return Math.max(0, this.state.get('adsrD') ?? 0.15); }
    _s() { return clamp01(this.state.get('adsrS') ?? 0.7); }
    _r() { return Math.max(0, this.state.get('adsrR') ?? 0.3); }
    _peak() { return Math.max(0.01, Math.min(1, this.state.get('adsrPeak') ?? 1)); }
    _gateLen() { return Math.max(0, this.state.get('adsrGateLen') ?? 0); }
    _aOn() { return !!this.state.get('adsrAOn'); }
    _dOn() { return !!this.state.get('adsrDOn'); }
    _sOn() { return !!this.state.get('adsrSOn'); }
    _rOn() { return !!this.state.get('adsrROn'); }
    _inv() { return !!this.state.get('adsrInv'); }
    _verlauf() { return !!this.state.get('adsrVerlauf'); }
    _trigMode() { return (this.state.get('adsrTrigMode') || 'trig') === 'trig'; }
    _aCurve() { return this.state.get('adsrACurve') || 'lin'; }
    _dCurve() { return this.state.get('adsrDCurve') || 'log'; }
    _rCurve() { return this.state.get('adsrRCurve') || 'log'; }
    _lenMs() {
        const len = this.state.get('adsrLen') ?? 0;
        const unit = this.state.get('adsrLenUnit') || 'ms';
        if (unit === 'beats') {
            const bpm = this._getBpm();
            return len * 60000 / bpm;
        }
        return len;
    }

    // ── Kurvenform-Helfer ──────────────────────────────────────────────────────
    _ramp(param, from, to, duration, t, mode) {
        if (duration <= 0) { param.setValueAtTime(to, t); return; }
        if (mode === 'log') {
            const safeFrom = Math.max(0.0001, Math.abs(from)) * (from < 0 ? -1 : 1);
            const safeTo = Math.max(0.0001, Math.abs(to)) * (to < 0 ? -1 : 1);
            param.setValueAtTime(safeFrom, t);
            param.exponentialRampToValueAtTime(safeTo, t + duration);
        } else {
            param.setValueAtTime(from, t);
            param.linearRampToValueAtTime(to, t + duration);
        }
    }

    // ── Trigger ────────────────────────────────────────────────────────────────
    trigger() {
        const ctx = this._audio();
        const t = ctx.currentTime;
        const gain = this._gain.gain;

        const aOn = this._aOn(), dOn = this._dOn(), sOn = this._sOn(), rOn = this._rOn();
        const inv = this._inv() ? -1 : 1;
        const peak = this._peak() * inv;
        const a = this._a(), d = this._d(), s = this._s(), r = this._r();
        const trigMode = this._trigMode();
        const lenMs = this._lenMs();
        const aCurve = this._aCurve(), dCurve = this._dCurve(), rCurve = this._rCurve();

        // Outin-Fade: alten Wert in 0.5ms auf 0 faden, neuen starten
        const outinSec = OUTIN_MS / 1000;
        const cur = gain.value;
        gain.cancelScheduledValues(t);
        gain.setValueAtTime(cur, t);
        gain.linearRampToValueAtTime(0, t + outinSec);

        const startT = t + outinSec;

        // Kein ADSR aktiv → 1-Sample-Puls
        if (!aOn && !dOn && !sOn && !rOn) {
            gain.setValueAtTime(peak, startT);
            gain.setValueAtTime(0, startT + 0.001);
            return;
        }

        // Nur A aktiv → Attack + 0.5ms lin down auf 0
        if (aOn && !dOn && !sOn && !rOn) {
            this._ramp(gain, 0, peak, a, startT, aCurve);
            gain.linearRampToValueAtTime(0, startT + a + 0.0005);
            return;
        }

        // ADS ohne R → nach Sustain 0.5ms linear auf 0
        if (aOn && dOn && sOn && !rOn) {
            this._ramp(gain, 0, peak, a, startT, aCurve);
            const dEnd = startT + a + d;
            this._ramp(gain, peak, peak * s, d, startT + a, dCurve);
            gain.linearRampToValueAtTime(0, dEnd + 0.0005);
            return;
        }

        // ADR bei Trig → D überspringen, direkt A→R
        if (aOn && dOn && !sOn && rOn && trigMode) {
            this._ramp(gain, 0, peak, a, startT, aCurve);
            this._ramp(gain, peak, 0, r, startT + a, rCurve);
            return;
        }

        // Standard-ADSR
        if (aOn) this._ramp(gain, 0, peak, a, startT, aCurve);
        const aEnd = startT + (aOn ? a : 0);
        if (dOn) this._ramp(gain, peak, peak * (sOn ? s : 0), d, aEnd, dCurve);
        const dEnd = aEnd + (dOn ? d : 0);
        if (sOn) gain.setValueAtTime(peak * s, dEnd);
        if (rOn) {
            if (trigMode) {
                const rStart = dEnd + (lenMs / 1000);
                this._ramp(gain, peak * (sOn ? s : 0), 0, r, rStart, rCurve);
            }
        }
    }

    // ── Gate ───────────────────────────────────────────────────────────────────
    gateOn() {
        if (!this._trigMode()) {
            this._gate = true;
            this.trigger();
        }
    }

    gateOff() {
        if (!this._trigMode() && this._gate) {
            this._gate = false;
            const ctx = this._audio();
            const t = ctx.currentTime;
            const gain = this._gain.gain;
            const r = this._r();
            const rOn = this._rOn();
            const rCurve = this._rCurve();
            if (rOn) {
                const cur = gain.value;
                gain.cancelScheduledValues(t);
                if (rCurve === 'log') {
                    const safeCur = Math.max(0.0001, Math.abs(cur)) * (cur < 0 ? -1 : 1);
                    gain.setValueAtTime(safeCur, t);
                    gain.exponentialRampToValueAtTime(0.0001, t + r);
                } else {
                    gain.setValueAtTime(cur, t);
                    gain.linearRampToValueAtTime(0, t + r);
                }
            } else {
                gain.cancelScheduledValues(t);
                gain.setValueAtTime(0, t);
            }
        }
    }
}

// ── Manager (nach Vorbild createSqManager) ─────────────────────────────────────

const VALUE_KEYS = ['adsrA', 'adsrD', 'adsrS', 'adsrR', 'adsrPeak', 'adsrGateLen',
    'adsrAOn', 'adsrDOn', 'adsrSOn', 'adsrROn', 'adsrInv',
    'adsrACurve', 'adsrDCurve', 'adsrRCurve',
    'adsrVerlauf', 'adsrTrigMode', 'adsrLen', 'adsrLenUnit', 'adsrOutput'];

function adsrName(i) { return i === 0 ? 'ADSR' : 'ADSR ' + (i + 1); }

function scoped(st, sfx) {
    return { get: (k) => st.get(k + sfx), set: (k, v) => st.set(k + sfx, v) };
}

export function createAdsrManager({ host, state, defs, tpl, routing, getBpm }) {
    const engines = [];

    function buildAdsr(i) {
        const sfx = '_' + i;
        for (const k of Object.keys(tpl.KNOBS)) defs.KNOBS[k + sfx] = tpl.KNOBS[k];
        for (const k of Object.keys(tpl.TOGGLES)) defs.TOGGLES[k + sfx] = tpl.TOGGLES[k];
        for (const k of Object.keys(tpl.SELECTS)) defs.SELECTS[k + sfx] = tpl.SELECTS[k];
        for (const k of Object.keys(tpl.DEFAULTS)) defs.DEFAULTS[k + sfx] = tpl.DEFAULTS[k];

        for (const k of VALUE_KEYS) {
            if (state.get(k + sfx) === undefined) state.set(k + sfx, tpl.DEFAULTS[k]);
        }

        host.addGroup({
            name: adsrName(i),
            toggles: Object.keys(tpl.TOGGLES).map((k) => k + sfx),
            selects: Object.keys(tpl.SELECTS).map((k) => k + sfx),
            knobs: Object.keys(tpl.KNOBS).map((k) => k + sfx),
            groupKind: 'ADSR',
            instanceSuffix: sfx,
            extraSoundKeys: VALUE_KEYS,
        });

        const st = scoped(state, sfx);
        const eng = new AdsrEngine(st);
        eng.setBpmSource(getBpm);
        engines[i] = eng;
    }

    function teardownLast() {
        const i = engines.length - 1;
        if (i < 0) return;
        const sfx = '_' + i;
        engines.splice(i, 1);
        host.removeGroup(adsrName(i));
        for (const k of VALUE_KEYS) state.remove(k + sfx);
        for (const k of Object.keys(tpl.KNOBS)) delete defs.KNOBS[k + sfx];
        for (const k of Object.keys(tpl.TOGGLES)) delete defs.TOGGLES[k + sfx];
        for (const k of Object.keys(tpl.SELECTS)) delete defs.SELECTS[k + sfx];
        for (const k of Object.keys(tpl.DEFAULTS)) delete defs.DEFAULTS[k + sfx];
    }

    function reconcile() {
        let want = state.get('adsrCount');
        if (!(want >= 1)) want = 1;
        while (engines.length < want) buildAdsr(engines.length);
        while (engines.length > want) teardownLast();
        state.set('adsrCount', engines.length);
        return engines.length;
    }

    function init() {
        if (state.get('adsrCount') == null) state.set('adsrCount', 1);
        reconcile();
    }

    function addAdsr() {
        state.set('adsrCount', engines.length + 1);
        reconcile();
    }

    function removeAdsr() {
        if (engines.length <= 1) return;
        state.set('adsrCount', engines.length - 1);
        reconcile();
    }

    function triggerAll() {
        for (const eng of engines) eng.trigger();
    }

    return { init, addAdsr, removeAdsr, engines, reconcile, triggerAll };
}