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
 * Rec lebt NICHT mehr hier (@dpa 20260721: „Rec nicht in Poly drin, sondern als Extra
 * Instrument" — der allgemeinere Grund: Rec soll alles Hörbare aufnehmen können, nicht nur
 * DIESES Instrument). `onClockBeat()` reicht die rohen Scheduler-Beats nach außen, damit
 * lib/recInstrument/engine.js seinen Start/Stop-Sync (Downbeat-Arming) weiter bauen kann,
 * ohne dass Rec dieses Modul importieren müsste.
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
import { ensureAudio as ensureBus, getContext, getMaster } from '../audioBus.js';
import { busLatencyMs } from '../routing/latency.js';
export function createTaktEngine(state) {
    let metro = null, clock = null;
    // Base-Frq als Modulations-Quelle (ddw.md 20260724_212747): der letzte über den Routing-
    // Input `baseFreqIn` (polysynth.baseFreq) zugestellte Hz-Wert. Nur genutzt, wenn
    // metroCutoffQuant (Quant) AN ist — dann rasten die Metro-Cutoffs auf Base-Frq-Vielfache.
    let _baseFreqIn = 0;
    let _onRunning = () => {};   // Callback bei Start/Stop (z.B. Start-Knopf ON-Farbe)
    let _onBeat = () => {};      // sichtbarer Beat (zeit-ausgerichtet) → Takt-Anzeige
    let _onClockBeat = () => {}; // roher Scheduler-Beat (time, beatInBar) — für Rec-Instrument

    const running = () => !!clock && clock.running;
    // avv = „alles von vorne" (ddw.md 20260724_212747, korrigiert 233253): true beim '|>'-Start
    // (Takt→1, Seq→Step 0), false beim '>'-Start (weiter ab Position). Beim Stop irrelevant
    // (undefined) — die Gegenseite (werkbank _onTaktRunning) wertet avv nur bei on=true aus.
    // Start/Stop melden den ON-Zustand jetzt explizit (s. start()/stop()), nicht mehr über
    // running() — der Zustand muss VOR clock.start() feststehen (Reihenfolge, s. start()).

    function rebuildMetro() {
        if (!metro) return;
        let cut = state.get('metroCutoff');
        // Teil 2 (Offbeat) = Teil 1 (Onbeat) × Verhältnis-Faktor (@dpa 20260720): der Offbeat
        // steht im VERHÄLTNIS zum Onbeat, keine Hz-Addition. Faktor <1 = dumpfer, >1 = heller.
        const ratio = state.get('metroCutoffRatio'); const r = ratio > 0 ? ratio : 1;
        let cut2 = cut * r;
        // Quant (@dpa 20260724_233253, „rundet die Cutoffs" — Band-Regler ist wieder raus): bei
        // anliegender Base-Frq rasten BEIDE Cutoffs auf das nächste ganzzahlige Vielfache der
        // Base-Frq (mind. 1× = die Grundfrequenz selbst). Der Klick „stimmt" so harmonisch auf die
        // Basis, ohne eigenen Band-Regler. Base-Frq kommt über den Routing-Input `baseFreqIn`.
        if (state.get('metroCutoffQuant') && _baseFreqIn > 0) {
            const q = (x) => Math.max(1, Math.round(x / _baseFreqIn)) * _baseFreqIn;
            cut = q(cut); cut2 = q(cut2);
        }
        cut = Math.max(50, Math.min(18000, cut));
        cut2 = Math.max(50, Math.min(18000, cut2));
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
        const delay = Math.max(0, (time + latOff() - getContext().currentTime) * 1000);
        setTimeout(() => _onBeat(beatInBar), delay);
    }

    function ensureAudio() {
        if (metro) return;
        ensureBus();
        const audio = getContext(), master = getMaster();
        metro = new Metro(audio, master);
        rebuildMetro();
        metro.setLevel(state.get('metroLevel'));
        clock = new Clock(audio, (t, beat) => { metroTick(t, beat); scheduleBeat(t, beat); _onClockBeat(t, beat); });
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

    // keepPhase=false → avv (Takt fällt auf die 1); true → weiter, Beat-Phase bleibt (clock.js).
    // WICHTIG (@dpa 20260725 „> startet trotzdem von vorne"): die Transport-Kopplung (_onRunning
    // → sqManager.transport) MUSS vor clock.start() laufen. clock.start() feuert den ersten Beat
    // SYNCHRON (schedule()), der über onClockBeat bis in sqManager.handleClockBeat läuft und den
    // Sequenzer-Anker setzt. Käme transport() erst danach (emitRunning nach clock.start, wie
    // zuvor), hätte handleClockBeat schon resetPending=true gesetzt (keepOnNextAnchor war noch
    // false) — der '>'-Continue würde jedes Mal auf Step 0 resetten. Also erst melden, dann Uhr.
    function start(keepPhase = false) {
        ensureAudio();
        if (getContext().state === 'suspended') getContext().resume();
        _onRunning(true, !keepPhase);   // setzt transportContinue()/transportStarted() VOR dem ersten Beat
        clock.start(keepPhase);
    }
    function stop() { if (clock) clock.stop(); _onRunning(false, undefined); }
    function toggle(keepPhase = false) { ensureAudio(); running() ? stop() : start(keepPhase); }
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

    // Auf State-Änderungen reagieren: Klang-Regler → Buffer neu rendern; Pegel → setLevel;
    // Tap-Settings → in den Tapper spiegeln.
    state.subscribe((k, d) => {
        if (k === 'metroMorph' || k === 'metroCutoff' || k === 'metroReso' || k === 'metroCutoffRatio'
            || k === 'metroCutoffQuant') rebuildMetro();
        else if (k === 'metroLevel' && metro) metro.setLevel(d.metroLevel);
        else if (k === 'tapMode') tapper.mode = d.tapMode;
        else if (k === 'tapTol') tapper.tolerance = (d.tapTol || 15) / 100;
        else if (k === 'tapWait') tapper.waitMs = d.tapWait;
        else if (k === 'tapWin') tapper.windowBeats = d.tapWin;
    });

    /** Dieselbe Signatur wie die P1-Attrappe — GroupHost/defs bleiben audio-blind. */
    function onAction(id, phase) {
        switch (id) {
            // Zuordnung nach @dpa-Korrektur (ddw.md 20260724_233253): '>' läuft AB POSITION
            // weiter (continue, keepPhase=true), '|>' startet VON VORNE (avv, keepPhase=false).
            // Die Button-ids (start/startCont) sind nur technische Handles — die Bedeutung steht
            // hier; die Labels/Titel in defs.js sind entsprechend gesetzt.
            case 'start': toggle(true); break;        // '>'  — weiter ab Position (continue)
            case 'startCont': toggle(false); break;   // '|>' — von vorne (avv: Takt→1, Seq→Step 0)
            case 'bang': resync(false); break;
            case 'bang2': resync(true); break;
            case 'slow': nudge(-1, phase); break;
            case 'fast': nudge(1, phase); break;
            case 'tap': tap(); break;
            case 'tapReset': tapReset(); break;
        }
    }

    // ISM-Latenz-Vertrag (Phase 2.2): Bus-Anteil + der bewusste Ausgabe-Offset (`latencyOffset`,
    // dieselbe Vorlauf/Nachlauf-Verschiebung wie `latOff()` oben), NICHT `lookaheadFn()` — das
    // ist nur das Scheduler-Vorausfenster, keine tatsächlich hörbare Zusatzlatenz.
    function latency() { return busLatencyMs() + (state.get('latencyOffset') || 0); }

    // Routing-Input `baseFreqIn` (werkbank.js verbindet polysynth.baseFreq → hier): der letzte
    // Hz-Wert wird gespeichert; ändert er sich UND ist die Base-Kopplung an, wird der Metro-Klick
    // neu gerendert (sonst folgte der Cutoff der Base-Frq erst beim nächsten anderen Reglerdreh).
    // Bei unverändertem Wert (flush liefert jeden Frame denselben) passiert nichts — idempotent.
    function setBaseFreqIn(hz) {
        const v = +hz || 0;
        if (v === _baseFreqIn) return;
        _baseFreqIn = v;
        if (state.get('metroCutoffQuant')) rebuildMetro();
    }

    return {
        onAction, ensureAudio, running, latency, setBaseFreqIn,
        onRunning(fn) { _onRunning = fn || (() => {}); },
        onBeat(fn) { _onBeat = fn || (() => {}); },
        onNudge(fn) { _onNudge = fn || (() => {}); },   // (liveBpm, bias) während des Anschiebens
        onClockBeat(fn) { _onClockBeat = fn || (() => {}); },   // (time, beatInBar) roh — Rec-Instrument
        get context() { return getContext(); },
        get nudgeBias() { return nudgeBias; },   // Debug/Test: aktueller Tempo-Bias (0 = kein Nudge)
    };
}
