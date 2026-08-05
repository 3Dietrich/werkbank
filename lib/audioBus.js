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
 * ein hochgezogener Fader ihn wieder übersteuern lassen. Kein AudioWorklet nötig, dafür
 * NICHT latenzfrei: der native DynamicsCompressorNode hat in Chromium ein festes internes
 * Pre-Delay von 256 Samples (~6ms @44.1kHz, unabhängig von attack/release — Quelle:
 * kDefaultPreDelayFrames in dynamics_compressor_kernel.h, per OfflineAudioContext
 * nachgemessen: 264 Samples ≈ 5,99ms), das den Lookahead für die Pegelerkennung liefert.
 * (@dpa ddw.md 20260804: Debug-Messung deckte das auf.)
 *
 * WaveShaper-Soft-Clip (@dpa ddw.md 20260802: „WaveShaperNode. Klingt interessant, bau es
 * gerne ein mit ein/aus-Schalter"): zusätzliches, komplett natives Sicherheitsnetz NACH dem
 * Limiter, vor destination — eine Alternative/Ergänzung zum AudioWorklet-Limiter, unkritisch
 * für Playwright (kein addModule(), löst headless anders als AudioWorklets problemlos auf).
 * Kette wird dafür zentral in `rebuildChain()` verkabelt statt weiterhin ad-hoc in
 * setLimiterOn() — beide Toggles (limiterOn, waveshaperOn) hängen von derselben Funktion ab,
 * damit alle vier Kombinationen (an/aus × an/aus) sauber ohne doppelte Kanten entstehen.
 * Default AUS (@dpa-Regel „nichts am Klang ändern, was @dpa noch nicht gehört hat"). Auch
 * WS ist nicht latenzfrei: `oversample='4x'` addiert eigenes Gruppendelay von der Up-/
 * Downsampling-Filterung (gemessen ~192 Samples ≈ 4,35ms; mit `oversample='none'` 0ms).
 * Beide Delays (Lim + WS) sitzen seriell hintereinander und addieren sich linear.
 *
 * Limiter Phase 2 — eigener AudioWorklet statt nativem Compressor (@dpa 20260805, Folge
 * von lib/audio/limiterProcessor.js Phase 1/deafa52: „Lookahead-Ringpuffer eingebaut …
 * NOCH NICHT in die App verdrahtet"): `ensureAudio()` legt zuerst wie bisher den nativen
 * `DynamicsCompressorNode` an (synchron, damit sofort Ton da ist), stößt danach
 * ASYNCHRON `loadWorkletLimiter()` an — sobald `wb-limiter` geladen ist, ersetzt
 * `swapInWorkletLimiter()` den `limiter`-Node live in der Kette (rebuildChain() reconnected
 * automatisch, weil sie immer den aktuellen Modul-Var `limiter` liest) und trennt den alten
 * nativen Node sauber ab. Schlägt `addModule()` fehl (nicht unterstützt, Playwright-Sandbox,
 * s. Kopfkommentar limiterProcessor.js) bleibt es beim nativen Compressor — bewusst
 * lautloser Fallback, kein Absturz. `limiterMode` ('native'|'worklet') hält fest, welcher
 * Typ gerade aktiv ist, weil Attack/Release/Lookahead je nach Typ unterschiedlich gesetzt
 * werden (native: Sekunden auf AudioParam; Worklet: Millisekunden auf `parameters.get(...)`).
 * `curAttackMs/curReleaseMs/curLookaheadMs` merken sich die zuletzt gesetzten Werte, damit
 * der frisch eingewechselte Worklet-Node beim Swap sofort dieselben Werte bekommt, auch wenn
 * die UI sie VOR dem Laden gesetzt hat. Die Reduktionsanzeige (LevelMeter liest `.reduction`,
 * ein natives DynamicsCompressorNode-Feld) bekommt der Worklet-Node künstlich nachgebildet:
 * sein `port.onmessage` schreibt den zuletzt gemeldeten Min-Gain (linear, alle 8 Render-
 * Quanten) als `.reduction` in dB auf den Node selbst — LevelMeter.js bleibt unverändert.
 */
let audio = null, master = null, volumeGain = null, limiter = null, limiterOn = true,
    waveshaper = null, waveshaperPreGain = null, waveshaperOn = false, analyser = null;
// Limiter Phase 2 (s. Kopfkommentar): 'native' = DynamicsCompressorNode (Start-/Fallback-
// Zustand), 'worklet' = eigener wb-limiter-AudioWorkletNode, sobald geladen+eingewechselt.
let limiterMode = 'native', workletLoadStarted = false;
let curAttackMs = 0.5, curReleaseMs = 250, curLookaheadMs = 0;

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
 *
 * `domainMax` (@dpa ddw.md 20260804, Debug-Fund: Pegel >0dBFS wurden hart auf ~-3,5dB
 * geklemmt statt weiter der Kurve zu folgen — „das ist Clip, kein Waveshaping"): der
 * WaveShaperNode mappt sein Kurven-Array laut Spec IMMER auf Eingang [-1,1], unabhängig von
 * der Array-Länge — Eingänge außerhalb werden vom Browser hart auf den Randwert der Tabelle
 * geklemmt. `domainMax` weitet den ABGEBILDETEN Bereich der Formel auf [-domainMax,
 * domainMax], indem die Tabelle `f(domainMax·u)` für u∈[-1,1] enthält; ein GainNode mit
 * `1/domainMax` VOR dem WaveShaper staucht reale Eingänge zurück auf u — für |x|≤1 (der
 * bisherige Bereich) kommt exakt derselbe Wert raus wie mit domainMax=1 (@dpa-Vorgabe „darf
 * nicht leiser werden"), erst Pegel darüber folgen jetzt weiter der Kurve statt hart zu
 * klemmen. Ceiling bleibt bei genau 1.0 (0dBFS), weil die Formel für jedes endliche x < 1
 * bleibt (asymptotisch, nie erreicht/überschritten).
 */
function buildSoftClipCurve(exponent = 1.7, points = 2048, domainMax = 1) {
    const curve = new Float32Array(points);
    for (let i = 0; i < points; i++) {
        const u = (i / (points - 1)) * 2 - 1;   // i läuft 0..points-1 → u läuft -1..1
        const x = u * domainMax;                // abgebildeter Formel-Bereich: -domainMax..domainMax
        const a = Math.abs(x);
        curve[i] = x / Math.pow(1 + Math.pow(a, exponent), 1 / exponent);
    }
    return curve;
}

/** Wie weit über 0dBFS (±1) die WS-Kurve noch weich abbildet, bevor der native Rand der
 *  WaveShaperNode-Tabelle greift (s. Kommentar buildSoftClipCurve). 4 = bis +12dB Overshoot
 *  noch rund, keine hörbare Änderung im bisherigen Bereich. */
const WS_DOMAIN_MAX = 4;

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
    [volumeGain, limiter, waveshaperPreGain, waveshaper].forEach((node) => {
        if (!node) return;
        try { node.disconnect(); } catch { /* schon getrennt */ }
    });
    let node = volumeGain;
    if (limiterOn && limiter) { node.connect(limiter); node = limiter; }
    if (waveshaperOn && waveshaper && waveshaperPreGain) {
        node.connect(waveshaperPreGain); waveshaperPreGain.connect(waveshaper); node = waveshaper;
    }
    node.connect(audio.destination);
    if (analyser) node.connect(analyser);
}

/**
 * Lädt den `wb-limiter`-AudioWorklet-Prozessor (lib/audio/limiterProcessor.js) und wechselt
 * bei Erfolg den aktiven `limiter`-Node live um (s. Kopfkommentar „Limiter Phase 2"). Fire-
 * and-forget von `ensureAudio()` aus — bleibt bewusst asynchron, damit `ensureAudio()` selbst
 * synchron bleibt (iOS-Unlock MUSS im selben User-Gesture-Callstack laufen, s. unlockIOS).
 * Schlägt das Laden fehl (Browser ohne AudioWorklet-Support, Playwright-Sandbox), bleibt der
 * native DynamicsCompressorNode aktiv — stiller Fallback, kein Fehler nach außen.
 */
async function loadWorkletLimiter(ctx) {
    if (workletLoadStarted) return;
    workletLoadStarted = true;
    try {
        await ctx.audioWorklet.addModule(new URL('./audio/limiterProcessor.js', import.meta.url));
        if (!audio || audio !== ctx) return;   // Context inzwischen weg/gewechselt
        const node = new AudioWorkletNode(ctx, 'wb-limiter', { numberOfInputs: 1, numberOfOutputs: 1 });
        node.parameters.get('attackMs').value = curAttackMs;
        node.parameters.get('releaseMs').value = curReleaseMs;
        node.parameters.get('lookaheadMs').value = curLookaheadMs;
        node.reduction = 0;   // Startwert, bis die erste Meldung eintrifft
        node.port.onmessage = (e) => {
            const g = typeof e.data === 'number' && e.data > 0 ? e.data : 1;
            node.reduction = g >= 1 ? 0 : 20 * Math.log10(g);   // linear→dB, wie das native Feld
        };
        const oldLimiter = limiter;
        limiter = node;
        limiterMode = 'worklet';
        rebuildChain();
        try { oldLimiter && oldLimiter.disconnect(); } catch { /* schon getrennt */ }
    } catch (err) {
        console.warn('wb-limiter-Worklet konnte nicht geladen werden, bleibe beim nativen Compressor:', err);
    }
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
    // Pre-Gain staucht den erweiterten Formel-Bereich zurück in den [-1,1]-Eingang, den die
    // WaveShaperNode-Tabelle abbildet (s. Kommentar buildSoftClipCurve/WS_DOMAIN_MAX).
    waveshaperPreGain = audio.createGain();
    waveshaperPreGain.gain.value = 1 / WS_DOMAIN_MAX;
    waveshaper = audio.createWaveShaper();
    waveshaper.curve = buildSoftClipCurve(1.7, 2048, WS_DOMAIN_MAX);
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
    loadWorkletLimiter(audio);   // async, tauscht limiter bei Erfolg live um (s.o.)
    return audio;
}

export function getContext() { return audio; }
export function getMaster() { return master; }
export function getLimiter() { return limiter; }   // Debug/Test
export function getWaveshaper() { return waveshaper; }   // Debug/Test
export function getWaveshaperPreGain() { return waveshaperPreGain; }   // Debug/Test
export function getAnalyser() { return analyser; }   // LevelMeter

/** Master-Lautstärke in dB (@dpa: „dB basiert") – 0 = unity. */
export function setMasterDb(db) { if (volumeGain) volumeGain.gain.value = dbToGain(db); }
export function setLimiterOn(on) { limiterOn = !!on; rebuildChain(); }
/** Attack/Release: native Node erwartet Sekunden im AudioParam, der Worklet-Node bekommt
 *  die ms roh (s. limiterProcessor.js computeCoeff, rechnet selbst /1000). Beide Werte
 *  bleiben in curAttackMs/curReleaseMs gemerkt, damit ein SPÄTER eingewechselter Worklet-
 *  Node (Laden ist async) sofort denselben Stand bekommt. */
export function setLimiterAttack(ms) {
    curAttackMs = Math.max(0, ms);
    if (!limiter) return;
    if (limiterMode === 'worklet') limiter.parameters.get('attackMs').value = curAttackMs;
    else limiter.attack.value = curAttackMs / 1000;
}
export function setLimiterRelease(ms) {
    curReleaseMs = Math.max(0, ms);
    if (!limiter) return;
    if (limiterMode === 'worklet') limiter.parameters.get('releaseMs').value = curReleaseMs;
    else limiter.release.value = curReleaseMs / 1000;
}
/** Lookahead-Vorlauf (ms) — NUR der Worklet-Node kann das (s. limiterProcessor.js), der
 *  native Compressor hat kein steuerbares Lookahead (fixes Pre-Delay, s. Kopfkommentar).
 *  Wert bleibt trotzdem gemerkt, auch während noch der native Node aktiv ist, damit er beim
 *  Umschalten auf den Worklet-Node (async) nicht verloren geht. Default 0 = kein Vorlauf. */
export function setLimiterLookahead(ms) {
    curLookaheadMs = Math.max(0, ms);
    if (limiter && limiterMode === 'worklet') limiter.parameters.get('lookaheadMs').value = curLookaheadMs;
}
export function getLimiterMode() { return limiterMode; }   // Debug/Test
/** WaveShaper-Soft-Clip an/aus (@dpa ddw.md 20260802) – Sicherheitsnetz NACH dem Limiter. */
export function setWaveshaperOn(on) { waveshaperOn = !!on; rebuildChain(); }
