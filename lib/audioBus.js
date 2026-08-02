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
 *
 * WaveShaper-Soft-Clip (@dpa ddw.md 20260802: „WaveShaperNode. Klingt interessant, bau es
 * gerne ein mit ein/aus-Schalter"): zusätzliches, komplett natives Sicherheitsnetz NACH dem
 * Limiter, vor destination — eine Alternative/Ergänzung zum AudioWorklet-Limiter, unkritisch
 * für Playwright (kein addModule(), löst headless anders als AudioWorklets problemlos auf).
 * Kette wird dafür zentral in `rebuildChain()` verkabelt statt weiterhin ad-hoc in
 * setLimiterOn() — beide Toggles (limiterOn, waveshaperOn) hängen von derselben Funktion ab,
 * damit alle vier Kombinationen (an/aus × an/aus) sauber ohne doppelte Kanten entstehen.
 * Default AUS (@dpa-Regel „nichts am Klang ändern, was @dpa noch nicht gehört hat").
 */
let audio = null, master = null, volumeGain = null, limiter = null, limiterOn = true,
    waveshaper = null, waveshaperOn = false, analyser = null;

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

/**
 * Baut die Soft-Clip-Kurve für den WaveShaper. Zwei Korrekturrunden (@dpa 20260802):
 * (1) „WS Button erzeugt direkt Verzerrung. trotz Limiter!" — die erste Fassung war
 * `tanh(k·x)/tanh(k)` mit k=3, Steigung am Nullpunkt `k/tanh(k) ≈ 3.02` (Drive-Formel,
 * keine Sicherheitsnetz-Kurve, verstärkte schon leise Pegel).
 * (2) „bitte Knick vermeiden" — die Zwischenfassung war stückweise (linear bis zu einem
 * Knie, danach tanh), Wert UND Steigung passten an der Naht zusammen (C¹), aber die
 * KRÜMMUNG sprang dort — genau dieser Wechsel der Kurvenform war der gemeinte „Knick".
 * Jetzt EINE einzige glatte Formel über den ganzen Bereich, kein Umschalten irgendwo:
 * `y = x / (1+|x|^EXPONENT)^(1/EXPONENT)` — die verallgemeinerte „Lp-Soft-Clip"-Familie
 * (@dpa-Vorgabe „umgedrehte x^1.7"): bei EXPONENT=1 der klassische einfache Soft-Clipper
 * `x/(1+|x|)`, für EXPONENT→∞ nähert sie sich einem harten Clip bei ±1 an — 1.7 liegt
 * dazwischen (rund, aber bereits recht früh greifend). Steigung am Nullpunkt ist für
 * JEDEN Exponenten analytisch exakt 1 (transparent bei sehr leisen Pegeln), keine
 * Fallunterscheidung nötig. EXPONENT bewusst als benannte Konstante oben im Funktionskopf
 * (nicht vergraben) — schnell von Hand nachjustierbar fürs nächste Hördurchgang, ohne
 * extra UI (@dpa hat ein „vorübergehend einstellbar" angeboten, aber noch nicht verlangt).
 * `points` = Auflösung der Lookup-Tabelle (2048 = glatt genug, kein hörbares Treppen).
 */
function buildSoftClipCurve(exponent = 1.7, points = 2048) {
    const curve = new Float32Array(points);
    for (let i = 0; i < points; i++) {
        const x = (i / (points - 1)) * 2 - 1;   // i läuft 0..points-1 → x läuft -1..1
        const a = Math.abs(x);
        curve[i] = x / Math.pow(1 + Math.pow(a, exponent), 1 / exponent);
    }
    return curve;
}

/**
 * Zentrale Verkabelung der Monitor-Kette, abhängig von BEIDEN Togglen (limiterOn,
 * waveshaperOn). Kappt zuerst alle umschaltbaren Ausgänge (volumeGain/limiter/waveshaper –
 * NICHT master→volumeGain, das ist die permanente Eingangskante), baut dann die Kette
 * frisch: volumeGain → [limiter falls an] → [waveshaper falls an] → destination + analyser.
 * Der Analyser hängt IMMER am tatsächlichen Ende der aktiven Kette (s. Kommentar oben bei
 * ensureAudio) – so zeigt er in allen vier Kombinationen den echten Ausgangspegel.
 */
function rebuildChain() {
    if (!volumeGain || !audio) return;
    [volumeGain, limiter, waveshaper].forEach((node) => {
        if (!node) return;
        try { node.disconnect(); } catch { /* schon getrennt */ }
    });
    let node = volumeGain;
    if (limiterOn && limiter) { node.connect(limiter); node = limiter; }
    if (waveshaperOn && waveshaper) { node.connect(waveshaper); node = waveshaper; }
    node.connect(audio.destination);
    if (analyser) node.connect(analyser);
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
    // WaveShaper-Soft-Clip (@dpa ddw.md 20260802) – oversample '4x' wichtig, weil eine
    // Nichtlinearität sonst hörbares Aliasing ins Spektrum spiegelt. Default AUS.
    waveshaper = audio.createWaveShaper();
    waveshaper.curve = buildSoftClipCurve(1.7, 2048);
    waveshaper.oversample = '4x';
    master.connect(volumeGain);
    // LevelMeter/Clip-Anzeige (@dpa 20260722, erweitert dd.md 20260802: „MasterLevel darf
    // eigentlich bei Lim mit Att=0 nicht mehr clippen können. Tut's aber noch" — der Analyser
    // maß bis dahin VOR dem Limiter (bewusste Entscheidung von damals: „unabhängig vom
    // Limiter-IO-Schalter"), zeigte also nie dessen Wirkung, sondern nur den rohen gefaderten
    // Pegel — der Clip-Fleck konnte darum leuchten, obwohl der TATSÄCHLICHE Ausgang längst
    // begrenzt war. Jetzt zapft der Analyser denselben Pfad wie destination: NACH der ganzen
    // aktiven Kette (rebuildChain() zieht die Kante immer mit) — der Meter zeigt damit immer
    // den echten Ausgangspegel, in allen Limiter/Waveshaper-Kombinationen.
    analyser = audio.createAnalyser();
    analyser.fftSize = 512;
    rebuildChain();
    return audio;
}

export function getContext() { return audio; }
export function getMaster() { return master; }
export function getLimiter() { return limiter; }   // Debug/Test
export function getWaveshaper() { return waveshaper; }   // Debug/Test
export function getAnalyser() { return analyser; }   // LevelMeter

/** Master-Lautstärke in dB (@dpa: „dB basiert") – 0 = unity. */
export function setMasterDb(db) { if (volumeGain) volumeGain.gain.value = dbToGain(db); }
export function setLimiterOn(on) { limiterOn = !!on; rebuildChain(); }
export function setLimiterAttack(ms) { if (limiter) limiter.attack.value = Math.max(0, ms) / 1000; }
export function setLimiterRelease(ms) { if (limiter) limiter.release.value = Math.max(0, ms) / 1000; }
/** WaveShaper-Soft-Clip an/aus (@dpa ddw.md 20260802) – Sicherheitsnetz NACH dem Limiter. */
export function setWaveshaperOn(on) { waveshaperOn = !!on; rebuildChain(); }
