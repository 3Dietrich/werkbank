/**
 * trimBars.js – reine Sample-Arithmetik fürs Rec-Instrument-TODO 6 (Sample-genaues Trimmen).
 *
 * Warum vom Anfang her voll, nur am Ende gekappt: recStart()/recStop() (engine.js,
 * checkRecArm) feuern per setTimeout GENAU auf einen geplanten AudioContext-Zeitpunkt —
 * setTimeout kann nur GLEICH ODER SPÄTER als geplant auslösen, nie früher. Der Mitschnitt
 * beginnt also frühestens exakt auf dem Downbeat (kein Vorlauf zum Wegschneiden), während
 * am Ende durch dieselbe Verspätung + MediaRecorder-eigene Pufferung ein kleiner Rest über
 * die Taktgrenze hinaus mitgeschnitten wird. Deshalb: ab Sample 0 behalten, auf das nächst-
 * kleinere Vielfache der Takt-Länge (in Samples) abschneiden.
 */

/** Takt-Länge in Samples, gerundet (bpm + beatsPerBar + Ziel-Samplerate). */
export function computeBarSamples(bpm, beatsPerBar, sampleRate) {
    return Math.round((60 / bpm) * beatsPerBar * sampleRate);
}

/**
 * @param {Float32Array[]} channels   ein oder zwei Kanäle, alle gleich lang
 * @param {number} sampleRate
 * @param {number} bpm
 * @param {number} beatsPerBar
 * @returns {{channels: Float32Array[], bars: number, samples: number, barSamples: number}}
 */
export function trimToWholeBars(channels, sampleRate, bpm, beatsPerBar) {
    const barSamples = Math.max(1, computeBarSamples(bpm, beatsPerBar, sampleRate));
    const total = channels[0] ? channels[0].length : 0;
    const bars = Math.floor(total / barSamples);
    const samples = bars * barSamples;
    return { channels: channels.map((c) => c.subarray(0, samples)), bars, samples, barSamples };
}
