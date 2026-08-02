/**
 * DebugRecorder.js — roher PCM-Tap für das Debug-Werkzeug (1:1 Idee aus
 * teslacoil/js/audio/DebugRecorder.js, s. lib/debugPanel/DebugPanel.js-Kopf).
 *
 * ScriptProcessorNode statt AudioWorklet — bewusst, wie im Original: ein zweites
 * `audioWorklet.addModule()` ist für ein reines Dev-Werkzeug nicht nötig und birgt in
 * mancher Sandbox Hänger. Node/Sink werden nur WÄHREND der Aufnahme erzeugt (kein
 * Dauer-Overhead im Graph).
 *
 * Unterschied zu teslacoil: dort bekommt der Recorder ctx+tapNode fertig im Konstruktor
 * (teslacoils State ist EIN Objekt, EIN AudioContext ab App-Start). Werkbanks Audio-Bus
 * (lib/audioBus.js) entsteht dagegen ERST bei der ersten Nutzergeste (`ensureAudio()`) —
 * darum nimmt dieser Recorder statt fertiger Objekte eine GETTER-Funktion für den Tap-Node
 * und ruft `ensureAudio()` selbst bei jedem Start (genau wie lib/recInstrument/engine.js
 * es für Rec bereits tut).
 */
import { ensureAudio, getContext } from '../audioBus.js';

export class DebugRecorder {
    /** @param {() => AudioNode} getTapNode  liefert den anzuzapfenden Node (lazy, erst beim
     *  Start ausgewertet — vor der ersten Nutzergeste existiert er noch nicht). */
    constructor(getTapNode) {
        this.getTapNode = getTapNode;
        this._ctx = null;
        this._proc = null;
        this._sink = null;
        this._tapNode = null;
        this._chunks = [];
        this._recording = false;
    }

    get recording() { return this._recording; }

    /** Samplerate der letzten (bzw. aktuell laufenden) Aufnahme, für lastSeconds()/WAV-Export. */
    get sampleRate() { return this._ctx ? this._ctx.sampleRate : ((getContext() && getContext().sampleRate) || 48000); }

    start() {
        if (this._recording) return;
        ensureAudio();
        const ctx = getContext();
        const tapNode = this.getTapNode();
        if (!ctx || !tapNode) return;   // sollte nach ensureAudio() nie passieren, sicher ist sicher
        this._ctx = ctx;
        this._chunks = [];
        this._proc = ctx.createScriptProcessor(2048, 1, 1);
        this._sink = ctx.createGain();
        this._sink.gain.value = 0;   // stumm — nur damit der Processor getickt wird
        tapNode.connect(this._proc);
        this._tapNode = tapNode;
        this._proc.connect(this._sink);
        this._sink.connect(ctx.destination);
        this._proc.onaudioprocess = (e) => {
            if (this._recording) this._chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
        };
        this._recording = true;
    }

    /** Aufnahme stoppen, alle Chunks zu EINEM Float32Array zusammenfügen. */
    stop() {
        this._recording = false;
        if (this._proc) {
            try { this._tapNode.disconnect(this._proc); this._proc.disconnect(); this._sink.disconnect(); } catch { /* schon getrennt */ }
            this._proc.onaudioprocess = null;
            this._proc = null; this._sink = null; this._tapNode = null;
        }
        const total = this._chunks.reduce((n, c) => n + c.length, 0);
        const out = new Float32Array(total);
        let off = 0;
        for (const c of this._chunks) { out.set(c, off); off += c.length; }
        this._chunks = [];
        return out;
    }
}
