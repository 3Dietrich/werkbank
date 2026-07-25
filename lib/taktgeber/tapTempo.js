// tapTempo.js
// Tab-Tempo-Kern für den Taktgeber (Block G aus teslacoil/plan_20260713.md).
//
// Aufgabe: aus Maus-/Tasten-Klicks, die man synchron auf etwas Gehörtes tappt,
// ein BPM schätzen — robust gegen
//   (a) ausgelassene Beats  (man tappt nur jeden 2./3./4. Schlag),
//   (b) einzelne Fehlklicks (Ausreißer außerhalb des ±15 %-Fensters).
//
// Zwei Modi (Plan-Wunsch):
//   Mode 1 – gleichbleibendes Tempo: über ALLE gültigen Klicks mitteln
//            (Gesamtspanne / Gesamt-Beats). Sehr stabil, "rastet" ein.
//   Mode 2 – sich änderndes Tempo: gleitendes Fenster der letzten Klicks,
//            folgt Tempo-Drifts; ab dem 3. Klick wird live "go" mitgetriggert.
//
// Warum "Gesamtspanne / Gesamt-Beats" statt nur letztes Intervall (Plan-Wunsch,
// "Gesamtlänge aller Klicks einbeziehen"): der Klick-Jitter des Menschen mittelt
// sich über eine lange Spanne fast weg → das Tempo zappelt nicht bei jedem Klick,
// sondern rastet nach wenigen Klicks sauber ein.

/**
 * Ein zu schnell getipptes Tempo auf die höchste n-te Hälfte legen, die noch unter das
 * Maximum passt (@dpa 20260717). Zwei Gründe, beide echt:
 *
 *  1. **Es war ein Absturz.** „ich konnte es so schnell tabben dass es neu lud" – ein
 *     Doppelklick sind ~30 ms Abstand = 2000 BPM. Bei so kurzen Beats plant der Scheduler
 *     pro 25-ms-Tick hunderte Klick-Quellen ins Vorausfenster; der Tab stirbt. (Der zweite
 *     Riegel dagegen sitzt im Scheduler selbst, s. clock.js.)
 *  2. **Es ist fast immer gemeint.** Wer 2216 BPM tippt, meint keine 2216 – er hat auf
 *     Sechzehntel getippt. Halbieren trifft denselben Puls, nur im ruhigen Register.
 *
 * Halbiert wird, nicht geklemmt: ein Deckel bei 400 machte aus jedem zu schnellen Tap
 * dasselbe stumpfe 400 und verlöre den Puls, den jemand gerade eingetippt hat.
 *
 * @param {number} bpm  roh getipptes Tempo
 * @param {number} max  Obergrenze (State-Key `maxBpm`)
 * @returns {{ bpm:number, k:number }} k = 2^n = wie oft das Ergebnis ins Getippte passt
 *   (k=1 → nichts gefaltet). Beispiel: foldBpm(2216, 400) → { bpm: 277, k: 8 }.
 */
export function foldBpm(bpm, max) {
    if (!(bpm > 0) || !(max > 0)) return { bpm, k: 1 };
    let k = 1;
    // 2^20 als Notbremse: ohne sie hinge eine 0/NaN-Grenze hier für immer.
    while (bpm / k > max && k < (1 << 20)) k *= 2;
    return { bpm: bpm / k, k };
}

export class TapTempo {
  /**
   * @param {object} o
   * @param {number} o.tolerance  ±-Fenster als Anteil (0.15 = ±15 %)
   * @param {number} o.mode       1 = stabil (global), 2 = folgend (Fenster)
   * @param {number} o.maxMissed  max. ausgelassene Beats pro Klick (Plan: 2,3,4,…)
   * @param {number} o.windowBeats  Mittelungs-Fenster in Beats (nur Mode 2)
   * @param {number} o.waitMs      Pause ab der eine neue Serie beginnt (0 = aus)
   */
  constructor({ tolerance = 0.15, mode = 1, maxMissed = 8, windowBeats = 4, waitMs = 2000 } = {}) {
    this.tolerance = tolerance;
    this.mode = mode;
    this.maxMissed = maxMissed;
    this.windowBeats = windowBeats;
    this.waitMs = waitMs;
    this.reset();
  }

