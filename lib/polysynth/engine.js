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
 * Schritt 4 (@dpa 20260721, ab dd.md 20260802 volle ADSR-Parität): echtes ADSR pro Voice
 * (`adsrA`/`adsrD`/`adsrS`/`adsrR`/`adsrPeak`/…, dieselben Keys wie Multi-ADSR, nur
 * unsuffixed) statt der alten festen Anti-Klick-Rampe — Attack linear, Decay/Release
 * log/exponentiell. Peak = Velocity-Skalierung MAL `adsrPeak`-Einstellung.
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
import { AdsrCore, msToSamples } from './envCore.js';

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
     *    preMod(note)  — VOR  harmonicSnap: raw' = raw * mod
     *    postMod(note) — NACH der Überblendung: out' = out * mod
     *  Beide Default 1 → ohne aktive Verbindung bit-identisch zum bisherigen Verhalten.
     *  Live-Wirkung: setPreMod/setPostMod lösen bei Wertänderung retuneHeld() aus —
     *  gehaltene Töne gleiten per pitchSmooth zur modulierten Frequenz (kein Zipper).
     *  Der write() vom Routing ruft nur noch den Wert-Setter (Zahl), keinen Closure-Getter.
     *  Nullpunktversatz (@dpa ddw.md 20260727, „Bug2" — zurückgebaut): `mod` war hier fest
     *  `1 + mod` — eine Ziel-spezifische Sonderformel, die nur für Frequenz-Ziele (Ruhepunkt 1,
     *  nicht 0) passte. Die Env kreist aber immer um IHREN eigenen Nullpunkt (0) — der Versatz
     *  auf den Ziel-Ruhepunkt gehört darum AN DIE ENV (adsrNullpunkt-Setting, s. multiEnv.js
     *  flush()), nicht hierher. `mod` kommt jetzt schon fertig (inkl. Nullpunkt) vom Routing —
     *  ohne aktive ADSR-Verbindung bleibt mod=1 (Default unten), also weiterhin neutral. */
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

    // ── OSZ-Ausgang für den Scope (ddw.md 20260802_234615, „Outs (für scope): viel zu wenig,
    // bitte diverse Outputs hinzufügen ... Ausgänge aller Art (envelopes, OSZ, ..)"): EIN
    // stiller, persistenter Sammel-Node, an den JEDER Voice-Oszillator ZUSÄTZLICH (neben
    // osc→damp→ADSR-Gain→Master) anschließt — reiner Tap, NICHT an destination angeschlossen,
    // ändert am bestehenden Signalweg nichts. Bewusst VOR Damp/ADSR-Gain abgegriffen (@dpa:
    // „der rohe Oszillator-Signalwert vor Filter/Amp") — zeigt die nackte Wellenform, nicht die
    // hüllkurven-geformte Voice-Summe. EIN gemeinsamer Node für ALLE Voices (nicht pro Voice neu
    // angelegt), weil er nie abgebaut werden muss — Oszillatoren kommen/gehen (osc.disconnect()
    // beim Voice-Cleanup trennt automatisch ALLE Verbindungen des Oszillators, auch diese hier
    // mit), der Monitor-Node selbst bleibt für die Lebensdauer der Engine stabil. Genau diese
    // Stabilität macht ihn für die Registry tapp-bar (hasNode/node, s. oscMonitorNode() unten) —
    // im Unterschied zum Amp-Env-Wert (s. ampEnvPeak()-Kommentar), der KEINEN stabilen Node hat.
    let _oscMonitor = null, _oscAnalyser = null, _oscPeakBuf = null;
    /** Lazy: legt den Monitor-Node (+ internen Analyser fürs billige read()) beim ersten Aufruf
     *  an, danach immer derselbe Node. Rückgabe null, solange kein AudioContext existiert (vor
     *  dem ersten ensureAudio()) — Aufrufer (spawnVoice, Registry node()-Getter) behandeln das
     *  defensiv, kein Crash vor dem ersten Ton. */
    function oscMonitorNode() {
        const audio = getContext();
        if (!audio) return null;
        if (!_oscMonitor) {
            _oscMonitor = audio.createGain();
            _oscMonitor.gain.value = 1;
            // Interner Analyser NUR für den billigen frame-Peak in oscPeak() (Registry read()) —
            // dasselbe Muster wie der Master-Bus-Tap (overcord/werkbank.js routing.registerModule
            // 'master'). Die „sample"-genaue Kurve am Scope hängt sich über node() SEPARAT mit
            // ihrem EIGENEN Analyser an denselben _oscMonitor (mehrere Analyser an einem Node sind
            // in Web Audio unproblematisch).
            _oscAnalyser = audio.createAnalyser();
            _oscAnalyser.fftSize = 2048;
            _oscMonitor.connect(_oscAnalyser);
        }
        return _oscMonitor;
    }
    /** Billiger linearer Peak (0..1) aus dem internen Analyser — read()-Pendant zu
     *  master.out (overcord/werkbank.js). 0, solange noch kein Ton lief (Analyser fehlt noch). */
    function oscPeak() {
        if (!_oscAnalyser) return 0;
        if (!_oscPeakBuf || _oscPeakBuf.length !== _oscAnalyser.fftSize) _oscPeakBuf = new Float32Array(_oscAnalyser.fftSize);
        _oscAnalyser.getFloatTimeDomainData(_oscPeakBuf);
        let peak = 0;
        for (let i = 0; i < _oscPeakBuf.length; i++) { const v = Math.abs(_oscPeakBuf[i]); if (v > peak) peak = v; }
        return peak;
    }

    const AMP_BASE = 0.3;            // Grund-Amp pro Voice (Velocity skaliert darauf) — Headroom für Polyphonie
    const STEAL_RELEASE = 0.012;    // schneller, aber knackfrei — NUR für Stealing/Retrigger (technisch, kein Musik-Parameter)

    /** Amp-Env-Konfiguration für envCore.js' AdsrCore, live aus dem State gelesen (@dpa
     *  dd.md 20260802, 2. Runde: "alles von ADSR einfach rein!") — Amp-Env nutzt jetzt
     *  DIESELBEN State-Keys wie eine Multi-ADSR-Instanz (adsrA/adsrD/…), nur unsuffixed
     *  (s. defs.js GROUPS-Eintrag 'Amp-Env' + multiEnv.js _cfg(), identischer Aufbau).
     *  Peak ist jetzt ZWEI Faktoren: die Velocity-Skalierung (`peak`-Parameter, wie bisher)
     *  MAL die neue `adsrPeak`-Einstellung (Default 1 = kein Unterschied zu vorher) — exakt
     *  dieselbe "Auslöser-Magnitude × Peak"-Formel wie beim Gate-In-Fix in multiEnv.js.
     *  trigMode/lenFest/lenSamples kommen jetzt ECHT aus dem State statt hartcodiert
     *  ('gate'/false/0 waren die alten Fest-Werte — genau die Defaults in defs.js, s. dort
     *  adsrTrigMode/adsrLenFest-Override — darum kein Klangunterschied ohne @dpas Zutun). */
    function ampCfg(peak, sr) {
        const lenUnit = state.get('adsrLenUnit') || 'ms';
        const lenMs = lenUnit === 'beats' ? (state.get('adsrLenBeat') ?? 0) * 60000 / _getBpm() : (state.get('adsrLenMs') ?? 0);
        return {
            a: Math.max(0, state.get('adsrA') ?? 0.01),
            d: Math.max(0, state.get('adsrD') ?? 0.15),
            s: clamp01(state.get('adsrS') ?? 0.7),
            r: Math.max(0, state.get('adsrR') ?? 0.3),
            peak: peak * (state.get('adsrPeak') ?? 1),
            aOn: state.get('adsrAOn') !== false, dOn: state.get('adsrDOn') !== false,
            sOn: state.get('adsrSOn') !== false, rOn: state.get('adsrROn') !== false,
            inv: !!state.get('adsrInv'), verlauf: !!state.get('adsrVerlauf'),
            aCurve: state.get('adsrACurve') || 'lin', dCurve: state.get('adsrDCurve') || 'log', rCurve: state.get('adsrRCurve') || 'log',
            aSkew: state.get('adsrASkew') ?? 1, dSkew: state.get('adsrDSkew') ?? 1, rSkew: state.get('adsrRSkew') ?? 1,
            trigMode: state.get('adsrTrigMode') || 'gate',
            lenFest: state.get('adsrLenFest') !== false,
            lenSamples: msToSamples(lenMs, sr),
        };
    }

    // ── Nativer Schnellpfad fürs Amp-Env-Gain (@dpa dd.md 20260802: „bei zu langem Amp
    // Release … OSZ Poly=36, Rel höher drehen und es wird unrhythmisch, noch höher
    // wiederholt es Step 1 … dasselbe bei Poly=128") ────────────────────────────────────
    // BUG (selbst eingebaut, s.o. „Amp-Env auf AdsrCore übermodeln"): AdsrCore.trigger()/
    // gateOff() bauen ein Float32Array mit A·sr Samples PRO SEGMENT (bei sr=48000 und
    // Release=3s also 144000 Floats) UND JS-generieren es bei JEDEM Anschlag/Loslassen neu
    // — bei hoher Polyphonie (36/128 Voices) und langem Release genug CPU-Last, um den
    // Audio-Thread/Scheduler ins Stottern zu bringen (genau das beobachtete Bild: Sequenzer
    // hängt/verliert den Takt). Native `linearRampToValueAtTime`/`exponentialRampToValueAtTime`
    // kosten dagegen praktisch nichts (vom Browser intern berechnet, keine JS-Schleife, kein
    // Array) — GENAU das, was der ALTE Code (vor dem AdsrCore-Umbau) schon nutzte.
    // Skew=1 (Standard) + kein Invert ist mathematisch IDENTISCH zu einer nativen Ramp (per
    // Node deterministisch verifiziert, s. Commit „Amp-Env auf AdsrCore umgemodelt") — genau
    // dieser (weitaus häufigste) Fall bekommt hier den billigen nativen Pfad. Nur echtes
    // Skew≠1 ODER Invert (seltene, bewusste Klangformung) braucht die array-basierte
    // AdsrCore-Kurve und zahlt deren Kosten — ein akzeptabler, klar abgegrenzter Sonderfall.
    // Erweitert (dd.md 20260802, 2. Runde, "alles von ADSR einfach rein!" + 3. Runde,
    // Fest-Bug "fächert die polyphonen Envs zeitlich auf ... hängt sich irgendwann auf"):
    // Modus/Fest sind echte Settings statt hartcodiert — Fest=an (Auto-Close nach Len)
    // läuft jetzt AUCH nativ (Anker+Rampe statt JS-Array über die Hold-Dauer), aus genau
    // demselben Kostengrund wie die bestehende Release-Optimierung. Nur echtes Trig-Modus
    // (samt seines Sonderfall-Zoos in envCore.js) bleibt auf dem allgemeinen Array-Pfad.
    function ampCfgIsNative(cfg) {
        return cfg.aSkew === 1 && cfg.dSkew === 1 && cfg.rSkew === 1 && !cfg.inv
            && cfg.trigMode === 'gate';
    }
    const AMP_FLOOR = 0.0001;   // exponentialRamp erreicht/verlässt nie echte 0 (RangeError)
    function rampSeg(gainParam, curve, from, to, endTime) {
        if (curve === 'log') gainParam.exponentialRampToValueAtTime(Math.max(AMP_FLOOR, to), endTime);
        else gainParam.linearRampToValueAtTime(to, endTime);
        return to;
    }
    /** Native Entsprechung von AdsrCore.trigger() für den Voice-Gain (nur aufgerufen, wenn
     *  ampCfgIsNative(cfg) — sonst übernimmt der Aufrufer den AdsrCore-Array-Pfad). Bildet
     *  dieselben Sonderfälle wie envCore.js 1:1 nach. Rückgabe: Dauer in Sekunden ab `t`,
     *  WENN die Kurve selbst-beendend ist (reicht bis 0) — sonst `null` (hält offen, bis ein
     *  echtes noteOff/gateOff kommt). Der Aufrufer (spawnVoice) MUSS bei einer Zahl einen
     *  osc.stop() zum Ende einplanen, sonst läuft die Voice für immer weiter (Voice-Leck,
     *  @dpa dd.md 20260802 3. Runde). */
    function scheduleAmpTriggerNative(gain, cfg, t) {
        const p = gain.gain;
        const peak = Math.max(0, cfg.peak);
        p.cancelScheduledValues(t);
        if (!cfg.aOn && !cfg.dOn && !cfg.sOn && !cfg.rOn) {
            // Kein Segment aktiv -> kurzer Puls (sonst totale Stille, s. envCore.js-Kopfkommentar).
            const dt = 1 / gain.context.sampleRate;
            p.setValueAtTime(Math.max(AMP_FLOOR, peak), t);
            p.linearRampToValueAtTime(AMP_FLOOR, t + dt);
            return dt;
        }
        p.setValueAtTime(cfg.aCurve === 'log' ? AMP_FLOOR : 0, t);
        let level = cfg.aCurve === 'log' ? AMP_FLOOR : 0, time = t;
        if (cfg.aOn) {
            time += Math.max(0, cfg.a);
            level = rampSeg(p, cfg.aCurve, level, peak, time);
            if (!cfg.dOn && !cfg.sOn && !cfg.rOn) {
                // Nur A aktiv -> 0.5ms linear runter auf 0 (envCore.js-Sonderfall), statt für
                // immer auf Peak zu halten.
                const endT = time + 0.0005;
                p.linearRampToValueAtTime(AMP_FLOOR, endT);
                return endT - t;
            }
        }
        if (cfg.dOn) {
            const target = cfg.sOn ? peak * cfg.s : 0;
            time += Math.max(0, cfg.d);
            level = rampSeg(p, cfg.dCurve, level, target, time);
        }
        if (cfg.sOn) {
            // Fest (dd.md 20260802, 3. Runde): Auto-Close nach Len NATIV geplant (Anker bei
            // holdEnd + Release-Rampe), KEIN JS-Array über die gesamte Hold-Dauer — dieselbe
            // Kosten-Klasse wie die bestehende Release-Optimierung, nur für Fest statt Release.
            // Ohne rOn hält envCore.js NACH Len ebenfalls für immer (s. dortiger Kommentar) —
            // dann bleibt's beim offenen Pfad, kein Auto-Stop (kein Fehlverhalten ggü. vorher).
            if (cfg.lenFest !== false && cfg.rOn) {
                const holdEnd = time + Math.max(0, cfg.lenSamples ?? 0) / gain.context.sampleRate;
                p.setValueAtTime(level, holdEnd);
                const relEnd = holdEnd + Math.max(0, cfg.r);
                rampSeg(p, cfg.rCurve, level, 0, relEnd);
                return relEnd - t;
            }
            return null;   // openHold: AudioParam hält den letzten geplanten Wert von selbst.
        }
        if (cfg.rOn) {
            time += Math.max(0, cfg.r);
            rampSeg(p, cfg.rCurve, level, 0, time);
            return time - t;
        }
        // sonst: hält implizit auf `level` — nach den obigen Sonderfällen kann das an dieser
        // Stelle nur noch level===0 sein (dOn brachte es dahin, sOn/rOn beide aus). Defensiv
        // geprüft statt blind angenommen, damit ein Stop niemals eine tatsächlich noch
        // hörbare Voice kappt (lieber wie bisher offen lassen als einen neuen Cutoff-Bug).
        return level === 0 ? (time - t) : null;
    }
    /** Native Entsprechung von AdsrCore.gateOff() — Release ab dem AKTUELLEN Pegel, wie im
     *  BUGFIX-Kommentar an releaseVoice() unten. Rückgabe: Release-Dauer in Sekunden. */
    function scheduleAmpReleaseNative(gain, cfg, t, currentLevel) {
        const p = gain.gain;
        p.cancelScheduledValues(t);
        p.setValueAtTime(currentLevel, t);
        if (!cfg.rOn || cfg.r <= 0) {
            const dt = 2 / gain.context.sampleRate;
            p.linearRampToValueAtTime(AMP_FLOOR, t + dt);
            return dt;
        }
        rampSeg(p, cfg.rCurve, currentLevel, 0, t + cfg.r);
        return cfg.r;
    }

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
        // Amp-Env läuft jetzt über envCore.js' AdsrCore statt hart verdrahteter linear/
        // exponentialRamp-Aufrufe (@dpa dd.md 20260802) — EINE AdsrCore-Instanz PRO VOICE
        // (polyphon, jede Note ihr eigenes Gate/Release), genau wie Multi-ADSR (multiEnv.js
        // EnvEngine.trigger()) die Kurve baut, nur direkt auf den Voice-Gain statt einen
        // geteilten ConstantSourceNode. Zwei summierte Oszillatoren wären doppelt so laut →
        // Peak pro Osc auf 1/Anzahl teilen. Peak hängt an der Velocity (velScale) — Sustain
        // ist in AdsrCore intern peak*s, also DERSELBE Faktor wie bisher, kein zweiter,
        // unabhängiger Vel-Bezug.
        const velScale = Math.max(0, Math.min(1, velocity / 127));
        const peak = AMP_BASE * velScale / ratios.length;
        const env = new AdsrCore();
        const cfg = ampCfg(peak, audio.sampleRate);
        // autoStopAt: gesetzt, wenn die Hüllkurve SELBST-BEENDEND ist (Fest/Trig/ADS-ohne-R
        // u.ä. — s. envCore.js holdsForever-Kommentar). Für diese Fälle MUSS ein osc.stop()
        // eingeplant werden, sonst läuft die Voice nach dem Auto-Close für immer weiter (kein
        // onended, kein cleanupVoice — der Fest-Leck-Bug, @dpa dd.md 20260802 3. Runde:
        // "fächert die polyphonen Envs zeitlich auf ... hängt sich irgendwann auf"). Der
        // offene Default-Fall (Gate, Fest=aus) bleibt unverändert ohne Auto-Stop — der endet
        // erst über ein echtes noteOff (releaseVoice).
        let autoStopAt = null;
        if (ampCfgIsNative(cfg)) {
            // Schnellpfad (@dpa dd.md 20260802, s. Kommentar an ampCfgIsNative): Standard-
            // Einstellungen (Skew=1, kein Invert) kosten so gut wie nichts, egal wie lang
            // Release oder wie hoch die Polyphonie ist — jetzt AUCH für Fest=an.
            const dur = scheduleAmpTriggerNative(g, cfg, t);
            if (dur != null) autoStopAt = t + dur + 0.02;
        } else {
            const { curve, duration, startOffset, holdsForever } = env.trigger(cfg, audio.sampleRate);
            g.gain.setValueCurveAtTime(curve, Math.max(0, t + startOffset), duration);
            if (!holdsForever) autoStopAt = Math.max(0, t + startOffset) + duration + 0.02;
        }
        // Danach hält der Gain implizit auf dem letzten Kurven-Wert (openHold, s. ampCfg)
        // bis noteOff die Release-Kurve nachreicht (releaseVoice) — außer autoStopAt ist
        // gesetzt, dann endet die Voice von selbst (s.u.).
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
            // OSZ-Scope-Tap (s. oscMonitorNode()-Kommentar oben): ZUSÄTZLICHER Fan-out, VOR
            // Damp/ADSR-Gain — ändert nichts am eigentlichen Signalweg (osc→damp→g→Master).
            const mon = oscMonitorNode();
            if (mon) osc.connect(mon);
            osc.start(t);
            if (autoStopAt != null) { try { osc.stop(autoStopAt); } catch { /* siehe unten */ } }
            damps.push(damp);
            return osc;
        });

        // ratios auf der Voice merken → retuneHeld() kann die BaseFrq-Verschiebung nachziehen
        // und dabei die (unveränderte) Osc2-Verstimmung beibehalten. `env` ist die EIGENE
        // AdsrCore-Instanz dieser Voice (releaseVoice() ruft ihre gateOff()). releasing=true
        // bei autoStopAt (Fest/Trig, s.o.): ein SPÄTERES echtes noteOff() auf dieser Voice
        // soll dann ein No-Op sein (releaseVoice() prüft releasing zuerst) — sie klingt schon
        // von selbst aus, ein zweiter Release-Ramp obendrauf wäre nur Redundanz.
        const voice = { note, oscs, damps, ratios, gain: g, peak, env, releasing: autoStopAt != null };
        activeVoices.add(voice);
        // Erst wenn ALLE Oszillatoren geendet haben, die Voice abräumen (Nodes trennen).
        let ended = 0;
        oscs.forEach((osc) => { osc.onended = () => { if (++ended >= oscs.length) cleanupVoice(voice); }; });
        return voice;
    }

    /** Voice ausklingen lassen (Release) und ihre Oszillatoren zum Stopp planen. Greift GENAUSO,
     *  ob die Voice gerade im Attack/Decay oder schon im Sustain steht — AdsrCore.gateOff()
     *  baut die Release-Kurve immer AB DEM AKTUELLEN Pegel, unabhängig von der Env-Phase.
     *  `release` ist bei noteOff der adsrR-Knob (live aus dem State, s. noteOff()), bei
     *  Stealing/Retrigger die feste, kurze STEAL_RELEASE (technischer Anti-Klick, kein
     *  Musik-Parameter) — überschreibt dafür NUR `r` in der sonst live gelesenen ampCfg
     *  (rOn/rCurve/rSkew/inv bleiben die echten Amp-Env-Settings, auch beim Steal).
     *
     *  BUGFIX (@dpa 20260722, ddw.md: „NoteOffs schalten auf gefühlt 1/10 runter, dann kommt
     *  Release"): `cancelAndHoldAtTime` sollte den Gain auf seinem AKTUELLEN Wert einfrieren,
     *  ist aber gerade nach einer bereits ABGESCHLOSSENEN Kurve (= genau der Sustain-Fall) in
     *  mehreren Web-Audio-Implementierungen unzuverlässig und liefert dann einen falschen (zu
     *  niedrigen) Ausgangswert. Robuster: den echten `gain.value` (der Getter liefert immer
     *  den korrekten, gerade geltenden Wert) explizit per `setValueAtTime` festpinnen, statt
     *  sich auf cancelAndHoldAtTime zu verlassen — gilt für gateOff()'s Kurve genauso. */
    function releaseVoice(voice, release) {
        if (voice.releasing) return;
        voice.releasing = true;
        const audio = getContext();
        const t = audio.currentTime;
        try {
            const current = Math.max(0.0001, voice.gain.gain.value);
            const cfg = { ...ampCfg(voice.peak, audio.sampleRate), r: Math.max(0.001, release) };
            // Schnellpfad (s. ampCfgIsNative-Kommentar an spawnVoice): native Release-Ramp
            // statt einer Float32Array-Kurve — bei Standard-Skew unhörbar identisch, aber
            // ohne die CPU-Kosten, die bei hoher Polyphonie + langem Release den Takt stottern
            // ließen (@dpa dd.md 20260802).
            const duration = ampCfgIsNative(cfg)
                ? scheduleAmpReleaseNative(voice.gain, cfg, t, current)
                : (() => {
                    const { curve, duration: dur } = voice.env.gateOff(cfg, audio.sampleRate, current);
                    voice.gain.gain.cancelScheduledValues(t);
                    voice.gain.gain.setValueAtTime(current, t);
                    voice.gain.gain.setValueCurveAtTime(curve, t, dur);
                    return dur;
                })();
            const stopAt = t + duration + 0.02;
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
     *  mit der musikalischen Release-Zeit aus dem adsrR-Knob (Poly-Synth-Schritt 4). */
    function noteOff(note) {
        const voice = held.get(note);
        if (!voice) return;
        held.delete(note);
        releaseVoice(voice, state.get('adsrR') ?? 0.3);
    }

    /** Hart auf 0 setzen (Panik/Reset, @dpa dd.md 20260802: "Reset: muss die Hüllkurven auf
     *  null setzen") — ANDERS als releaseVoice()/STEAL_RELEASE: keine Ramp, auch keine
     *  12ms-Fade, sondern die Hüllkurve wird SOFORT gekappt. Für den Panik-Fall (hängende/
     *  laut klingende Noten) gewollt hart, nicht musikalisch — dafür gibt's adsrR/
     *  Stealing bereits. */
    function hardStopVoice(voice) {
        if (voice.releasing) return;
        voice.releasing = true;
        const audio = getContext();
        const t = audio.currentTime;
        try {
            voice.gain.gain.cancelScheduledValues(t);
            voice.gain.gain.setValueAtTime(0, t);
            voice.oscs.forEach((o) => { try { o.stop(t); } catch { /* evtl. schon geplant */ } });
        } catch { /* Voice evtl. schon beendet */ }
    }

    /** Alle Noten sofort loslassen (Panik/Reset) — auch bereits AUSLAUFENDE (releasing) Voices
     *  eines vorherigen noteOff, nicht nur die gerade gehaltenen: sonst blieben die noch
     *  hörbar nachklingen, während das Reset optisch/gefühlt "alles auf 0" verspricht. */
    function allNotesOff() {
        for (const v of activeVoices) hardStopVoice(v);
        held.clear();
    }

    /** Aggregierter Amp-Env-Wert für den Scope (ddw.md 20260802_234615, „Outs (für scope)":
     *  der lauteste GERADE klingende Voice-Gain (Max statt Summe/Mittel — dieselbe Peak-Logik
     *  wie master.out, overcord/werkbank.js routing.registerModule('master')) — 0, wenn nichts
     *  spielt. KEIN eigener AudioNode dahinter (anders als oscMonitorNode() oben): die
     *  Hüllkurve läuft pro Voice als AudioParam-AUTOMATION direkt auf `voice.gain.gain`
     *  (ampCfgIsNative-Schnellpfad ODER AdsrCore-Array-Kurve, s. spawnVoice/releaseVoice) — eine
     *  „saubere", NUR-Hüllkurven-Kurve (ohne die Oszillator-Wellenform mit drauf, wie bei einem
     *  reinen g.gain-Tap) gäbe es nur über einen ZWEITEN, parallel geplanten ConstantSourceNode
     *  PRO VOICE (wie multiEnv.js EnvEngine es für die General-Purpose-ADSR macht — dort ist die
     *  Env-Kurve selbst der einzige Output, kein Oszillator drin). Das hieße, JEDE Trigger-/
     *  Release-Planung (nativer Schnellpfad UND Array-Pfad) doppelt zu pflegen, mit Drift-Risiko
     *  zwischen Audio und Anzeige — bewusst NICHT gebaut ohne @dpas Bestätigung (offener
     *  Kandidat, s. Abschlussbericht). read() reicht als frame-genaue Anzeige (zeigt Attack/
     *  Decay/Sustain/Release-FORM trotzdem sichtbar, nur nicht sample-genau) — hasNode bleibt
     *  darum bewusst false, s. Registry.js bindPorts()-Kommentar („NUR wenn der Output
     *  tatsächlich einen echten AudioNode im Graph hat"). */
    function ampEnvPeak() {
        let peak = 0;
        for (const v of activeVoices) {
            const g = Math.abs(v.gain.gain.value);
            if (g > peak) peak = g;
        }
        return peak;
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

    /** Poly-Synth-Schritt 3: alle KLINGENDEN Voices auf ihre neu berechnete Zielfrequenz
     *  nachziehen — nötig, wenn sich die effektive BaseFrq oder harmonizeMix LIVE ändert und
     *  dadurch die Quantisierung eine schon klingende Note verschiebt. Über pitchSmooth als
     *  Zeitkonstante (setTargetAtTime) statt hartem Sprung → kein Zipper/Klick auf gehaltenen
     *  Tönen; pitchSmooth=0 bleibt der harte Sprung. GILT NUR nachträglich für schon spielende
     *  Voices — der initiale Anschlag (spawnVoice) startet direkt auf seiner Zielfrequenz, kein
     *  Glide. Läuft über `activeVoices` (nicht `held`) und OHNE releasing-Skip (@dpa dd.md
     *  20260802, overcord/Poly-synth/Basefreq/Harmonize: „bei release (GateOff) werden die Töne
     *  nicht mehr geupdatet. sollen sie aber") — auch auslaufende (releasing) Voices im Release
     *  hören BaseFrq/harmonizeMix/Kammerton-Änderungen weiter mit, statt beim noteOff einzufrieren. */
    function retuneHeld() {
        const audio = getContext();
        if (!audio || activeVoices.size === 0) return;
        const t = audio.currentTime;
        const tau = pitchTau();
        for (const voice of activeVoices) {
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
        // Debug/Test: tatsächliche Damp-Node-Werte + Osc-Freq einer Note. Erst `held` (eindeutig
        // bei Retrigger), sonst Fallback auf eine noch auslaufende (releasing) Voice in
        // `activeVoices` — nötig, um retuneHeld() nach noteOff zu verifizieren (dd.md 20260802).
        debugDampGain: (note) => {
            const v = held.get(note) || [...activeVoices].find((x) => x.note === note && x.releasing);
            return v ? v.damps.map((d, i) => ({ gain: d.gain.value, freq: v.oscs[i].frequency.value })) : null;
        },
        // Debug/Test: aktueller Amp-Env-Gain (AdsrCore-Kurve) einer Note — dieselbe held/
        // activeVoices-Fallback-Logik wie debugDampGain (ddw.md 20260802, Amp-Env→AdsrCore).
        debugAmpGain: (note) => {
            const v = held.get(note) || [...activeVoices].find((x) => x.note === note && x.releasing);
            return v ? v.gain.gain.value : null;
        },
        // Scope-Outputs (ddw.md 20260802_234615, „Outs (für scope)": envelopes, OSZ, ..) —
        // gebunden an die Registry über routing.registerModule('polysynth', ...) in
        // overcord/werkbank.js. s. Kommentare an ampEnvPeak()/oscMonitorNode() oben.
        ampEnvPeak, oscPeak, oscMonitorNode,
        setPreMod(fn) { preMod = typeof fn === 'function' ? fn : (() => 1); },   // Modulationszugriff VOR Quantisierung (ddw.md 20260725)
        setPostMod(fn) { postMod = typeof fn === 'function' ? fn : (() => 1); },  // Modulationszugriff NACH Quantisierung (ddw.md 20260725)
        /** Wert-Setter fürs Routing (Multi-ADSR flush): mod als FERTIGER Faktor (Nullpunkt
         *  bereits eingerechnet, s. multiEnv.js adsrNullpunkt), wirkt DIREKT als Faktor in
         *  noteFreq — kein `1+mod` mehr hier (ddw.md 20260727, „Bug2", zurückgebaut). Nur
         *  nach unten geklemmt (keine negative/Null-Frequenz), nach oben offen — der
         *  sinnvolle Bereich hängt jetzt vom Nullpunkt+Peak der jeweiligen ADSR ab, nicht
         *  mehr von einer festen ±1-Spanne. Änderung → retuneHeld, damit gehaltene Töne LIVE
         *  mitziehen (sonst wirkt die Env erst beim nächsten Anschlag — @dpa 20260726:
         *  „während Töne liefen keinerlei Unterschied gehört"). */
        setPreModValue(v) {
            v = Math.max(0, v || 0);
            if (v === _preModV) return;
            _preModV = v;
            preMod = () => _preModV;
            retuneHeld();
        },
        setPostModValue(v) {
            v = Math.max(0, v || 0);
            if (v === _postModV) return;
            _postModV = v;
            postMod = () => _postModV;
            retuneHeld();
        },
    };
}
