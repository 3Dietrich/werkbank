/**
 * latency.js — der Bus-Anteil des ISM-Latenz-Vertrags (Phase 2.2, PLAN_OPERA.md/PHASE2_SPEC.md).
 *
 * Jedes engine.js baut seine öffentliche `latency()` als busLatencyMs() + eigener
 * Puffer/Offset (0, wenn das ISM keinen eigenen Scheduler-Vorlauf hat). Baut den AudioContext
 * NICHT selbst auf (kein ensureAudio hier) — vor dem ersten `ensureAudio()` irgendeines
 * Instruments liefert das schlicht 0, statt einen Autoplay-Context zu erzwingen.
 */
import { getContext } from '../audioBus.js';

export function busLatencyMs() {
    const c = getContext();
    if (!c) return 0;
    return ((c.baseLatency || 0) + (c.outputLatency || 0)) * 1000;
}