  reset() {
    // taps: chronologisch, jeder Eintrag { t, beat }.
    // beat = kumulierte Beat-Position (0,1,2,… mit Lücken bei ausgelassenen).
    this.taps = [];
    this.bpm = null;
  }

  /** Mittleres Intervall (ms) aus dem relevanten Fensterbereich der bisherigen Taps. */
  _avgInterval() {
    const n = this.taps.length;
    if (n < 2) return null;
    const last = this.taps[n - 1];
    let first = this.taps[0];
    if (this.mode === 2) {
      // Nur die letzten windowBeats zurückgehen → folgt Tempo-Änderungen.
      for (let i = n - 1; i >= 0; i--) {
        if (last.beat - this.taps[i].beat >= this.windowBeats) { first = this.taps[i]; break; }
        first = this.taps[i];
      }
    }
    const beats = last.beat - first.beat;
    if (beats <= 0) return null;
    return (last.t - first.t) / beats;
  }

  /**
   * Einen Klick registrieren.
   * @param {number} t  Zeitstempel in ms (performance.now()). Default: jetzt.
   * @returns {object} { bpm, interval, tapCount, beat, k, rejected, fresh, live }
   *   rejected = Ausreißer (in Mode 1 verworfen); fresh = neue Serie gestartet;
   *   live = true, wenn ein Tempo-"go" sofort ausgegeben werden soll (Mode 2 ab Tap 3).
   */
  tap(t = (typeof performance !== 'undefined' ? performance.now() : Date.now())) {
    const n = this.taps.length;

    // Neue Serie: kein Vorgänger, oder Pause > waitMs seit dem letzten Klick.
    if (n === 0 || (this.waitMs > 0 && t - this.taps[n - 1].t > this.waitMs)) {
      this.reset();
      this.taps.push({ t, beat: 0 });
      return { bpm: this.bpm, interval: null, tapCount: 1, beat: 0, k: 0, rejected: false, fresh: true, live: false };
    }

    const last = this.taps[n - 1];

    // Zweiter Klick der Serie: erstes Intervall = Referenz.
    if (n === 1) {
      const interval = t - last.t;
      this.taps.push({ t, beat: 1 });
      this.bpm = 60000 / interval;
      return { bpm: this.bpm, interval, tapCount: 2, beat: 1, k: 1, rejected: false, fresh: false, live: false };
    }

    // Ab dem 3. Klick: ausgelassene Beats erkennen + ins ±tol-Fenster einordnen.
    const avg = this._avgInterval();
    const raw = t - last.t;
    // k = wie viele Beats liegen (vermutlich) zwischen letztem und diesem Klick.
    let k = Math.round(raw / avg);
    if (k < 1) k = 1;
    if (k > this.maxMissed) k = this.maxMissed;
    const candidate = raw / k;              // Intervall pro Beat unter Annahme k
    const err = Math.abs(candidate - avg) / avg;

    let rejected = false;
    if (err > this.tolerance) {
      // Ausreißer: passt bei keinem k ins Fenster.
      if (this.mode === 1) {
        // Stabil bleiben → Fehlklick ignorieren, Tempo unverändert.
        return { bpm: this.bpm, interval: avg, tapCount: n, beat: last.beat, k: 0, rejected: true, fresh: false, live: false };
      }
      // Mode 2: Tempo darf springen → als frischer Einzel-Beat (k=1) übernehmen.
      k = 1;
      rejected = true;
    }

    const beat = last.beat + k;
    this.taps.push({ t, beat });
    const avg2 = this._avgInterval();
    this.bpm = 60000 / avg2;
    const tapCount = n + 1;
    const live = this.mode === 2 && tapCount >= 3;
    return { bpm: this.bpm, interval: avg2, tapCount, beat, k, rejected, fresh: false, live };
  }
}
