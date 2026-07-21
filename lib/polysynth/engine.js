/**
 * engine.js — Poly-Synth: die erste HÖRBARE Naht (@dpa 20260721: „das Thema hier ist
 * Audio, stumm ist nur die Fassade — sinnlos"). Noch keine Voice-Engine/Polyphonie
 * (Poly-Synth-Schritt 2/3, DSP-Kernstück) — aber der Test-Ton (`baseTestOn`/
 * `baseTestLevel`, schon in defs.js) ist ein reiner Sinus auf der effektiven BaseFreq,
 * genau wie in teslacoil (`TeslaEngine.get baseFreq()`), und macht aus der stummen
 * Controls-Fassade ein tatsächlich klingendes Instrument.
 *
 * baseSrc='Tempo' braucht ein BPM von AUSSEN (Poly-Synth ist bewusst nicht hart an
 * taktmetro gekoppelt) — werkbank.js reicht das über setBpmSource() rein.
 */
import { foldToBand, midiToFreq, NOTE_NAMES } from './pitch/Scaler.js';

export function createPolySynthEngine(state) {
    let audio = null, master = null, testOsc = null, testGain = null;
    let _getBpm = () => 120;

    function ensureAudio() {
        if (audio) return;
        audio = new (window.AudioContext || window.webkitAudioContext)();
        master = audio.createGain();
        master.connect(audio.destination);
    }

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
            if (audio.state === 'suspended') audio.resume();
            if (testOsc) return;
            testOsc = audio.createOscillator();
            testOsc.type = 'sine';
            testOsc.frequency.value = Math.max(1, baseFreq());
            testGain = audio.createGain();
            testGain.gain.value = Math.max(0, state.get('baseTestLevel') || 0);
            testOsc.connect(testGain);
            testGain.connect(master);   // trocken am Master (umgeht eine spätere FX-Kette)
            testOsc.start();
        } else if (testOsc) {
            try { testOsc.stop(); testOsc.disconnect(); testGain.disconnect(); } catch { /* schon beendet */ }
            testOsc = null; testGain = null;
        }
    }

    function refreshTestFreq() {
        if (!testOsc) return;
        testOsc.frequency.setTargetAtTime(Math.max(1, baseFreq()), audio.currentTime, 0.02);
    }
    function refreshTestLevel() {
        if (!testGain) return;
        testGain.gain.setTargetAtTime(Math.max(0, state.get('baseTestLevel') || 0), audio.currentTime, 0.02);
    }

    state.subscribe((k) => {
        if (k === 'baseTestOn') applyTestOsc();
        else if (k === 'baseTestLevel') refreshTestLevel();
        else if (k === 'baseSrc' || k === 'baseHz' || k === 'baseBand' || k === 'baseNote') refreshTestFreq();
    });

    return {
        ensureAudio, baseFreq, setBpmSource,
        get context() { return audio; },
        get master() { return master; },   // Debug/Test: Signal-Abgriff vor destination
        testRunning: () => !!testOsc,       // Debug/Test
    };
}
