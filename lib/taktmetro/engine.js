/**
 * engine.js — die HÖRBARE Naht der Takt/Metronom-Gruppen (P4, K7).
 *
 * Verdrahtet die aus taktgeber übernommenen Bausteine (audio/clock.js, audio/metro.js,
 * audio/tapTempo.js) mit dem Werkbank-State. Sie ist der Ersatz für die P1-Attrappe
 * (flashNoAudio): jetzt klingt es wirklich. Der Klang selbst (metro.js/metroClick.js) ist
 * 1:1 aus taktgeber (K7: „Metronom kommt von Taktgeber").
 *
 * Bewusst als eigenes Modul mit klarer Naht: `onAction(id)` nimmt genau die Button-ids der
 * defs (start/bang/bang2/slow/fast/tap/tapReset) — dieselbe Signatur wie die Attrappe, damit
 * defs.js/GroupHost nichts von Audio wissen müssen. `ensureAudio()` baut den AudioContext
 * erst auf eine Nutzer-Geste (Autoplay-Politik).
 *
 * ── Modell-Entscheidungen (für @dpas Hördurchgang, bei Bedarf per Ohr korrigieren) ──
 *  • Pegel: EIN `metroLevel` (0..1) → Metro.setLevel (taktgebers metroAmp/100 zusammengelegt).
 *  • Teil 2 (Offbeat) = Teil 1 (Onbeat) × `metroCutoffRatio` (Verhältnis, keine Hz-Addition;
 *    Default 0.5 = dumpfer, Knob-Range [0.2–4]).
 *  • slow/fast: gehaltener ASR-Nudge (biegt das LIVE-Tempo um ±`nudgeAmount`, Attack+Release
 *    über `nudgeRampMs`; gespeicherter bpm unangetastet). GroupHost liefert dafür 'down'/'up'
 *    am Gate-Knopf (@dpa 20260720 — die erwartete Halten-zum-Biegen-Naht ist jetzt da).
 */
import { Clock } from './audio/clock.js';
import { Metro, metroParts } from './audio/metro.js';
import { TapTempo, foldBpm } from './audio/tapTempo.js';

