/**
 * engine.js — Poly-Synth: die HÖRBARE Naht (@dpa 20260721: „das Thema hier ist Audio,
 * stumm ist nur die Fassade — sinnlos"). Zwei Klangquellen:
 *  1) der Test-Ton (`baseTestOn`/`baseTestLevel`) — reiner Sinus auf der effektiven
 *     BaseFreq, genau wie in teslacoil (`TeslaEngine.get baseFreq()`), zum Vergleichs-Hören;
 *  2) die Voice-Engine (Poly-Synth-Schritt 2) — `noteOn(note, velocity)`/`noteOff(note)`
 *     mit einstellbarer Polyphonie (`polyMax`), Voice-Stealing (`voiceSteal`) und optionalem
 *     zweitem, verstimmtem Oszillator pro Voice (`osc2On`/`detune`). Schritt 3 (BaseFreq-
 *     Quantisierung + globaler LP-Smooth) ist bewusst NICHT hier — eigener Hördurchgang.
 *
 * baseSrc='Tempo' braucht ein BPM von AUSSEN (Poly-Synth ist bewusst nicht hart an
 * taktmetro gekoppelt) — werkbank.js reicht das über setBpmSource() rein.
 *
 * Audio-Bus (@dpa 20260721, „Rec nicht in Poly drin, sondern als Extra Instrument"):
 * kein eigener AudioContext mehr — alle Instrumente teilen sich EINEN Bus
 * (lib/audioBus.js), damit ein instrumentübergreifendes Rec „alles Hörbare" fassen kann.
 */
import { foldToBand, midiToFreq, NOTE_NAMES } from './pitch/Scaler.js';
import { oscCoefficients, harmonicsForFreq } from './audio/pulseWave.js';
import { ensureAudio as ensureBus, getContext, getMaster } from '../audioBus.js';

export function createPolySynthEngine(state) {
    let testOsc = null, testGain = null;
    let _getBpm = () => 120;

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

    function applyTestOsc() {
        if (state.get('baseTestOn')) {
            ensureAudio();
            const audio = getContext();
            if (audio.state === 'suspended') audio.resume();
            if (testOsc) return;
            testOsc = audio.createOscillator();
            testOsc.type = 'sine';
            testOsc.frequency.value = Math.max(1, baseFreq());
            testGain = audio.createGain();
            testGain.gain.value = Math.max(0, state.get('baseTestLevel') || 0);
            testOsc.connect(testGain);
            testGain.connect(getMaster());   // trocken am Master (umgeht eine spätere FX-Kette)
            testOsc.start();
        } else if (testOsc) {
            try { testOsc.stop(); testOsc.disconnect(); testGain.disconnect(); } catch { /* schon beendet */ }
            testOsc = null; testGain = null;
        }
    }

    function refreshTestFreq() {
        if (!testOsc) return;
        testOsc.frequency.setTargetAtTime(Math.max(1, baseFreq()), getContext().currentTime, 0.02);
    }
    function refreshTestLevel() {
        if (!testGain) return;
        testGain.gain.setTargetAtTime(Math.max(0, state.get('baseTestLevel') || 0), getContext().currentTime, 0.02);
    }

    state.subscribe((k) => {
        if (k === 'baseTestOn') applyTestOsc();
        else if (k === 'baseTestLevel') refreshTestLevel();
        else if (k === 'baseSrc' || k === 'baseHz' || k === 'baseBand' || k === 'baseNote') refreshTestFreq();
    });

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
    const ATTACK = 0.005;           // nur Anti-Klick; echtes ADSR ist Poly-Synth-Schritt 4 (Sonnet), NICHT hier
    const RELEASE = 0.06;           // sanftes Ausklingen bei noteOff
    const STEAL_RELEASE = 0.012;    // schneller, aber knackfrei — für Stealing/Retrigger

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
        try { voice.oscs.forEach((o) => o.disconnect()); voice.gain.disconnect(); } catch { /* schon getrennt */ }
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
        const freq = midiToFreq(note);
        const engine = state.get('oscEngine');
        const param = engine === 'Sine-FM' ? state.get('fmFeedback') : state.get('duty');

        const two = !!state.get('osc2On');
        // Detune wirkt NUR bei aktivem Osc2. spread = halbe Gesamt-Verstimmung → symmetrisch ±spread.
        const spread = two ? Math.max(0, Math.min(99, state.get('detune') || 0)) / 2 : 0;
        const ratios = two ? [Math.pow(2, -spread / 1200), Math.pow(2, spread / 1200)] : [1];

        const g = audio.createGain();
        // Zwei summierte Oszillatoren wären doppelt so laut → Peak pro Osc auf 1/Anzahl teilen.
        const peak = AMP_BASE * Math.max(0, Math.min(1, velocity / 127)) / ratios.length;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(peak, t + ATTACK);   // Attack, danach Sustain: Halten bis noteOff
        g.connect(getMaster());

        const oscs = ratios.map((r) => {
            const f = Math.max(1, freq * r);
            const N = harmonicsForFreq(f, audio.sampleRate, 2048);   // je höher der Ton, desto weniger Obertöne (Anti-Alias)
            const osc = audio.createOscillator();
            osc.setPeriodicWave(bakedWave(audio, engine, param, N));
            osc.frequency.value = f;
            osc.connect(g);
            osc.start(t);
            return osc;
        });

        const voice = { note, oscs, gain: g, peak, releasing: false };
        activeVoices.add(voice);
        // Erst wenn ALLE Oszillatoren geendet haben, die Voice abräumen (Nodes trennen).
        let ended = 0;
        oscs.forEach((osc) => { osc.onended = () => { if (++ended >= oscs.length) cleanupVoice(voice); }; });
        return voice;
    }

    /** Voice ausklingen lassen (Release) und ihre Oszillatoren zum Stopp planen. */
    function releaseVoice(voice, release) {
        if (voice.releasing) return;
        voice.releasing = true;
        const audio = getContext();
        const t = audio.currentTime;
        const gain = voice.gain.gain;
        try {
            if (gain.cancelAndHoldAtTime) gain.cancelAndHoldAtTime(t); else gain.cancelScheduledValues(t);
            gain.setTargetAtTime(0.0001, t, Math.max(0.001, release / 3));   // exp. Ausklang (~release lang)
            const stopAt = t + release + 0.02;
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

        const polyMax = Math.max(1, Math.min(8, (state.get('polyMax') | 0) || 8));
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

    /** Taste loslassen: GENAU die zu dieser Note gehörende Voice releasen (nicht irgendeine). */
    function noteOff(note) {
        const voice = held.get(note);
        if (!voice) return;
        held.delete(note);
        releaseVoice(voice, RELEASE);
    }

    /** Alle gehaltenen Noten sofort loslassen (Panik/Reset). */
    function allNotesOff() {
        for (const v of held.values()) releaseVoice(v, STEAL_RELEASE);
        held.clear();
    }

    return {
        ensureAudio, baseFreq, setBpmSource,
        noteOn, noteOff, allNotesOff,
        get context() { return getContext(); },
        get master() { return getMaster(); },   // Debug/Test: Signal-Abgriff vor destination
        testRunning: () => !!testOsc,            // Debug/Test
        heldCount: () => held.size,              // Debug/Test: aktuell gehaltene Noten (Polyphonie/Stealing)
        voiceCount: () => activeVoices.size,     // Debug/Test: klingende Voices inkl. Ausklang
        oscNodeCount: () => { let n = 0; for (const v of activeVoices) n += v.oscs.length; return n; },  // Debug/Test: Oszillator-Nodes (Osc2 an/aus)
    };
}
