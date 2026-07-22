/**
 * Scaler.js – Tonhöhen-Mathematik für BaseFreq/Harmonisieren.
 *
 * Getrimmter Port aus teslacoil (js/pitch/Scaler.js), Poly-Synth-Instrument Schritt 1,
 * @dpa 20260721: nur die reinen, BaseFreq-relevanten Funktionen (freqToMidi/midiToFreq/
 * midiToName/semitoneToHz/foldToBand/harmonicSnap) — teslacoils `activeMidis`/
 * `quantizeToScale` hängen an dessen 12-Ton-Skala-Maske (ScaleModel), die hier nicht
 * gebraucht wird: der Poly-Synth wird über Tastatur/MIDI direkt gespielt, nicht über
 * einen S&H-Zufallswert, der erst auf eine Skala quantisiert werden müsste.
 * `NOTE_NAMES` kommt ebenfalls von hier (statt aus ScaleModel.js) — BaseKeyboard.js
 * braucht nur das Namens-Array, nicht das ganze Skala-Modell.
 */

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const A440_MIDI = 69;
// Kammerton (@dpa 20260722_013727: „Kammertonfreq angabe default: 440Hz") — war bisher fest
// 440 verdrahtet. Bewusst ein modul-weiter, mutierbarer Wert statt eines Funktionsparameters:
// jeder Aufruf von freqToMidi/midiToFreq müsste ihn sonst durchreichen, obwohl er praktisch
// immer derselbe ist (ein Regler in der Base-Frq-Gruppe, s. defs.js/engine.js).
let A4_HZ = 440;
export function setConcertPitch(hz) { A4_HZ = hz > 0 ? hz : 440; }
export function getConcertPitch() { return A4_HZ; }

/** Frequenz → MIDI-Notennummer (Fließkomma), A4=Kammerton=69. */
export function freqToMidi(hz) {
    return A440_MIDI + 12 * Math.log2(Math.max(1e-9, hz) / A4_HZ);
}

/** MIDI → Frequenz. */
export function midiToFreq(midi) {
    return A4_HZ * Math.pow(2, (midi - A440_MIDI) / 12);
}

/** MIDI → absoluter Notenname inkl. Oktave, z.B. 45 → "A2". */
export function midiToName(midi) {
    const m = Math.round(midi);
    const pc = ((m % 12) + 12) % 12;
    const oct = Math.floor(m / 12) - 1;
    return NOTE_NAMES[pc] + oct;
}

/** Halbton → Frequenz (temperiert) relativ zu refHz. */
export function semitoneToHz(semitone, refHz) {
    return refHz * Math.pow(2, semitone / 12);
}

/**
 * Frequenz in ein Oktavband [low, 2·low) falten (statt ±Oktave-Verschiebung):
 * multipliziert/halbiert mit 2, bis sie im Band liegt. So wählt ein Regler direkt
 * das Register als Hz-Bereich (z.B. low=30 → Band 30–60 Hz), egal welche Quell-Frequenz.
 * @param {number} freq
 * @param {number} low  – untere Bandgrenze in Hz (> 0)
 * @returns {number} gefaltete Frequenz in [low, 2·low)
 */
export function foldToBand(freq, low) {
    if (!(freq > 0) || !(low > 0)) return freq;
    let f = freq;
    while (f >= 2 * low) f /= 2;
    while (f < low) f *= 2;
    return f;
}

/**
 * Frequenz auf das Harmonie-Raster um baseHz ziehen – in BEIDE Richtungen:
 *   • hz ≥ baseHz → nächstes ganzzahliges Vielfache n·baseHz (n≥1): baseHz, 2·, 3· …
 *   • hz < baseHz → nächste Sub-Oktave baseHz/2^k (k≥0): baseHz, /2, /4, /8 …
 * So rasten tiefere Töne als die Basis auf Oktaven UNTER der Basis (statt fälschlich
 * nach oben auf die Basis zu klappen). @dpa (teslacoil): „Teiler <1 → 1/2, 1/4, 1/8 der BaseFrq".
 */
export function harmonicSnap(hz, baseHz) {
    if (baseHz <= 0 || hz <= 0) return hz;
    if (hz >= baseHz) return Math.max(1, Math.round(hz / baseHz)) * baseHz;
    const k = Math.max(0, Math.round(Math.log2(baseHz / hz)));   // 0 = Basis, 1 = /2, 2 = /4 …
    return baseHz / Math.pow(2, k);
}
