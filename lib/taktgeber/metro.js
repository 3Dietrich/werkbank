/**
 * metro.js – der hörbare Klick: ein gefilterter „Knack", kein Piepton.
 *
 * HERKUNFT: teslacoils [Metronome.js](../teslacoil/js/audio/Metronome.js) (@dpa 20260717:
 * „kann zunächst von teslacoil 'Metronom' als Gruppe übernommen werden … ohne Quant &
 * Bend"). Quant/Band sind hier deshalb nicht: der Band-Regler faltete den Cutoff auf
 * teslacoils BaseFrq – eine BaseFrq hat der Taktgeber gar nicht. Übrig bleibt der Cutoff
 * als freier Regler, und genau der ist es auch, den Quant drüben ersetzte.
 *
 * Der Klick wird EINMAL pro Parameteränderung gerendert (dsp/metroClick.js) und pro Schlag
 * als BufferSource abgespielt – günstig und sample-genau. Er ersetzt die frühere
 * Rechteck-Piepse mit Downbeat-Betonung (accentHi/accentLo); die Betonung übernimmt jetzt
 * allein die Beat-Anzeige.
 */
import { renderMetroClick } from './dsp/metroClick.js';

export class Metro {
    /**
     * @param {AudioContext} ctx
     * @param {AudioNode} [destination]  Default: ctx.destination
     */
    constructor(ctx, destination = ctx.destination) {
        this.ctx = ctx;
        this.out = ctx.createGain();
        this.out.gain.value = 0.5;
        this.out.connect(destination);
        this.buffer = null;
        this.peakOffset = 0;   // s: Lage des Haupt-Transienten im Buffer
    }

    /** Ausgangspegel (0..1). */
    setLevel(v) { this.out.gain.setTargetAtTime(Math.max(0, v), this.ctx.currentTime, 0.01); }

    /** Klick-Buffer aus den aktuellen Parametern neu rendern. */
    rebuild({ morph, cutoff, reso }) {
        const sr = this.ctx.sampleRate;
        const { data, peakIndex } = renderMetroClick({ sampleRate: sr, morph, cutoff, reso });
        const buf = this.ctx.createBuffer(1, data.length, sr);
        buf.copyToChannel(data, 0);
        this.buffer = buf;
        this.peakOffset = peakIndex / sr;
    }

    /** Einen Klick planen, so dass der Knack auf `time` (den Schlag) fällt. */
    tick(time) {
        if (!this.buffer) return;
        const src = this.ctx.createBufferSource();
        src.buffer = this.buffer;
        src.connect(this.out);
        // Um den Vorschwinger früher starten → Transient landet auf dem Schlag.
        src.start(Math.max(this.ctx.currentTime, time - this.peakOffset));
    }
}
