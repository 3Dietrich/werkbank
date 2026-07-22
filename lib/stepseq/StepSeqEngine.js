/**
 * StepSeqEngine.js — der reale Trigger-Takt des Stepsequenzer-ISM (@dpa 20260722_203201).
 *
 * Ersetzt die alte `fakeEngine`-Attrappe aus dem K5-Bausteinschaukasten (werkbank.js,
 * `#bench-seq`, „Braucht nur eine Engine mit running, seqPos(which), resetSeq(which)"):
 * dieselben drei Nahtstellen, jetzt echt — ohne `which` (nur EIN Sequenzer, kein Filter/
 * Amp-Paar wie in teslacoil).
 *
 * Basisclock (ddw.md: „Stepsequenzer, Basisclock (n*BaseFreq) mit Teiler (Clock/n) als
 * trigger source"): Trigger-Hz = BaseFreq · seqMult ÷ seqDiv, geklemmt auf [0.05, 40] Hz
 * (Notbremse — ohne Deckel könnte ein hoher Multiplikator/kleiner Teiler bei hoher BaseFreq
 * ein Intervall nahe 0 ergeben, s. `guard` unten). KEIN eigener Lookahead-Scheduler wie
 * taktmetro/audio/clock.js — `tick(nowMs)` hängt am selben Render-Loop wie baseKeyboard/
 * toneReadout/freqReadout (werkbank.js), das reicht für einen ersten technischen Anschluss
 * (@dpa: „Erstmal … technisch einbinden") und braucht keinen zweiten Worker-Ticker.
 *
 * onTrigger(envHeight) feuert NUR bei einem aktiven Step (Wert > 0) — ein Step-Wert 0 ist
 * „kein Trigger", die vorige Hüllkurve klingt einfach aus (exakt teslacoils stepSeq.js-
 * Semantik, s. dortiger Kopfkommentar).
 */
import { SEQ_MAX, seqAdvance } from '../stepSeq.js';

const MIN_HZ = 0.05, MAX_HZ = 40;   // Notbremse gegen Endlosschleife/Ton-Chaos bei Extremwerten

export class StepSeqEngine {
    /**
     * @param {import('../MiniState.js').MiniState} state
     * @param {() => number} getBaseFreq  effektive BaseFreq der Poly-Synth-Engine
     * @param {(envHeight:number) => void} onTrigger  feuert bei jedem aktiven Step
     */
    constructor(state, getBaseFreq, onTrigger) {
        this.state = state;
        this.getBaseFreq = getBaseFreq;
        this.onTrigger = onTrigger;
        this._pos = -1;
        this._nextAt = null;    // performance.now()-Zeitstempel (ms) des nächsten fälligen Triggers
        this._resetPending = false;
    }

    get running() { return !!this.state.get('seqEnabled'); }
    seqPos() { return this._pos; }
    /** set0 (@dpa wie teslacoil): der NÄCHSTE Trigger startet wieder bei Step 0. */
    resetSeq() { this._resetPending = true; }

    _intervalMs() {
        const mult = Math.max(1, this.state.get('seqMult') | 0 || 1);
        const div = Math.max(1, this.state.get('seqDiv') | 0 || 1);
        const hz = Math.max(MIN_HZ, Math.min(MAX_HZ, (this.getBaseFreq() * mult) / div));
        return 1000 / hz;
    }

    /** Im Render-Loop aufrufen (werkbank.js, wie baseKeyboard.tick() u.a.). */
    tick(nowMs) {
        if (!this.running) { this._nextAt = null; return; }
        if (this._nextAt == null) this._nextAt = nowMs;
        let guard = 0;
        while (nowMs >= this._nextAt && guard++ < 64) {
            const len = Math.max(1, Math.min(SEQ_MAX, this.state.get('seqLen') | 0));
            this._pos = seqAdvance(this._pos, len, this._resetPending);
            this._resetPending = false;
            const steps = this.state.get('seqSteps') || [];
            const v = Math.max(0, Math.min(1, steps[this._pos] || 0));
            if (v > 0) this.onTrigger(v);
            this._nextAt += this._intervalMs();
        }
    }
}
