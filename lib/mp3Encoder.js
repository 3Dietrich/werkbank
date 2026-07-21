/**
 * mp3Encoder.js – ESM-Fassade um das vendored lamejs (lib/vendor/lame.js, klassisches
 * <script>, hängt globalThis.lamejs auf, siehe index.html).
 *
 * Reine Encoder-Funktion: nimmt bereits dekodierte PCM-Samples (Float32, -1..1) entgegen
 * und liefert einen MP3-Blob zurück. Noch NICHT an recStart/recStop angeschlossen — das
 * passiert erst mit dem Sample-genauen Trimmen (Rec-Instrument-TODO 6: webm→PCM
 * decodieren, aufs Takt-Raster schneiden, danach erst encodieren).
 *
 * NUR CBR (@dpa-Entscheidung 20260721, Rec-Instrument-TODO 3): VBR/ABR fehlt der gesamten
 * lamejs-Familie strukturell (siehe Kopfkommentar lib/vendor/lame.js) — kein UI-Feld dafür.
 */

/** CBR-Presets fürs Rec-Format-Panel (Rec-Instrument-TODO 3). */
export const MP3_CBR_PRESETS = [64, 128, 192, 256, 320];

function floatTo16BitPCM(f32) {
    const out = new Int16Array(f32.length);
    for (let i = 0; i < f32.length; i++) {
        const s = Math.max(-1, Math.min(1, f32[i]));
        out[i] = s < 0 ? s * 32768 : s * 32767;
    }
    return out;
}

/**
 * @param {Object} opts
 * @param {Float32Array} opts.left       Samples -1..1, einziger Kanal bei mono
 * @param {Float32Array} [opts.right]    zweiter Kanal, nur bei stereo nötig
 * @param {number} opts.sampleRate
 * @param {boolean} [opts.stereo]        true = 2 Kanäle im MP3 (Default false = mono)
 * @param {number} [opts.bitrate]        kbps, siehe MP3_CBR_PRESETS (Default 192)
 * @returns {Blob}
 */
export function encodeMp3({ left, right, sampleRate, stereo = false, bitrate = 192 }) {
    const lamejs = globalThis.lamejs;
    if (!lamejs) throw new Error('lamejs nicht geladen (lib/vendor/lame.js fehlt als <script> vor dem type=module-Skript?)');
    const channels = stereo ? 2 : 1;
    // Qualität bewusst fest/unsichtbar (Rec-Instrument-TODO 3) — siehe lib/vendor/lame.js.
    const encoder = new lamejs.Mp3Encoder(channels, sampleRate, bitrate);

    const l16 = floatTo16BitPCM(left);
    const r16 = stereo && right ? floatTo16BitPCM(right) : null;

    const chunks = [];
    const blockSize = 1152;   // lamejs-Vorgabe (MPEG-Frame-Größe)
    for (let i = 0; i < l16.length; i += blockSize) {
        const lChunk = l16.subarray(i, i + blockSize);
        const rChunk = r16 ? r16.subarray(i, i + blockSize) : undefined;
        const enc = encoder.encodeBuffer(lChunk, rChunk);
        if (enc.length) chunks.push(enc);
    }
    const end = encoder.flush();
    if (end.length) chunks.push(end);

    return new Blob(chunks, { type: 'audio/mpeg' });
}
