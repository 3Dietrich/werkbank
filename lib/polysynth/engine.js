/**
 * engine.js — Poly-Synth: die HÖRBARE Naht (@dpa 20260721: „das Thema hier ist Audio,
 * stumm ist nur die Fassade — sinnlos"). Kernstück: die Voice-Engine (Poly-Synth-Schritt 2)
 * — `noteOn(note, velocity)`/`noteOff(note)` mit einstellbarer Polyphonie (`polyMax`),
 * Voice-Stealing (`voiceSteal`) und optionalem zweitem, verstimmtem Oszillator pro Voice
 * (`osc2On`/`detune`).
 *
 * Der anfängliche Test-Ton (Schritt-1-Übergangslösung, reiner Sinus auf der effektiven
 * BaseFreq zum Vergleichs-Hören) ist wieder entfernt (@dpa 20260721_203557: „durch die
 * echte Voice-Engine jetzt überflüssig").
 *
 * Schritt 3 (@dpa 20260721): die gespielten Noten rasten per `harmonizeMix` (0=roh …
 * 1=voll) auf das Harmonie-Raster um die effektive BaseFrq (harmonicSnap) — dieselbe
 * Überblendung wie teslacoils `quantizeToScale`. Ändert sich die BaseFrq/harmonizeMix
 * LIVE, werden gehaltene Voices per `pitchSmooth` (LP-Glide der Osc-Frequenz) nachgezogen
 * statt hart gesprungen → kein Zipper/Klick.
 *
 * Schritt 4 (@dpa 20260721): echtes ADSR pro Voice (`ampAttack`/`ampDecay`/`ampSustain`/
 * `ampRelease`) statt der alten festen Anti-Klick-Rampe — Attack linear, Decay/Release
 * log/exponentiell. Peak UND Sustain-Level hängen an derselben Velocity-Skalierung.
 *
 * baseSrc='Tempo' braucht ein BPM von AUSSEN (Poly-Synth ist bewusst nicht hart an
 * taktmetro gekoppelt) — werkbank.js reicht das über setBpmSource() rein.
 *
 * Audio-Bus (@dpa 20260721, „Rec nicht in Poly drin, sondern als Extra Instrument"):
 * kein eigener AudioContext mehr — alle Instrumente teilen sich EINEN Bus
 * (lib/audioBus.js), damit ein instrumentübergreifendes Rec „alles Hörbare" fassen kann.
 */
import { foldToBand, midiToFreq, freqToMidi, harmonicSnap, NOTE_NAMES, setConcertPitch } from './pitch/Scaler.js';
import { oscCoefficients, harmonicsForFreq } from './audio/pulseWave.js';
import { ensureAudio as ensureBus, getContext, getMaster } from '../audioBus.js';
import { busLatencyMs } from '../routing/latency.js';

