/**
 * adsrOsc/engine.js – Audio-Verdrahtung für das ADSR+OSZ-Instrument (@dpa 20260803).
 *
 * Factory `createAdsrOscEngine(state, opts)` (ISM-Naht, s. docs/CONTROLS.md).
 *
 * Signalfluss:
 *   OscillatorNode (Wellenform aus oscWave, Grundfrequenz oscFreq)
 *     → GainNode (Amp-Env steuert gain, plus ampOffset als Grundlautstärke)
 *     → Master-Bus (lib/audioBus.js)
 *
 * Zwei Envelopes, beide als kleine EnvEngine (AdsrCore aus lib/polysynth/envCore.js auf
 * einem ConstantSourceNode geplant, Muster aus lib/polysynth/multiEnv.js) mit eigenem
 * State-Scope:
 *   - Amp-Env:   Scope ''  (Keys adsrA/adsrD/… ohne Suffix) → steuert den Gain.
 *   - Pitch-Env: Scope '_p' (Keys adsrA_p/adsrD_p/…) → moduliert die Frequenz
 *     MULTIPLIKATIV (Sine-FM-artig): freq = oscFreq * (1 + fmAmount * envValue).
 *     envValue läuft 0..1 (bzw. -1..1 bei inv), fmAmount skaliert die Abweichung.
 *
 * Der Gate-Button (b:gate) triggert beide Envelopes gemeinsam. Im Gate-Modus hält die
 * Env bis zum Loslassen; im Trig-Modus läuft sie einmal durch (Len).
 */
import { AdsrCore, msToSamples } from '../polysynth/envCore.js';
import { ensureAudio as ensureBus, getContext, getMaster } from '../audioBus.js';

/** Kleine Env-Engine: AdsrCore-Kurve auf einem ConstantSourceNode geplant (Muster aus
 *  multiEnv.js EnvEngine — dort nicht exportiert, darum hier lokal). ConstantSourceNode
 *  statt GainNode, damit auch negative (inv) Werte korrekt über .value lesbar sind. */
class EnvEngine {
    constructor(state) {
        this.state = state;
        this._core = new AdsrCore();
        this._src = null;
        this._gate = false;
    }

    _audio() {
        ensureBus();
        const ctx = getContext();
        if (ctx.state === 'suspended') ctx.resume();
        if (!this._src) {
            this._src = ctx.createConstantSource();
            this._src.offset.value = 0;
            const zero = ctx.createGain();
            zero.gain.value = 0;
            this._src.connect(zero);
            zero.connect(ctx.destination);
            this._src.start();
        }
        return ctx;
    }

    read() {
        return this._src ? this._src.offset.value : 0;
    }

    _cfg() {
        const get = (k) => this.state.get(k);
        const bpm = this._getBpm ? this._getBpm() : 120;
        const lenUnit = get('adsrLenUnit') || 'ms';
        const lenMs = lenUnit === 'beats' ? (get('adsrLenBeat') ?? 0) * 60000 / bpm : (get('adsrLenMs') ?? 0);
        const sr = this._audio().sampleRate;
        return {
            a: get('adsrA') ?? 0.01,
            d: get('adsrD') ?? 0.15,
            s: get('adsrS') ?? 0.7,
            r: get('adsrR') ?? 0.3,
            peak: get('adsrPeak') ?? 1,
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
            lenFest: get('adsrLenFest') !== false,
        };
    }

    trigger() {
        const ctx = this._audio();
        const t = ctx.currentTime;
        const cfg = this._cfg();
        const { curve, duration, startOffset } = this._core.trigger(cfg, ctx.sampleRate);
        const param = this._src.offset;
        param.cancelScheduledValues(t);
        param.setValueAtTime(param.value, t);
        param.setValueCurveAtTime(curve, Math.max(0, t + startOffset), duration);
        if (cfg.trigMode === 'gate') this._gate = true;
    }

    gateOff() {
        const ctx = this._audio();
        const t = ctx.currentTime;
        const cfg = this._cfg();
        const current = this.read();
        const { curve, duration } = this._core.gateOff(cfg, ctx.sampleRate, current);
        const param = this._src.offset;
        param.cancelScheduledValues(t);
        param.setValueAtTime(current, t);
        param.setValueCurveAtTime(curve, t, duration);
        this._gate = false;
    }

