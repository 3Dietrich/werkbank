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
let audio = null, master = null, volumeGain = null, limiter = null, limiterOn = true, analyser = null;

const dbToGain = (db) => Math.pow(10, db / 20);

/** iOS-Unlock (@dpa 20260730: auf iPhone reagierte Start/Play, aber blieb stumm – auf
 *  Homepage-<audio> ging Ton problemlos). Manche WebKit-Versionen lassen `resume()` zwar
 *  auflösen, ohne die Audio-Hardware wirklich aufzuwecken – zuverlässig tut das nur ein
 *  TATSÄCHLICH gestarteter (stiller) Sound, und das MUSS synchron im selben
 *  User-Gesture-Callstack passieren wie der Klick/Touch selbst. */
function unlockIOS(ctx) {
    try {
        const buf = ctx.createBuffer(1, 1, ctx.sampleRate || 22050);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        src.start(0);
    } catch { /* kein Beinbruch, wenn das nicht klappt */ }
}

/** AudioContext + Master anlegen (nur beim ersten Aufruf, braucht eine Nutzer-Geste). */
export function ensureAudio() {
    if (audio) {
        if (audio.state === 'suspended') { audio.resume(); unlockIOS(audio); }
        return audio;
    }
    audio = new (window.AudioContext || window.webkitAudioContext)();
    unlockIOS(audio);
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
    // LevelMeter (@dpa 20260722, ddw.md „ich brauche auch einen LevelMeter"): reiner Abgriff
    // NACH dem Fader (zeigt also den Effekt der Lautstärke), aber unabhängig vom Limiter-
    // IO-Schalter — volumeGain bleibt in JEDEM Fall verbunden (anders als limiter selbst,
    // der beim Umgehen aus der Kette fliegt), darum hier abgegriffen statt an limiter/destination.
    analyser = audio.createAnalyser();
    analyser.fftSize = 512;
    volumeGain.connect(analyser);
    return audio;
}

export function getContext() { return audio; }
export function getMaster() { return master; }
export function getLimiter() { return limiter; }   // Debug/Test
export function getAnalyser() { return analyser; }   // LevelMeter

/** Master-Lautstärke in dB (@dpa: „dB basiert") – 0 = unity. */
export function setMasterDb(db) { if (volumeGain) volumeGain.gain.value = dbToGain(db); }
export function setLimiterOn(on) {
    limiterOn = !!on;
    if (!volumeGain || !limiter) return;
    // NUR die beiden umschaltbaren Kanten kappen (nicht volumeGain.disconnect() blind) — sonst
    // reißt das auch den permanenten Analyser-Abgriff fürs LevelMeter mit ab (@dpa 20260722:
    // Bug beim Bauen gefunden, s. Commit).
    try { volumeGain.disconnect(limiter); } catch { /* schon getrennt */ }
    try { volumeGain.disconnect(audio.destination); } catch { /* schon getrennt */ }
    if (limiterOn) { volumeGain.connect(limiter); } else { volumeGain.connect(audio.destination); }
}
export function setLimiterAttack(ms) { if (limiter) limiter.attack.value = Math.max(0, ms) / 1000; }
export function setLimiterRelease(ms) { if (limiter) limiter.release.value = Math.max(0, ms) / 1000; }
