/**
 * recPostProcess.js – Rec-Instrument-TODO 6: webm→PCM dekodieren, aufs Takt-Raster
 * zurechtschneiden (lib/audio/trimBars.js), danach erst encodieren (mp3Encoder.js/
 * wavEncoder.js, TODO 3/4). Reine Orchestrierung, keine eigene DSP-Logik.
 */
import { trimToWholeBars } from './audio/trimBars.js';
import { encodeMp3 } from './mp3Encoder.js';
import { encodeWav } from './wavEncoder.js';

/**
 * @param {Blob} webmBlob            Rohaufnahme aus MediaRecorder (audio/webm)
 * @param {Object} opts
 * @param {AudioContext} opts.audioContext   für decodeAudioData (bereits laufender Context)
 * @param {number} opts.bpm
 * @param {number} opts.beatsPerBar
 * @param {'webm'|'mp3'|'wav'} opts.format
 * @param {number} [opts.mp3Bitrate]
 * @param {boolean} [opts.mp3Stereo]
 * @param {number} [opts.wavSampleRate]
 * @param {16|32} [opts.wavBitDepth]
 * @returns {Promise<{blob: Blob, ext: string, bars: number|null}>}
 */
export async function processRecording(webmBlob, opts) {
    const { audioContext, bpm, beatsPerBar, format } = opts;
    if (format !== 'mp3' && format !== 'wav') {
        return { blob: webmBlob, ext: 'webm', bars: null };
    }

    const arrayBuffer = await webmBlob.arrayBuffer();
    const decoded = await audioContext.decodeAudioData(arrayBuffer);
    const channels = [];
    for (let ch = 0; ch < decoded.numberOfChannels; ch++) channels.push(decoded.getChannelData(ch));

    const { channels: trimmed, bars } = trimToWholeBars(channels, decoded.sampleRate, bpm, beatsPerBar);
    const left = trimmed[0];
    const right = trimmed.length > 1 ? trimmed[1] : undefined;

    if (format === 'mp3') {
        const blob = encodeMp3({
            left, right, sampleRate: decoded.sampleRate,
            stereo: (opts.mp3Stereo !== false) && !!right,
            bitrate: opts.mp3Bitrate || 192,
        });
        return { blob, ext: 'mp3', bars };
    }
    const blob = encodeWav({
        left, right, sampleRateIn: decoded.sampleRate,
        sampleRateOut: opts.wavSampleRate || decoded.sampleRate,
        bitDepth: opts.wavBitDepth || 16,
        stereo: !!right,
    });
    return { blob, ext: 'wav', bars };
}