export function createTaktEngine(state) {
    let audio = null, metro = null, clock = null, master = null;
    let recorder = null, recChunks = [], recDest = null;   // Aufnahme (@dpa 20260720)
    let _onRunning = () => {};   // Callback bei Start/Stop (z.B. Start-Knopf ON-Farbe)
    let _onBeat = () => {};      // sichtbarer Beat (zeit-ausgerichtet) → Takt-Anzeige

    const running = () => !!clock && clock.running;
    const emitRunning = () => _onRunning(running());

    function rebuildMetro() {
        if (!metro) return;
        const cut = state.get('metroCutoff');
        // Teil 2 (Offbeat) = Teil 1 (Onbeat) × Verhältnis-Faktor (@dpa 20260720): der Offbeat
        // steht im VERHÄLTNIS zum Onbeat, keine Hz-Addition. Faktor <1 = dumpfer, >1 = heller.
        const ratio = state.get('metroCutoffRatio'); const r = ratio > 0 ? ratio : 1;
        const cut2 = Math.max(50, Math.min(18000, cut * r));
        metro.rebuild({ morph: state.get('metroMorph'), cutoff: cut, reso: state.get('metroReso'), cutoff2: cut2 });
    }

    // Latenz-Offset (@dpa 20260719_033654, aus taktgeber): − = Vorlauf (früher ausgeben, um
    // die Ausgabelatenz zu schlucken), + = später. Greift beim AUSGEBEN (Ton + Anzeige).
    const latOff = () => (state.get('latencyOffset') || 0) / 1000;

    // Ein Schlag: Teil 1 auf der 1, Teil 2 auf den übrigen Beats (opt. auf der 1 mit).
    function metroTick(time, beatInBar) {
        if (!metro || !state.get('metroOn')) return;
        const t = time + latOff();
        const { p1, p2 } = metroParts(beatInBar, { on2Downbeat: state.get('metro2OnDownbeat') });
        if (p1) metro.tick1(t);
        if (p2) metro.tick2(t);
    }
    // Sichtbaren Beat auf den hörbaren Zeitpunkt legen (taktgebers flashBeat): der Scheduler
    // plant im Voraus, die Anzeige soll aber GENAU auf dem Schlag umspringen, nicht früher.
    // Läuft unabhängig von metroOn — der Takt ist auch stumm sichtbar.
    function scheduleBeat(time, beatInBar) {
        const delay = Math.max(0, (time + latOff() - audio.currentTime) * 1000);
        setTimeout(() => _onBeat(beatInBar), delay);
    }

    function ensureAudio() {
        if (audio) return;
        audio = new (window.AudioContext || window.webkitAudioContext)();
        // Master als unauffälliger Unity-Gain-Durchgang VOR ctx.destination (@dpa 20260720):
        // gibt der Aufnahme einen stabilen Abgriffspunkt, ohne den Hörweg zu veraendern.
        master = audio.createGain();
        master.connect(audio.destination);
        metro = new Metro(audio, master);
        rebuildMetro();
        metro.setLevel(state.get('metroLevel'));
        clock = new Clock(audio, (t, beat) => { metroTick(t, beat); scheduleBeat(t, beat); });
        // Live-Tempo = gespeicherter bpm + temporäre Nudge-Bias (slow/fast biegen, ohne den
        // gespeicherten Wert anzufassen; Loslassen fährt zurück → Original). Nach oben auf
        // maxBpm gedeckelt, damit ein Anschieben nicht über die Tempogrenze schießt.
        clock.bpmFn = () => {
            const mx = state.get('maxBpm') || 900;
            return Math.max(1, Math.min(mx, state.get('bpm') + nudgeBias));
        };
        clock.beatsPerBarFn = () => Math.max(1, state.get('beatsPerBar') | 0);
        // Vorlauf (negativer Offset) braucht ein größeres Vorausfenster, sonst läge der
        // vorgezogene Ausgabe-Zeitpunkt in der Vergangenheit (taktgeber-Lehre).
        clock.lookaheadFn = () => 0.15 + Math.max(0, -(state.get('latencyOffset') || 0) / 1000);
    }

    function start() { ensureAudio(); if (audio.state === 'suspended') audio.resume(); clock.start(); emitRunning(); }
    function stop() { if (clock) clock.stop(); emitRunning(); }
    function toggle() { ensureAudio(); running() ? stop() : start(); }
    function resync(hard) { ensureAudio(); clock.resync(hard); }
    // ── Tempo-Nudge als ASR (@dpa 20260720): −/+ sind KEINE BPM-Addierer, sondern biegen das
    // LIVE-Tempo, solange gedrückt (Original aus taktgeber). ±max = `nudgeAmount` (+-depth),
    // Attack UND Release laufen über `nudgeRampMs` (Anlauf) mit gleicher Rate = depth/Anlauf
    // (BPM pro ms). Der gespeicherte bpm bleibt unangetastet → Loslassen fährt auf 0 zurück.
    let nudgeBias = 0, nudgeTarget = 0, nudgeRaf = 0, nudgeLastTs = 0, nudgeTapTimer = 0;
    let _onNudge = () => {};   // meldet das LIVE-Tempo (bpm+Bias) → BPM-Anzeige folgt dem Anschieben
    // Das gebogene Live-Tempo, gedeckelt wie clock.bpmFn (@dpa 20260720: „Anschieben ist noch
    // nicht zu sehen" → die BPM-Anzeige soll den ±-Schub zeigen, ohne den gespeicherten bpm zu ändern).
    const liveBpm = () => {
        const mx = state.get('maxBpm') || 900;
        return Math.max(1, Math.min(mx, (state.get('bpm') || 0) + nudgeBias));
    };
    function nudgeStep(ts) {
        if (!nudgeLastTs) nudgeLastTs = ts;
        const dt = ts - nudgeLastTs; nudgeLastTs = ts;
        const depth = Math.max(0, state.get('nudgeAmount') || 0);
        const rampMs = Math.max(1, state.get('nudgeRampMs') || 0);   // 0 → praktisch sofort
        const rate = depth / rampMs;                                  // BPM pro ms (Anlauf-Steilheit)
        const dv = rate * dt;
        if (nudgeBias < nudgeTarget) nudgeBias = Math.min(nudgeTarget, nudgeBias + dv);
        else if (nudgeBias > nudgeTarget) nudgeBias = Math.max(nudgeTarget, nudgeBias - dv);
        _onNudge(liveBpm(), nudgeBias);
        if (nudgeBias !== nudgeTarget) nudgeRaf = requestAnimationFrame(nudgeStep);
        else { nudgeRaf = 0; nudgeLastTs = 0; }
    }
    function nudgeRun() { if (!nudgeRaf) { nudgeLastTs = 0; nudgeRaf = requestAnimationFrame(nudgeStep); } }
    // dir: −1 = slow (bremsen), +1 = fast (anschieben). phase: 'down' hält auf ±depth,
    // 'up' fährt zurück auf 0. Ohne phase (Knopf im Trigger/Toggle-Modus) = kurzer Antipp-Nudge.
    function nudge(dir, phase) {
        const depth = Math.max(0, state.get('nudgeAmount') || 0);
        if (phase === 'up') { nudgeTarget = 0; }
        else {
            nudgeTarget = dir * depth;
            if (phase == null) {   // kein Gate → nach Anlauf selbst wieder zurück
                clearTimeout(nudgeTapTimer);
                nudgeTapTimer = setTimeout(() => { nudgeTarget = 0; nudgeRun(); },
                    Math.max(120, state.get('nudgeRampMs') || 0));
            }
        }
        nudgeRun();
    }

    // Tap-Tempo (taktgeber): tippt man mit, wird das Tempo übernommen (auf die höchste Hälfte
    // unter maxBpm gefaltet, damit sehr schnelles Tippen den Puls nicht wegklemmt).
    const tapper = new TapTempo({
        mode: state.get('tapMode'), tolerance: (state.get('tapTol') || 15) / 100,
        waitMs: state.get('tapWait'), windowBeats: state.get('tapWin'),
    });
    function tap() {
        const r = tapper.tap();
        if (!r.bpm) return;
        const { bpm } = foldBpm(r.bpm, state.get('maxBpm') || 900);
        state.set('bpm', bpm);
        if (r.live && running()) resync(true);
    }
    function tapReset() { tapper.reset(); }

    // ── Aufnahme (@dpa 20260720, „erst mal webm/opus") ────────────────────────────────
    // MediaStreamAudioDestinationNode parallel am Master (Hörweg unberührt) →
    // MediaRecorder → Blob → Download. „Speicherort" ist nur der Dateiname-Prefix
    // (recName): ein echter Zielordner ist ohne File System Access API nicht wählbar,
    // der Download landet im Browser-Downloads-Ordner.
    function recording() { return !!recorder; }
    function recStart() {
        ensureAudio();
        if (recorder) return;
        recDest = audio.createMediaStreamDestination();
        master.connect(recDest);
        recChunks = [];
        recorder = new MediaRecorder(recDest.stream, { mimeType: 'audio/webm;codecs=opus' });
        recorder.ondataavailable = (e) => { if (e.data && e.data.size) recChunks.push(e.data); };
        recorder.onstop = () => {
            const blob = new Blob(recChunks, { type: 'audio/webm' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const prefix = (state.get('recName') || 'werkbank-rec').trim() || 'werkbank-rec';
            const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);   // YYYYMMDDHHMMSS, ohne den Millisekunden-Punkt
            a.href = url; a.download = prefix + '-' + ts + '.webm'; a.click();
            setTimeout(() => URL.revokeObjectURL(url), 2000);
            master.disconnect(recDest); recDest = null; recorder = null; recChunks = [];
        };
        recorder.start();
    }
    function recStop() { if (recorder && recorder.state !== 'inactive') recorder.stop(); }
    function recToggle() { recording() ? recStop() : recStart(); }

    // Auf State-Änderungen reagieren: Klang-Regler → Buffer neu rendern; Pegel → setLevel;
    // Tap-Settings → in den Tapper spiegeln.
    state.subscribe((k, d) => {
        if (k === 'metroMorph' || k === 'metroCutoff' || k === 'metroReso' || k === 'metroCutoffRatio') rebuildMetro();
        else if (k === 'metroLevel' && metro) metro.setLevel(d.metroLevel);
        else if (k === 'tapMode') tapper.mode = d.tapMode;
        else if (k === 'tapTol') tapper.tolerance = (d.tapTol || 15) / 100;
        else if (k === 'tapWait') tapper.waitMs = d.tapWait;
        else if (k === 'tapWin') tapper.windowBeats = d.tapWin;
    });

    /** Dieselbe Signatur wie die P1-Attrappe — GroupHost/defs bleiben audio-blind. */
    function onAction(id, phase) {
        switch (id) {
            case 'start': toggle(); break;
            case 'bang': resync(false); break;
            case 'bang2': resync(true); break;
            case 'slow': nudge(-1, phase); break;
            case 'fast': nudge(1, phase); break;
            case 'tap': tap(); break;
            case 'tapReset': tapReset(); break;
            case 'rec': recToggle(); break;
        }
    }

    return {
        onAction, ensureAudio, running, recording,
        onRunning(fn) { _onRunning = fn || (() => {}); },
        onBeat(fn) { _onBeat = fn || (() => {}); },
        onNudge(fn) { _onNudge = fn || (() => {}); },   // (liveBpm, bias) während des Anschiebens
        get context() { return audio; },
        get nudgeBias() { return nudgeBias; },   // Debug/Test: aktueller Tempo-Bias (0 = kein Nudge)
    };
}
