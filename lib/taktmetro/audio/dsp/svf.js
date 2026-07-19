/**
 * svf.js – die zwei Vadim-Helfer, die der Metronom-Knack braucht.
 *
 * Aus teslacoils [ladderCore.js](../../teslacoil/js/dsp/ladderCore.js) herausgelöst:
 * dort hängen sie an einem vollen Multimode-Filterkern (LadderCore), von dem hier
 * niemand etwas will. Bewusst kopiert statt importiert – der Taktgeber soll ohne
 * teslacoil laufen (er ist das Netzteil, nicht der Verstärker).
 *
 * Nach V. Zavalishin, „The Art of VA Filter Design".
 */

/** Pre-warp: g = tan(π·fc/fs) (Cutoff-Vorverzerrung der Bilineartransformation). */
export function prewarp(cutoffHz, sampleRate) {
    const fc = Math.min(Math.max(cutoffHz, 1), sampleRate * 0.49);
    return Math.tan(Math.PI * fc / sampleRate);
}

/** Resonanz-Mapping Q → SVF-Dämpfung R = 1/(2Q). Kleines R = hohe Resonanz. */
export function resToDamping(q) {
    return 1 / (2 * Math.max(0.05, q));
}
