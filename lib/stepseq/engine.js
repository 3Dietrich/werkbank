/**
 * engine.js — der reale Trigger-Takt des Stepsequenzer-ISM (@dpa 20260722_203201).
 *
 * ISM-Konvention (docs/CONTROLS.md, Phase 0/PLAN_OPERA.md): Factory `createStepSeqEngine()`
 * wie createTaktEngine/createPolySynthEngine/createRecEngine — KEINE Sonderform mehr
 * (früher `class StepSeqEngine` in `StepSeqEngine.js`, das war der „veraltete Konstrukt"-
 * Bruch). Die Closure ist genauso instanz-fähig wie eine Klasse (mehrere Sequenzer in
 * Phase 4 = mehrfacher Aufruf), nur konsistent zu den anderen ISMs.
 *
 * Nahtstellen nach außen (werkbank.js ruft sie im Render-Loop): `running`, `seqPos()`,
 * `resetSeq()`, `tick(nowMs)`.
 *
 * Basisclock (ddw.md: „Stepsequenzer, Basisclock (n*BaseFreq) mit Teiler (Clock/n) als
 * trigger source"): Trigger-Hz = BaseFreq · seqMult ÷ seqDiv, geklemmt auf [0.05, 40] Hz
 * (Notbremse — ohne Deckel könnte ein hoher Multiplikator/kleiner Teiler bei hoher BaseFreq
 * ein Intervall nahe 0 ergeben, s. `guard`). KEIN eigener Lookahead-Scheduler wie
 * taktmetro/audio/clock.js — `tick(nowMs)` hängt am selben Render-Loop wie baseKeyboard/
 * toneReadout/freqReadout (werkbank.js), das reicht für den ersten technischen Anschluss.
 *
 * onTrigger(envHeight) feuert NUR bei einem aktiven Step (Wert > 0) — ein Step-Wert 0 ist
 * „kein Trigger", die vorige Hüllkurve klingt einfach aus (exakt teslacoils Semantik).
 */
import { SEQ_MAX, seqAdvance } from './seqCore.js';

const MIN_HZ = 0.05, MAX_HZ = 40;   // Notbremse gegen Endlosschleife/Ton-Chaos bei Extremwerten

/**
 * @param {import('../MiniState.js').MiniState} state
 * @param {() => number} getBaseFreq  effektive BaseFreq der Poly-Synth-Engine
 * @param {(envHeight:number) => void} onTrigger  feuert bei jedem aktiven Step
 */
export function createStepSeqEngine(state, getBaseFreq, onTrigger) {
    let pos = -1;
    let nextAt = null;        // performance.now()-Zeitstempel (ms) des nächsten fälligen Triggers
    let resetPending = false;

    const running = () => !!state.get('seqEnabled');

    const intervalMs = () => {
        const mult = Math.max(1, state.get('seqMult') | 0 || 1);
        const div = Math.max(1, state.get('seqDiv') | 0 || 1);
        const hz = Math.max(MIN_HZ, Math.min(MAX_HZ, (getBaseFreq() * mult) / div));
        return 1000 / hz;
    };

    return {
        get running() { return running(); },
        seqPos() { return pos; },
        /** set0 (@dpa wie teslacoil): der NÄCHSTE Trigger startet wieder bei Step 0. */
        resetSeq() { resetPending = true; },

        /** Im Render-Loop aufrufen (werkbank.js, wie baseKeyboard.tick() u.a.). */
        tick(nowMs) {
            if (!running()) { nextAt = null; return; }
            if (nextAt == null) nextAt = nowMs;
            let guard = 0;
            while (nowMs >= nextAt && guard++ < 64) {
                const len = Math.max(1, Math.min(SEQ_MAX, state.get('seqLen') | 0));
                pos = seqAdvance(pos, len, resetPending);
                resetPending = false;
                const steps = state.get('seqSteps') || [];
                const v = Math.max(0, Math.min(1, steps[pos] || 0));
                if (v > 0) onTrigger(v);
                nextAt += intervalMs();
            }
        },
    };
}
