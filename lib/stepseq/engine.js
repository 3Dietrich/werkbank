/**
 * engine.js — der reale Trigger-Takt des Stepsequenzer-ISM (@dpa 20260722_203201,
 * PHASE4_SPEC.md Paket 4A: der Sequenzer wird ein Transport-Kind).
 *
 * ISM-Konvention (docs/CONTROLS.md, Phase 0/PLAN_OPERA.md): Factory `createStepSeqEngine()`
 * wie createTaktEngine/createPolySynthEngine/createRecEngine — KEINE Sonderform mehr
 * (früher `class StepSeqEngine` in `StepSeqEngine.js`, das war der „veraltete Konstrukt"-
 * Bruch). Die Closure ist genauso instanz-fähig wie eine Klasse (mehrere Sequenzer in
 * Phase 4B = mehrfacher Aufruf), nur konsistent zu den anderen ISMs.
 *
 * Nahtstellen nach außen (werkbank.js): `running`, `seqPos()`, `resetSeq()`, `tick(nowMs)`
 * (Render-Loop) sowie NEU `handleClockBeat(time)` (Beat-Anker, Fan-out aus taktEngine.
 * onClockBeat) und `transportStarted()`/`transportStopped()` (Fan-out aus taktEngine.
 * onRunning, s. werkbank.js `_onTaktRunning`).
 *
 * Clock-Quelle (PHASE4_SPEC.md 4A.2, ersetzt die alte BaseFreq-Kopplung — @dpas Kern-
 * Vorwurf „Null mit Tempo/Start/Sync verbunden"): Trigger-Intervall = ein Beat-Bruchteil,
 * nicht mehr BaseFreq-abhängig.
 *   beatDurMs   = 60000 / Takt-BPM (getBeatDurMs-Closure, von werkbank.js gereicht)
 *   intervalMs  = beatDurMs · seqDiv ÷ seqMult
 * seqMult=1/seqDiv=1 → intervalMs == beatDurMs → 1/1 trifft GENAU den Beat. seqMult↑ =
 * schneller/vervielfacht, seqDiv↑ = langsamer/geteilt. Die alte MIN_HZ/MAX_HZ-Notbremse
 * bleibt als reiner Endlosschleifen-Schutz (auf Intervall-Grenzen übersetzt), ist bei
 * Tempo-Werten praktisch nie aktiv — kein stiller musikalischer Deckel.
 *
 * Phasen-Anker (4A.3): `handleClockBeat(time)` bekommt bei jedem rohen Scheduler-Beat der
 * Taktmetro-Engine (fan-out in werkbank.js, taktEngine.onClockBeat ist ein Einzel-Callback,
 * schon von Rec belegt) den Trigger-Raster nachgeführt, damit `tick()` (rAF/performance.now())
 * nicht gegen den AudioContext-Scheduler wegdriftet. Der Raster bleibt an `beatAnchorMs`
 * (Zeitpunkt des ersten Beats nach Transport-Start) verankert — jeder weitere Beat korrigiert
 * `nextAt` nur VORWÄRTS (nie zurück, sonst Doppel-Trigger), unabhängig von seqDiv/seqMult.
 *
 * Start/Stop-Kopplung (4A.4): `seqEnabled` bleibt ein eigener Arm-Schalter, aber `tick()`
 * feuert NUR bei `seqEnabled && transportOn` (s. `running()`). `transportStarted()` armt auf
 * Step 0 (Downbeat-phasengleich), `transportStopped()` lässt die Position auf -1 verfallen.
 *
 * onTrigger(envHeight) feuert NUR bei einem aktiven Step (Wert > 0) — ein Step-Wert 0 ist
 * „kein Trigger", die vorige Hüllkurve klingt einfach aus (exakt teslacoils Semantik).
 */
import { SEQ_MAX, seqAdvance } from './seqCore.js';
import { busLatencyMs } from '../routing/latency.js';

const MIN_HZ = 0.05, MAX_HZ = 40;   // Notbremse gegen Endlosschleife/Ton-Chaos bei Extremwerten
const MIN_INTERVAL_MS = 1000 / MAX_HZ;   // 25 ms
const MAX_INTERVAL_MS = 1000 / MIN_HZ;   // 20000 ms

/**
 * @param {import('../MiniState.js').MiniState} state
 * @param {() => number} getBeatDurMs  Dauer eines Takt-Beats in ms (60000/BPM)
 * @param {(envHeight:number) => void} onTrigger  feuert bei jedem aktiven Step
 */
export function createStepSeqEngine(state, getBeatDurMs, onTrigger) {
    let pos = -1;
    let nextAt = null;        // performance.now()-Zeitstempel (ms) des nächsten fälligen Triggers
    let beatAnchorMs = null;  // Zeitpunkt des ersten Beats nach Transport-Start (Raster-Referenz)
    let resetPending = false;
    let transportOn = false;

    const running = () => !!state.get('seqEnabled') && transportOn;

    const intervalMs = () => {
        const mult = Math.max(1, state.get('seqMult') | 0 || 1);
        const div = Math.max(1, state.get('seqDiv') | 0 || 1);
        const raw = (getBeatDurMs() * div) / mult;
        return Math.max(MIN_INTERVAL_MS, Math.min(MAX_INTERVAL_MS, raw));
    };

    // ISM-Latenz-Vertrag (Phase 2.2): kein eigener Scheduler-Vorlauf — tick() hängt am
    // Render-Loop (rAF), reiner Bus-Anteil. Die rAF-Frame-Unschärfe wird NICHT mit eingerechnet
    // (keine erfundene Genauigkeit, s. PHASE2_SPEC.md).
    function latency() { return busLatencyMs(); }

    return {
        get running() { return running(); },
        seqPos() { return pos; },
        latency,
        /** set0 (@dpa wie teslacoil): der NÄCHSTE Trigger startet wieder bei Step 0. */
        resetSeq() { resetPending = true; },

        /** Transport-Start-Kopplung (werkbank.js `_onTaktRunning`-Fan-out, 4A.4): Downbeat-
         * Start, phasengleich — der nächste Trigger fängt bei Step 0 an, der Beat-Anker
         * startet frisch (verhindert einen Raster-Sprung aus einem vorigen Lauf). */
        transportStarted() { transportOn = true; resetPending = true; nextAt = null; beatAnchorMs = null; },

        /** Transport-Stop-Kopplung: Sequenzer verstummt sofort (running() → false), Position
         * verfällt auf -1, der Anker verfällt (wird beim nächsten Start/Beat neu gesetzt). */
        transportStopped() { transportOn = false; pos = -1; nextAt = null; beatAnchorMs = null; resetPending = false; },

        /** Roher Scheduler-Beat der Taktmetro-Engine (werkbank.js `taktEngine.onClockBeat`-
         * Fan-out, 4A.3): führt den Trigger-Raster nach, ohne ihn je zurückzudrehen. */
        handleClockBeat(time) {
            if (beatAnchorMs == null) beatAnchorMs = time;
            const interval = intervalMs();
            const elapsed = time - beatAnchorMs;
            const k = Math.ceil(elapsed / interval - 1e-6);
            const due = beatAnchorMs + k * interval;
            if (nextAt == null || due > nextAt) nextAt = due;
        },

        /** Im Render-Loop aufrufen (werkbank.js, wie baseKeyboard.tick() u.a.). Feuert nur
         * bei laufendem Transport (running()) — kein Transport, kein Trigger, auch bei „An". */
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
