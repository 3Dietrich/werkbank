/**
 * wavEncoder.js – WAV/PCM-Writer (Rec-Instrument-TODO 4). Reine Encoder-Funktion, wie
 * lib/mp3Encoder.js: nimmt bereits dekodierte PCM-Samples (Float32, -1..1) entgegen und
 * liefert einen WAV-Blob zurück. Noch NICHT an recStart/recStop angeschlossen — das
 * passiert erst mit dem Sample-genauen Trimmen (Rec-Instrument-TODO 6).
 *
 * Resampling: einfache lineare Interpolation, kein Dithering (@dpa-Vorgabe) — beim
 * Runterquantisieren auf Int wird schlicht gerundet/geclippt, keine Fehlerformung.
 */

/** Zielsamplerate-Optionen fürs Rec-Format-Panel. */
export const WAV_SAMPLE_RATES = [22050, 24000, 44100, 48000, 88200, 96000];
/** Bittiefe-Optionen (PCM, kein Float). */
export const WAV_BIT_DEPTHS = [16, 32];

function linearResample(input, srcRate, dstRate) {
    if (srcRate === dstRate) return input;
    const ratio = srcRate / dstRate;
    const outLen = Math.max(1, Math.round(input.length / ratio));
    const out = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) {
        const srcPos = i * ratio;
        const i0 = Math.floor(srcPos);
        const frac = srcPos - i0;
        const s0 = i0 < input.length ? input[i0] : 0;
        const s1 = (i0 + 1) < input.length ? input[i0 + 1] : s0;
        out[i] = s0 + frac * (s1 - s0);
    }
    return out;
}

function interleaveStereo(left, right) {
    const n = Math.min(left.length, right.length);
    const out = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { out[2 * i] = left[i]; out[2 * i + 1] = right[i]; }
    return out;
}

function floatTo16(f32) {
    const out = new Int16Array(f32.length);
    for (let i = 0; i < f32.length; i++) {
        const s = Math.max(-1, Math.min(1, f32[i]));
        out[i] = s < 0 ? s * 32768 : s * 32767;
    }
    return out;
}

function floatTo32(f32) {
    const out = new Int32Array(f32.length);
    for (let i = 0; i < f32.length; i++) {
        const s = Math.max(-1, Math.min(1, f32[i]));
        out[i] = s < 0 ? s * 2147483648 : s * 2147483647;
    }
    return out;
}

function writeAscii(view, offset, str) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}

function writeWavHeader(view, { numChannels, sampleRate, bitDepth, dataLength }) {
    const blockAlign = numChannels * (bitDepth / 8);
    writeAscii(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    writeAscii(view, 8, 'WAVE');
    writeAscii(view, 12, 'fmt ');
    view.setUint32(16, 16, true);          // fmt-Chunk-Größe (PCM)
    view.setUint16(20, 1, true);           // Format-Tag 1 = PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);   // Byte-Rate
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeAscii(view, 36, 'data');
    view.setUint32(40, dataLength, true);
}

/**
 * @param {Object} opts
 * @param {Float32Array} opts.left       Samples -1..1, einziger Kanal bei mono
 * @param {Float32Array} [opts.right]    zweiter Kanal, nur bei stereo nötig
 * @param {number} opts.sampleRateIn     Quell-Samplerate (Aufnahme)
 * @param {number} [opts.sampleRateOut]  Ziel-Samplerate, siehe WAV_SAMPLE_RATES (Default = sampleRateIn)
 * @param {16|32} [opts.bitDepth]        Default 16
 * @param {boolean} [opts.stereo]        true = 2 Kanäle (Default false = mono)
 * @returns {Blob}
 */
export function encodeWav({ left, right, sampleRateIn, sampleRateOut, bitDepth = 16, stereo = false }) {
    const rateOut = sampleRateOut || sampleRateIn;
    if (!WAV_SAMPLE_RATES.includes(rateOut)) throw new Error('Unbekannte Ziel-Samplerate: ' + rateOut);
    if (bitDepth !== 16 && bitDepth !== 32) throw new Error('Nur 16 oder 32 Bit unterstützt, nicht ' + bitDepth);

    const l = linearResample(left, sampleRateIn, rateOut);
    const useStereo = stereo && !!right;
    const r = useStereo ? linearResample(right, sampleRateIn, rateOut) : null;
    const interleaved = useStereo ? interleaveStereo(l, r) : l;
    const numChannels = useStereo ? 2 : 1;

    const bytesPerSample = bitDepth / 8;
    const dataLength = interleaved.length * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataLength);
    const view = new DataView(buffer);
    writeWavHeader(view, { numChannels, sampleRate: rateOut, bitDepth, dataLength });

    let offset = 44;
    if (bitDepth === 16) {
        const pcm = floatTo16(interleaved);
        for (let i = 0; i < pcm.length; i++, offset += 2) view.setInt16(offset, pcm[i], true);
    } else {
        const pcm = floatTo32(interleaved);
        for (let i = 0; i < pcm.length; i++, offset += 4) view.setInt32(offset, pcm[i], true);
    }

    return new Blob([buffer], { type: 'audio/wav' });
}
