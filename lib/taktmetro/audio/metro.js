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

/**
 * Reine Rhythmus-Logik (@dpa 20260718_012157: „nur noch Beats/Takt"). Kein l/m mehr:
 * Teil 1 klingt allein auf dem Taktschlag (beatInBar 0 = die 1), Teil 2 auf allen übrigen
 * Beats – und optional auf der 1 mit (`on2Downbeat`). Ausgelagert, damit ohne AudioContext
 * testbar.
 * @returns {{p1:boolean, p2:boolean}}
 */
export function metroParts(beatInBar, { on2Downbeat }) {
    return { p1: beatInBar === 0, p2: beatInBar !== 0 || on2Downbeat };
}

export class Metro {
    /**
     * @param {AudioContext} ctx
     * @param {AudioNode} [destination]  Default: ctx.destination
     */
    constructor(ctx, destination = ctx.destination) {
        this.ctx = ctx;
        // ZWEI Teile (@dpa 20260717_234154: „braucht einen zweiten Teil, der für FilterCutoff
        // ein CutoffOffset vom ersten kriegt"). Beide klingen zeitgleich auf den Schlag; sie
        // teilen morph/reso, unterscheiden sich nur im Cutoff (Teil 2 = Teil 1 + Offset) und
        // im Pegel. Ein zweiter Gain-Weg, damit Teil 2 eigenständig mischbar (0 = aus) ist.
        this.v1 = this._makeVoice(destination, 0.5);
        this.v2 = this._makeVoice(destination, 0.5);
    }

    _makeVoice(destination, level) {
        const out = this.ctx.createGain();
        out.gain.value = level;
        out.connect(destination);
        return { out, buffer: null, peakOffset: 0 };   // peakOffset: Lage des Transienten im Buffer
    }

    /** GEMEINSAMER Ausgangspegel beider Teile (0..1). @dpa 20260718_012157: kein Level2 mehr. */
    setLevel(v) {
        const g = Math.max(0, v);
        this.v1.out.gain.setTargetAtTime(g, this.ctx.currentTime, 0.01);
        this.v2.out.gain.setTargetAtTime(g, this.ctx.currentTime, 0.01);
    }

    _render(voice, { morph, cutoff, reso }) {
        const sr = this.ctx.sampleRate;
        const { data, peakIndex } = renderMetroClick({ sampleRate: sr, morph, cutoff, reso });
        const buf = this.ctx.createBuffer(1, data.length, sr);
        buf.copyToChannel(data, 0);
        voice.buffer = buf;
        voice.peakOffset = peakIndex / sr;
    }

    /** Beide Klick-Buffer neu rendern. `cutoff2` (schon inkl. Offset) rendert Teil 2. */
    rebuild({ morph, cutoff, reso, cutoff2 }) {
        this._render(this.v1, { morph, cutoff, reso });
        this._render(this.v2, { morph, cutoff: cutoff2 != null ? cutoff2 : cutoff, reso });
    }

    _play(voice, time) {
        if (!voice.buffer) return;
        const src = this.ctx.createBufferSource();
        src.buffer = voice.buffer;
        src.connect(voice.out);
        // Um den Vorschwinger früher starten → Transient landet auf dem Schlag.
        src.start(Math.max(this.ctx.currentTime, time - voice.peakOffset));
    }

    // Die Teile werden GETRENNT geplant (@dpa 20260717_234154): jeder hat seinen eigenen
    // Rhythmus (l/m), darum entscheidet der Aufrufer je Schlag, welcher Teil klingt.
    /** Teil 1 (Taktschlag) auf `time` planen. */
    tick1(time) { this._play(this.v1, time); }
    /** Teil 2 (Beats) auf `time` planen. */
    tick2(time) { this._play(this.v2, time); }
}