    setBpmSource(fn) { this._getBpm = fn; }
}

export function createAdsrOscEngine(state, opts = {}) {
    const getBpm = opts.getBpm || (() => 120);

    // Zwei EnvEngine-Instanzen mit getrennten State-Scopes.
    const ampEnv = new EnvEngine(scopedState(state, ''));
    const pitchEnv = new EnvEngine(scopedState(state, '_p'));
    ampEnv.setBpmSource(getBpm);
    pitchEnv.setBpmSource(getBpm);

    let ctx = null;
    let osc = null;      // OscillatorNode
    let ampGain = null;  // GainNode (Amp-Env + ampOffset)
    let running = false;

    function scopedState(st, sfx) {
        return {
            get: (k) => st.get(k + sfx),
            set: (k, v) => st.set(k + sfx, v),
        };
    }

    function ensureAudio() {
        ensureBus();
        ctx = getContext();
        if (ctx.state === 'suspended') ctx.resume();
        if (!osc) {
            osc = ctx.createOscillator();
            ampGain = ctx.createGain();
            ampGain.gain.value = 0;
            osc.connect(ampGain);
            ampGain.connect(getMaster());
            osc.start();
        }
        return ctx;
    }

    function applyWave() {
        if (!osc) return;
        osc.type = state.get('oscWave') || 'sine';
    }

    function applyFreq() {
        if (!osc) return;
        osc.frequency.setValueAtTime(Math.max(1, state.get('oscFreq') || 220), ctx.currentTime);
    }

    /** Frequenz aus Grundfrequenz + Pitch-Env-Wert (multiplikativ, Sine-FM-artig). */
    function freqFromEnv() {
        const base = Math.max(1, state.get('oscFreq') || 220);
        const fm = state.get('fmAmount') ?? 0.5;
        const envVal = pitchEnv.read();   // 0..1 (bzw. -1..1 bei inv)
        return base * (1 + fm * envVal);
    }

    function onAction(id, phase) {
        if (id === 'gate') {
            ensureAudio();
            // Gate-Button im 'gate'-Modus feuert onAction ZWEIMAL (mousedown='down',
            // mouseup='up'). Im Trig-Modus ist ein Klick ein einmaliger Impuls — 'up'
            // wird ignoriert (Muster aus multiEnv.js gateAt()).
            const trigMode = state.get('adsrTrigMode') || 'trig';
            if (trigMode === 'trig') {
                if (phase !== 'up') {
                    ampEnv.trigger();
                    pitchEnv.trigger();
                    running = true;
                }
            } else {
                if (running) {
                    ampEnv.gateOff();
                    pitchEnv.gateOff();
                    running = false;
                } else {
                    ampEnv.trigger();
                    pitchEnv.trigger();
                    running = true;
                }
            }
        }
    }

    // Amp-Env-Wert → Gain (plus ampOffset als Grundlautstärke).
    function applyAmp() {
        if (!ampGain) return;
        const envVal = ampEnv.read();
        const offset = state.get('ampOffset') ?? 0;
        ampGain.gain.setValueAtTime(Math.max(0, envVal + offset), ctx.currentTime);
    }

    // Pitch-Env-Wert → Frequenz (nur wenn der Oszillator läuft).
    function applyPitch() {
        if (!osc || !running) return;
        osc.frequency.setValueAtTime(freqFromEnv(), ctx.currentTime);
    }

    // Render-Loop: Env-Werte kontinuierlich auf Gain/Frequenz anwenden.
    function tick() {
        if (running) {
            applyAmp();
            applyPitch();
        }
        requestAnimationFrame(tick);
    }
    tick();

    // State-Änderungen live übernehmen.
    state.subscribe((key) => {
        if (key === 'oscWave') applyWave();
        else if (key === 'oscFreq') applyFreq();
    });

    return {
        ensureAudio,
        onAction,
        running: () => running,
        latency: () => 0,
    };
}