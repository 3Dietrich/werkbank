/**
 * audioBus.js – EIN gemeinsamer AudioContext + Master-Bus für alle Instrumente.
 *
 * @dpa 20260721: „Rec nicht in Poly drin, sondern als Extra Instrument" — der Grund, das
 * überhaupt zu brauchen: Rec soll „alles Hörbare" aufnehmen, nicht nur EIN Instrument.
 * Vorher hatte jedes Instrument (Taktmetro, Poly-Synth) seinen EIGENEN isolierten
 * AudioContext — ein instrumentgebundenes Rec hätte also nie beide zugleich einfangen
 * können. Jetzt verbinden sich alle Instrumente an DIESEN einen Master, Rec (eigenes
 * Instrument, lib/recInstrument/) zapft NUR diesen einen Punkt an.
 *
 * Master Volume + Limiter (@dpa 20260722, ddw.md „wir brauchen einen Master Volume"):
 * eine reine MONITOR-Kette zwischen `master` (roher Summenbus) und `destination` — Rec
 * zapft weiterhin `master` VOR dieser Kette ab (bewusste Entscheidung, keine Rückfrage
 * möglich: die Aufnahme soll unabhängig vom gerade eingestellten Abhörpegel bleiben,
 * „alles Hörbare" hier als „aller Musikinhalt", nicht als 1:1-Mitschnitt des Lautsprecher-
 * Signals). Kette: master → volumeGain (dB-Fader) → limiter (DynamicsCompressorNode,
 * optional per IO-Schalter umgangen) → destination. Der Limiter sitzt bewusst NACH dem
 * Fader (nicht davor) — er muss den tatsächlichen Ausgangspegel begrenzen, sonst könnte
 * ein hochgezogener Fader ihn wieder übersteuern lassen. „ohne extra Latenz": der native
 * DynamicsCompressorNode braucht KEINEN eigenen Lookahead-Puffer (kein AudioWorklet nötig)
 * — mehr Latenzfreiheit als die Web-Audio-API selbst bietet, ist ohne eigenen DSP-Prozessor
 * nicht erreichbar.
 */
let audio = null, master = null, volumeGain = null, limiter = null, limiterOn = true;

const dbToGain = (db) => Math.pow(10, db / 20);

/** AudioContext + Master anlegen (nur beim ersten Aufruf, braucht eine Nutzer-Geste). */
export function ensureAudio() {
    if (audio) return audio;
    audio = new (window.AudioContext || window.webkitAudioContext)();
    master = audio.createGain();
    volumeGain = audio.createGain();
    limiter = audio.createDynamicsCompressor();
    limiter.knee.value = 0;      // hart (echter Limiter, kein weicher Übergang vor der Schwelle)
    limiter.ratio.value = 20;    // Web-Audio-Maximum – so nah an "brickwall" wie ohne eigenen DSP möglich
    limiter.threshold.value = 0; // setzt bei 0dB an (@dpa)
    setLimiterAttack(0.5);       // ms, @dpa-Default
    setLimiterRelease(250);      // ms, @dpa-Default
    master.connect(volumeGain);
    volumeGain.connect(limiter);
    limiter.connect(audio.destination);
    return audio;
}

export function getContext() { return audio; }
export function getMaster() { return master; }
export function getLimiter() { return limiter; }   // Debug/Test, später fürs LevelMeter (reduction)

/** Master-Lautstärke in dB (@dpa: „dB basiert") – 0 = unity. */
export function setMasterDb(db) { if (volumeGain) volumeGain.gain.value = dbToGain(db); }
export function setLimiterOn(on) {
    limiterOn = !!on;
    if (!volumeGain || !limiter) return;
    try { volumeGain.disconnect(); } catch { /* schon getrennt */ }
    if (limiterOn) { volumeGain.connect(limiter); } else { volumeGain.connect(audio.destination); }
}
export function setLimiterAttack(ms) { if (limiter) limiter.attack.value = Math.max(0, ms) / 1000; }
export function setLimiterRelease(ms) { if (limiter) limiter.release.value = Math.max(0, ms) / 1000; }