export function createPolySynthEngine(state) {
    let _getBpm = () => 120;
    setConcertPitch(state.get('kammerton'));   // Kammerton (@dpa 20260722_013727), Default 440Hz

    function ensureAudio() { ensureBus(); }

    /** BPM-Quelle für baseSrc='Tempo' von außen setzen (z.B. taktState.get('bpm')). */
    function setBpmSource(fn) { _getBpm = fn || (() => 120); }

    /** Effektive BaseFreq aus der gewählten Quelle, gefaltet ins Band [baseBand, 2·baseBand)
     *  — 1:1 die Rechnung aus teslacoils TeslaEngine.js (get baseFreq()). */
    function baseFreq() {
        let f;
        switch (state.get('baseSrc')) {
            case 'Tempo': f = _getBpm() / 60; break;              // Beat-Frequenz
            case 'Ton': {
                const pc = Math.max(0, NOTE_NAMES.indexOf(state.get('baseNote')));
                f = midiToFreq(3 * 12 + pc);                       // C2 (=MIDI 36) als Anker
                break;
            }
            default: f = state.get('baseHz');
        }
        return foldToBand(f, state.get('baseBand'));
    }

    const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

    /** Zielfrequenz einer gespielten Note (Poly-Synth-Schritt 3). Roh = midiToFreq, dann —
     *  EXAKT wie teslacoils quantizeToScale — per harmonizeMix zwischen unquantisiert (0) und
     *  voll auf das Harmonie-Raster um die effektive BaseFrq gezogen (1) überblendet.
     *  harmonicSnap rastet Töne ÜBER der Basis auf n·BF, DARUNTER auf Sub-Oktaven BF/2^k.
     *  Bewusst KEIN eigener An/Aus-Schalter: harmonizeMix=0 IST das A/B-„aus" (@dpa hört so).
     *
     *  Modulationszugriffe (ddw.md 20260725, Multi-ADSR):
     *    preMod(note)  — VOR  harmonicSnap: raw' = raw * (1 + mod)
     *    postMod(note) — NACH der Überblendung: out' = out * (1 + mod)
     *  Beide Default 1 → ohne aktive Verbindung bit-identisch zum bisherigen Verhalten.
     *  Live-Wirkung: setPreMod/setPostMod lösen bei Wertänderung retuneHeld() aus —
     *  gehaltene Töne gleiten per pitchSmooth zur modulierten Frequenz (kein Zipper).
     *  Der write() vom Routing ruft nur noch den Wert-Setter (Zahl), keinen Closure-Getter. */
    let preMod = () => 1;
    let postMod = () => 1;
    let _preModV = 0, _postModV = 0;
    function noteFreq(note) {
        const raw = midiToFreq(note) * preMod(note);
        const mix = clamp01(state.get('harmonizeMix') || 0);
        const baseHz = baseFreq();
        if (mix <= 0 || baseHz <= 0) return raw * postMod(note);   // roh (kein Snap)
        const harmHz = harmonicSnap(raw, baseHz);
        const out = raw * (1 - mix) + harmHz * mix;                // überblendet roh↔gerastet
        return out * postMod(note);
    }

    /** LP-Glide-Zeitkonstante aus dem pitchSmooth-Knob (Sekunden). setTargetAtTime erreicht
     *  ~95 % nach 3·tau → tau = pitchSmooth/3, damit der Knob-Wert grob die Glide-DAUER ist.
     *  pitchSmooth=0 → tau 0 → harter Sprung (Rückwärtskompatibilität/Vergleich). */
    function pitchTau() {
        const s = Math.max(0, state.get('pitchSmooth') || 0);
        return s > 0 ? s / 3 : 0;
    }

    state.subscribe((k) => {
        // BaseFrq-Quelle verstellt → alle gehaltenen Voices retunen (deren Quantisierung
        // hängt an der BaseFrq); harmonizeMix ändert nur das Noten-Raster.
        if (k === 'baseSrc' || k === 'baseHz' || k === 'baseBand' || k === 'baseNote') retuneHeld();
        else if (k === 'harmonizeMix') retuneHeld();
        // Kammerton verstellt (@dpa 20260722_013727) → wirkt auf ALLE Frequenzberechnungen
        // (Scaler.js ist modul-weit gültig), gehaltene Voices sofort nachziehen.
        else if (k === 'kammerton') { setConcertPitch(state.get('kammerton')); retuneHeld(); }
        // Osz-Klangfarbe verstellt (@dpa 20260722_013727: „die Änderungen sollten ständig
        // upgedatet werden") → gehaltene Voices bekommen die neue Wellenform SOFORT, statt erst
        // beim nächsten Anschlag (retimbreHeld, s.u.).
        else if (k === 'oscEngine' || k === 'duty' || k === 'fmFeedback') retimbreHeld();
        // Detune live nachziehen (@dpa 20260722_172315: „Detune … ist noch nicht 'live'") —
        // NUR für Voices, die schon mit Osc2 gestartet sind (ratios.length===2 in redetuneHeld);
        // osc2On selbst SCHALTET keinen Oszillator-Node nachträglich zu/ab (Amplituden-
        // Rebalance mitten in der ADSR-Rampe wäre riskant ohne @dpas Ohr) — wirkt weiter erst
        // beim nächsten Anschlag, wie bisher.
        else if (k === 'detune') redetuneHeld();
        // Höhen-Dämpfung live nachziehen (@dpa ddw.md 20260724_003531, KORRIGIERTE Vorstellung:
        // NICHT die Obertöne der Oszillator-Wellenform, sondern das Amplituden-Verhältnis jeder
        // gespielten Note ZUR BASEFREQ selbst — „das ist das Coole an diesem Ensemble", Noten
        // sind ja schon per harmonicSnap auf Obertöne/Subharmonische der BaseFreq gerastert).
        else if (k === 'oscTilt') retiltHeld();
    });

    /** Amp-Faktor der Höhen-Dämpfung für EINE Oszillator-Frequenz (@dpa ddw.md 20260724_003531,
     *  wörtlich: „jede Frequenz … hat ein Verhältnis zur BasisFreq. lass es 34.56 sein. dieser
     *  Ton kriegt bei OscTilt folgende Amp angaben 0:1, 100:1/34.56, >100:<1/34.56
     *  (logarithmisch, … kommt der Null immer näher, aber erreicht sie nie)". Also: ratio =
     *  freq/baseFreq, gain = ratio^(−tilt/100) — bei tilt=0 exponent 0 → 1, bei tilt=100
     *  exponent −1 → 1/ratio, bei tilt→∞ exponentiell gegen 0 (nie exakt 0). BEWUSST 1:1 die
     *  genannte Formel, keine Symmetrie-/Clamp-Korrektur für ratio<1 (Ton unter der BaseFreq) —
     *  das wird dann rechnerisch lauter statt leiser, exakt wie die Formel es hergibt. */
    function tiltGainFor(freq) {
        const tilt = state.get('oscTilt') || 0;
        if (!tilt) return 1;
        const bf = baseFreq();
        if (!(bf > 0) || !(freq > 0)) return 1;
        const ratio = freq / bf;
        if (ratio === 1) return 1;
        return Math.pow(ratio, -tilt / 100);
    }

    /** Alle gehaltenen Voices: Dämpfungs-Gain jedes Oszillators auf dessen AKTUELLE Frequenz
     *  neu berechnen (oscTilt-Knob live verstellt, s. state.subscribe oben). */
    function retiltHeld() {
        const audio = getContext();
        if (!audio || held.size === 0) return;
        const t = audio.currentTime;
        const tau = pitchTau();
        for (const voice of held.values()) {
            if (voice.releasing) continue;
            voice.oscs.forEach((osc, i) => {
                const g = tiltGainFor(osc.frequency.value);
                if (tau > 0) voice.damps[i].gain.setTargetAtTime(g, t, tau);
                else voice.damps[i].gain.setValueAtTime(g, t);
            });
        }
    }

    // ── Voice-Engine (Poly-Synth-Schritt 2, @dpa 20260721) ──────────────────────────────
    // TASTATUR/MIDI-Muster, NICHT teslacoils getakteter S&H-Arpeggiator: dort ist jeder
    // Trigger eine neue Voice mit bekannter Len (SquareOsc.trigger(time,freq,dur)). Hier
    // hält eine gedrückte Taste eine Note UNBESTIMMT lange, bis noteOff kommt — es gibt kein
    // Len. Deshalb hier eine eigene, schlanke Gate-Voice (Anti-Klick-Attack → Sustain bis
    // noteOff → kurzes Release) statt SquareOsc, das für den Hold-Fall auf retune()/Slide
    // ausgelegt ist. Gebacken wird die Wellenform mit denselben Bausteinen wie SquareOsc
    // (audio/pulseWave.js), damit Klangfarbe/Bandlimitierung identisch sind.
    const held = new Map();          // MIDI-Note → Voice; Einfüge-Reihenfolge = Anschlag-Reihenfolge (→ „ältestes")
    const activeVoices = new Set();  // ALLE klingenden Voices inkl. auslaufender (Debug/Panik/Node-Zählung)
    const waveCache = new Map();     // (engine,param,N) → PeriodicWave: nicht bei jedem Anschlag neu backen

    const AMP_BASE = 0.3;            // Grund-Amp pro Voice (Velocity skaliert darauf) — Headroom für Polyphonie
    const STEAL_RELEASE = 0.012;    // schneller, aber knackfrei — NUR für Stealing/Retrigger (technisch, kein Musik-Parameter)

    /** Gebackene PeriodicWave aus Cache holen/erzeugen (identische engine/param/N wiederverwenden). */
    function bakedWave(audio, engine, param, N) {
        const key = `${engine}_${Math.round(param * 200)}_${N}`;
        let w = waveCache.get(key);
        if (!w) {
            const { real, imag } = oscCoefficients(engine, param, 0, N);
            w = audio.createPeriodicWave(real, imag, { disableNormalization: false });
            if (waveCache.size > 128) waveCache.clear();
            waveCache.set(key, w);
        }
        return w;
    }

    function cleanupVoice(voice) {
        try {
            voice.oscs.forEach((o) => o.disconnect());
            voice.damps.forEach((d) => d.disconnect());
            voice.gain.disconnect();
        } catch { /* schon getrennt */ }
        activeVoices.delete(voice);
    }

    /** Eine Voice bauen: 1 Osc EXAKT auf freq, ODER (osc2On) 2 Oszillatoren symmetrisch um
     *  ±detune/2 Cent verstimmt. Bewusst NUR bei osc2On ein zweiter Node (@dpa: „kein zweiter,
     *  stummgeschalteter Oszillator nebenbei — wirklich nur einer, sauber phasenrichtig"). Beide
     *  starten phasengleich (frische Nodes, eingebackene Phase) → die Schwebung kommt allein aus
     *  der Verstimmung, nicht aus einem Zufalls-Phasenversatz. */
    function spawnVoice(note, velocity) {
        const audio = getContext();
        const t = audio.currentTime;
        // Poly-Synth-Schritt 3: NICHT mehr die rohe midiToFreq, sondern die per harmonizeMix
        // aufs BaseFrq-Raster gezogene Zielfrequenz (harmonizeMix=0 → identisch zu vorher).
        const freq = noteFreq(note);
        const engine = state.get('oscEngine');
        const param = engine === 'Sine-FM' ? state.get('fmFeedback') : state.get('duty');

        const two = !!state.get('osc2On');
        // Detune wirkt NUR bei aktivem Osc2. spread = halbe Gesamt-Verstimmung → symmetrisch ±spread.
        const spread = two ? Math.max(0, Math.min(99, state.get('detune') || 0)) / 2 : 0;
        const ratios = two ? [Math.pow(2, -spread / 1200), Math.pow(2, spread / 1200)] : [1];

        const g = audio.createGain();
        // Poly-Synth-Schritt 4 (@dpa): echtes ADSR statt der alten Anti-Klick-Rampe. Attack
        // LINEAR (0→Peak), Decay LOG/exponentiell (Peak→Sustain-Level) — „log" heißt hier wie
        // überall sonst im Code (SquareOsc-Release, teslacoil-ASR): exponentialRampToValueAtTime,
        // weil das Ohr Lautstärke-Änderungen logarithmisch wahrnimmt (linearer dB-Abfall).
        // Zwei summierte Oszillatoren wären doppelt so laut → Peak pro Osc auf 1/Anzahl teilen.
        // Peak UND Sustain hängen an DERSELBEN Velocity-Skalierung (velScale) — @dpa wollte
        // „gleicher Faktor", kein zweiter, unabhängiger Vel-Bezug für den Sustain-Level.
        const velScale = Math.max(0, Math.min(1, velocity / 127));
        const peak = AMP_BASE * velScale / ratios.length;
        const attack = Math.max(0.001, state.get('ampAttack') ?? 0.01);
        const decay = Math.max(0.001, state.get('ampDecay') ?? 0.15);
        const sustainRatio = clamp01(state.get('ampSustain') ?? 0.7);
        // exponentialRamp erreicht nie echte 0 (RangeError) → Sustain-Level auf einen minimalen
        // Boden klemmen, auch bei sustainRatio=0 (dann klingt die Note nach dem Decay quasi stumm,
        // aber der noteOff-Release bleibt danach immer noch ein sauberer Ramp, kein harter Sprung).
        const sustainLevel = Math.max(0.0001, peak * sustainRatio);
        const aEnd = t + attack, dEnd = aEnd + decay;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(Math.max(0.0001, peak), aEnd);     // Attack: linear
        g.gain.exponentialRampToValueAtTime(sustainLevel, dEnd);          // Decay: log auf Sustain
        // Danach hält der Gain implizit auf sustainLevel (kein weiteres Event nötig) bis noteOff
        // die Release-Rampe einplant (releaseVoice).
        g.connect(getMaster());

        // Höhen-Dämpfung (@dpa ddw.md 20260724_003531): EIN Damp-GainNode je Oszillator,
        // ZWISCHEN Osc und dem gemeinsamen ADSR-Gain `g` — die AmpEnv bleibt dadurch weiter
        // EINE Instanz pro Voice (nicht pro Oszillator dupliziert). Gain = Verhältnis der
        // Osc-Frequenz zur BaseFreq, s. tiltGainFor().
        const damps = [];
        const oscs = ratios.map((r) => {
            const f = Math.max(1, freq * r);
            const N = harmonicsForFreq(f, audio.sampleRate, 2048);   // je höher der Ton, desto weniger Obertöne (Anti-Alias)
            const osc = audio.createOscillator();
            osc.setPeriodicWave(bakedWave(audio, engine, param, N));
            osc.frequency.value = f;
            const damp = audio.createGain();
            damp.gain.value = tiltGainFor(f);
            osc.connect(damp);
            damp.connect(g);
            osc.start(t);
            damps.push(damp);
            return osc;
        });

        // ratios auf der Voice merken → retuneHeld() kann die BaseFrq-Verschiebung nachziehen
        // und dabei die (unveränderte) Osc2-Verstimmung beibehalten.
        const voice = { note, oscs, damps, ratios, gain: g, peak, releasing: false };
        activeVoices.add(voice);
        // Erst wenn ALLE Oszillatoren geendet haben, die Voice abräumen (Nodes trennen).
        let ended = 0;
        oscs.forEach((osc) => { osc.onended = () => { if (++ended >= oscs.length) cleanupVoice(voice); }; });
        return voice;
    }

    /** Voice ausklingen lassen (Release) und ihre Oszillatoren zum Stopp planen. Greift GENAUSO,
     *  ob die Voice gerade im Attack/Decay oder schon im Sustain steht. Release LOG/exponentiell,
     *  wie Decay — `release` ist bei noteOff der ampRelease-Knob, bei Stealing/Retrigger die
     *  feste, kurze STEAL_RELEASE (technischer Anti-Klick, kein Musik-Parameter).
     *
     *  BUGFIX (@dpa 20260722, ddw.md: „NoteOffs schalten auf gefühlt 1/10 runter, dann kommt
     *  Release"): `cancelAndHoldAtTime` sollte den Gain auf seinem AKTUELLEN Wert einfrieren,
     *  ist aber gerade nach einer bereits ABGESCHLOSSENEN exponentialRamp (= genau der
     *  Sustain-Fall) in mehreren Web-Audio-Implementierungen unzuverlässig und liefert dann
     *  einen falschen (zu niedrigen) Ausgangswert. Robuster: den echten `gain.value` (der
     *  Getter liefert immer den korrekten, gerade geltenden Wert) explizit per
     *  `setValueAtTime` festpinnen, statt sich auf cancelAndHoldAtTime zu verlassen. */
    function releaseVoice(voice, release) {
        if (voice.releasing) return;
        voice.releasing = true;
        const audio = getContext();
        const t = audio.currentTime;
        const gain = voice.gain.gain;
        const r = Math.max(0.001, release);
        try {
            const current = Math.max(0.0001, gain.value);
            gain.cancelScheduledValues(t);
            gain.setValueAtTime(current, t);
            gain.exponentialRampToValueAtTime(0.0001, t + r);
            const stopAt = t + r + 0.02;
            voice.oscs.forEach((o) => { try { o.stop(stopAt); } catch { /* evtl. schon geplant */ } });
        } catch { /* Voice evtl. schon beendet */ }
    }

    /** Taste anschlagen. note = MIDI-Nummer (natürliches API für die spätere Tastatur/MIDI-
     *  Anbindung in Schritt 5), velocity 0..127. Rückgabe: die Voice, oder null (Note ignoriert).
     *  Voice-Allocation:
     *   • gleiche Note nochmal → alte Voice sofort frei (Retrigger),
     *   • unter polyMax gehaltenen Noten → neue Voice,
     *   • bei vollem polyMax → je nach voiceSteal: ältestes stehlen ODER neue Note ignorieren. */
    function noteOn(note, velocity = 100) {
        ensureAudio();
        const audio = getContext();
        if (audio.state === 'suspended') audio.resume();

        // Gleiche Note erneut gedrückt → alte Voice sofort freigeben (Retrigger), dann neu anschlagen.
        if (held.has(note)) { releaseVoice(held.get(note), STEAL_RELEASE); held.delete(note); }

        // KEIN hartes Deckel-Limit mehr (@dpa 20260722_172315, „Poly=24 - 8 Voices! BUG!"):
        // die Poly-Settings (KnobMetaEditor) erlauben ein frei gesetztes Max wie bei jedem
        // anderen Regler — ein zusätzlicher, unabhängiger Deckel HIER widersprach dem und
        // kappte still auf 8, egal was tatsächlich eingestellt war.
        const polyMax = Math.max(1, (state.get('polyMax') | 0) || 8);
        if (held.size >= polyMax) {
            if (state.get('voiceSteal')) {
                // Ältestes stehlen: erste (= älteste) gehaltene Note sanft releasen und aus dem Halt nehmen.
                const oldest = held.keys().next().value;
                releaseVoice(held.get(oldest), STEAL_RELEASE);
                held.delete(oldest);
            } else {
                return null;   // ignorieren: neue Note fällt weg, gehaltene Noten bleiben unangetastet
            }
        }

        const voice = spawnVoice(note, velocity);
        held.set(note, voice);
        return voice;
    }

    /** Taste loslassen: GENAU die zu dieser Note gehörende Voice releasen (nicht irgendeine),
     *  mit der musikalischen Release-Zeit aus dem ampRelease-Knob (Poly-Synth-Schritt 4). */
    function noteOff(note) {
        const voice = held.get(note);
        if (!voice) return;
        held.delete(note);
        releaseVoice(voice, state.get('ampRelease') ?? 0.3);
    }

    /** Alle gehaltenen Noten sofort loslassen (Panik/Reset). */
    function allNotesOff() {
        for (const v of held.values()) releaseVoice(v, STEAL_RELEASE);
        held.clear();
    }

    // Routing-Ziel des `trig`-Eingangsports (Phase 2/PHASE2_SPEC.md „Konkrete Port-
    // Deklarationen"): aus dem Stepseq-ISM hierher gezogen (war vorher Inline-Code in
    // werkbank.js, s. dortiger Kommentar an der alten Stelle). Dieselbe Note bleibt „gehalten",
    // bis sich die BaseFreq-Tonklasse ändert (dann erst ein echter noteOff auf die ALTE Note)
    // — sonst häuften sich Voices auf `held`, falls BaseFreq zwischen zwei Triggern wechselt.
    // Pro QUELLE (srcId, s. Registry.js deliver()) ein eigenes Gedächtnis, nicht eine einzige
    // geteilte Variable (Bugfix „lautes Getöse" bei 2+ aktiven Sq, ddw.md 20260724_192304):
    // mehrere Sq-Klone können unabhängig voneinander dasselbe trig-Ziel wählen. Mit EINER
    // Variable riss der jeweils andere Klon der ersten ständig die Note wieder ab, sobald er
    // selbst feuerte ("Wippe" zwischen zwei Tönen) — klang wie ein Getöse statt eines sauberen
    // Legato. Default-Key '' deckt Aufrufer ohne srcId ab (Rückwärtskompatibilität).
    const _trigHeldNotes = new Map();   // srcId -> zuletzt gehaltene Note
    /** @param {number} envHeight  0..1, aus dem AmpEnv-Port (Registry adaptiert AmpEnv-Ereignisse
     *  bereits auf >0, s. lib/routing/types.js)
     *  @param {string} [srcId]  Quellen-Kennung (s.o.) — welcher Sq-Klon/Aufrufer das ist. */
    function triggerFromEnv(envHeight, srcId = '') {
        const note = Math.round(freqToMidi(baseFreq()));
        const prev = _trigHeldNotes.get(srcId);
        if (prev != null && prev !== note) noteOff(prev);
        noteOn(note, Math.max(1, Math.min(127, Math.round(envHeight * 127))));
        _trigHeldNotes.set(srcId, note);
    }

    /** Poly-Synth-Schritt 3: alle GEHALTENEN Voices auf ihre neu berechnete Zielfrequenz
     *  nachziehen — nötig, wenn sich die effektive BaseFrq oder harmonizeMix LIVE ändert und
     *  dadurch die Quantisierung eine schon klingende Note verschiebt. Über pitchSmooth als
     *  Zeitkonstante (setTargetAtTime) statt hartem Sprung → kein Zipper/Klick auf gehaltenen
     *  Tönen; pitchSmooth=0 bleibt der harte Sprung. GILT NUR nachträglich für gehaltene Voices
     *  — der initiale Anschlag (spawnVoice) startet direkt auf seiner Zielfrequenz, kein Glide.
     *  Auslaufende (releasing) Voices werden bewusst NICHT mehr nachgezogen. */
    function retuneHeld() {
        const audio = getContext();
        if (!audio || held.size === 0) return;
        const t = audio.currentTime;
        const tau = pitchTau();
        for (const voice of held.values()) {
            if (voice.releasing) continue;
            const target = noteFreq(voice.note);
            voice.oscs.forEach((osc, i) => {
                const f = Math.max(1, target * voice.ratios[i]);
                if (tau > 0) osc.frequency.setTargetAtTime(f, t, tau);   // LP-Glide (anti-zipper)
                else osc.frequency.setValueAtTime(f, t);                 // pitchSmooth=0 → harter Sprung
                // BaseFreq kann sich HIER geändert haben → das Verhältnis freq/BaseFreq für
                // die Höhen-Dämpfung mitziehen (tiltGainFor hängt genau daran).
                const g = tiltGainFor(f);
                if (tau > 0) voice.damps[i].gain.setTargetAtTime(g, t, tau);
                else voice.damps[i].gain.setValueAtTime(g, t);
            });
        }
    }

    /** Detune-Knob live nachziehen (@dpa 20260722_172315). NUR Voices mit bereits ZWEI
     *  Oszillatoren (osc2On war beim Anschlag an) haben ein Osc2-Verhältnis, das sich neu
     *  verstimmen lässt — `ratios` wird dabei mit aktualisiert, damit retuneHeld/transposeHeld
     *  die neue Verstimmung weiter mitschleppen. Einzel-Oszillator-Voices (osc2On war aus)
     *  bleiben unangetastet — Osc2 selbst nachträglich zu-/abschalten bleibt dem nächsten
     *  Anschlag vorbehalten (s. Kopf-Kommentar am state.subscribe). */
    function redetuneHeld() {
        const audio = getContext();
        if (!audio || held.size === 0) return;
        const t = audio.currentTime;
        const tau = pitchTau();
        const spread = Math.max(0, Math.min(99, state.get('detune') || 0)) / 2;
        const newRatios = [Math.pow(2, -spread / 1200), Math.pow(2, spread / 1200)];
        for (const voice of held.values()) {
            if (voice.releasing || voice.ratios.length !== 2) continue;
            voice.ratios = newRatios;
            const target = noteFreq(voice.note);
            voice.oscs.forEach((osc, i) => {
                const f = Math.max(1, target * voice.ratios[i]);
                if (tau > 0) osc.frequency.setTargetAtTime(f, t, tau);
                else osc.frequency.setValueAtTime(f, t);
                const g = tiltGainFor(f);
                if (tau > 0) voice.damps[i].gain.setTargetAtTime(g, t, tau);
                else voice.damps[i].gain.setValueAtTime(g, t);
            });
        }
    }

    /** Akkord-Transponieren (@dpa 20260722_152438, ddw.md: „zwei Buttons +/-, schalten den
     *  Akkord (live) ± Halbton"): alle GEHALTENEN Voices bekommen eine neue Ziel-Note UND
     *  werden dorthin nachgezogen — wie retuneHeld, aber die Note selbst ändert sich (nicht
     *  nur die BaseFrq-Quantisierung), darum muss `held` neu einsortiert werden (Map-Key IST
     *  die Note). Auslaufende (releasing) Voices bleiben unangetastet UND in `held`, damit sie
     *  normal fertig ausklingen — sie werden nur nicht mehr transponiert. */
    function transposeHeld(semitones) {
        const audio = getContext();
        if (!audio || held.size === 0 || !semitones) return;
        const t = audio.currentTime;
        const tau = pitchTau();
        const entries = [...held.entries()];
        held.clear();
        for (const [oldNote, voice] of entries) {
            const newNote = voice.releasing ? oldNote : oldNote + semitones;
            voice.note = newNote;
            held.set(newNote, voice);
            if (voice.releasing) continue;
            const target = noteFreq(newNote);
            voice.oscs.forEach((osc, i) => {
                const f = Math.max(1, target * voice.ratios[i]);
                if (tau > 0) osc.frequency.setTargetAtTime(f, t, tau);
                else osc.frequency.setValueAtTime(f, t);
                const g = tiltGainFor(f);
                if (tau > 0) voice.damps[i].gain.setTargetAtTime(g, t, tau);
                else voice.damps[i].gain.setValueAtTime(g, t);
            });
        }
    }

    /** Osz-Klangfarbe verstellt (Engine/PW/FM, @dpa 20260722_013727) → gehaltene Voices
     *  bekommen die neue Wellenform SOFORT (setPeriodicWave), statt erst beim nächsten
     *  Anschlag. Frequenz/Phase bleiben unangetastet — nur die Form ändert sich. Auslaufende
     *  (releasing) Voices werden bewusst NICHT mehr nachgezogen, wie bei retuneHeld. */
    function retimbreHeld() {
        const audio = getContext();
        if (!audio || held.size === 0) return;
        const engine = state.get('oscEngine');
        const param = engine === 'Sine-FM' ? state.get('fmFeedback') : state.get('duty');
        for (const voice of held.values()) {
            if (voice.releasing) continue;
            const freq = noteFreq(voice.note);
            voice.oscs.forEach((osc, i) => {
                const f = Math.max(1, freq * voice.ratios[i]);
                const N = harmonicsForFreq(f, audio.sampleRate, 2048);
                osc.setPeriodicWave(bakedWave(audio, engine, param, N));
            });
        }
    }

    /** Takt-BPM hat sich geändert (@dpa 20260722_155726: „Quelle=Tempo sollte live geupdated
     *  werden — tut es noch nicht") — bpm lebt im TAKT-State, nicht hier, darum feuert der
     *  normale state.subscribe() oben (Zeile 82) nie von selbst. werkbank.js ruft das bei
     *  jeder taktState-bpm-Änderung; wirkt nur, wenn baseSrc gerade wirklich 'Tempo' ist (die
     *  Anzeige/BaseKeyboard folgt sowieso live über den Render-Loop — hier geht es um bereits
     *  GEHALTENE Voices, die sonst bis zum nächsten Anschlag auf der alten Beat-Frequenz blieben). */
    function notifyTempoChange() { if (state.get('baseSrc') === 'Tempo') retuneHeld(); }

    // ISM-Latenz-Vertrag (Phase 2.2): Poly-Synth hat keinen eigenen Scheduler-Vorlauf (Voices
    // starten sofort auf die Nutzer-Geste/den Trigger hin) — reiner Bus-Anteil.
    function latency() { return busLatencyMs(); }

    /** Effektive Tonklasse der aktuellen BaseFreq als 1..12 (Port `baseTone`, Typ
     *  `BaseFreq-Ton`) — unabhängig von `baseSrc` immer aus der klingenden Frequenz abgeleitet
     *  (dieselbe Formel wie BaseKeyboard.js' Highlight-Tonklasse), NICHT nur bei baseSrc='Ton'. */
    function baseTone() {
        const pc = ((Math.round(freqToMidi(baseFreq())) % 12) + 12) % 12;
        return pc + 1;
    }

    return {
        ensureAudio, baseFreq, baseTone, setBpmSource, notifyTempoChange,
        noteOn, noteOff, allNotesOff, transposeHeld, triggerFromEnv, latency,
        get context() { return getContext(); },
        get master() { return getMaster(); },   // Debug/Test: Signal-Abgriff vor destination
        heldCount: () => held.size,              // Debug/Test: aktuell gehaltene Noten (Polyphonie/Stealing)
        voiceCount: () => activeVoices.size,     // Debug/Test: klingende Voices inkl. Ausklang
        oscNodeCount: () => { let n = 0; for (const v of activeVoices) n += v.oscs.length; return n; },  // Debug/Test: Oszillator-Nodes (Osc2 an/aus)
        debugTiltGain: (freq) => tiltGainFor(freq),  // Debug/Test: Höhen-Dämpfungs-Formel isoliert prüfen (ddw.md 20260724_003531)
        debugDampGain: (note) => { const v = held.get(note); return v ? v.damps.map((d, i) => ({ gain: d.gain.value, freq: v.oscs[i].frequency.value })) : null; },  // Debug/Test: tatsächliche Damp-Node-Werte + Osc-Freq einer gehaltenen Note
        setPreMod(fn) { preMod = typeof fn === 'function' ? fn : (() => 1); },   // Modulationszugriff VOR Quantisierung (ddw.md 20260725)
        setPostMod(fn) { postMod = typeof fn === 'function' ? fn : (() => 1); },  // Modulationszugriff NACH Quantisierung (ddw.md 20260725)
        /** Wert-Setter fürs Routing (Multi-ADSR flush): mod als Zahl (-1..1), wirkt als
         *  Faktor (1+mod) in noteFreq. Änderung → retuneHeld, damit gehaltene Töne
         *  LIVE mitziehen (sonst wirkt die Env erst beim nächsten Anschlag — @dpa
         *  20260726: „während Töne liefen keinerlei Unterschied gehört"). */
        setPreModValue(v) {
            v = Math.max(-1, Math.min(1, v || 0));
            if (v === _preModV) return;
            _preModV = v;
            preMod = () => 1 + _preModV;
            retuneHeld();
        },
        setPostModValue(v) {
            v = Math.max(-1, Math.min(1, v || 0));
            if (v === _postModV) return;
            _postModV = v;
            postMod = () => 1 + _postModV;
            retuneHeld();
        },
    };
}
