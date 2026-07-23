/**
 * engine.js — der reale Trigger-Takt des Stepsequenzer-ISM (@dpa 20260722_203201,
 * PHASE4_SPEC.md Paket 4A: der Sequenzer wird ein Transport-Kind).
 *
 * ISM-Konvention (docs/CONTROLS.md, Phase 0/PLAN_OPERA.md): Factory `createStepSeqEngine()`
 * wie createTaktEngine/createPolySynthEngine/createRecEngine — KEINE Sonderform mehr
 * (früher `class StepSeqEngine` in `StepSeqEngine.js`, das war der „veraltete Konstrukt"-
 * Bruch). Die Closure ist genauso instanz-fähig wie eine Klasse (mehrere Sequenzer in
 * Phase 4B = mehrfacher Aufruf), nur konsistent zu den anderen ISMs.
 *
 * Nahtstellen nach außen (werkbank.js): `running`, `seqPos()`, `resetSeq()`, `tick(nowMs)`
 * (Render-Loop) sowie NEU `handleClockBeat(time)` (Beat-Anker, Fan-out aus taktEngine.
 * onClockBeat) und `transportStarted()`/`transportStopped()` (Fan-out aus taktEngine.
 * onRunning, s. werkbank.js `_onTaktRunning`).
 *
 * Clock-Quelle (PHASE4_SPEC.md 4A.2, ersetzt die alte BaseFreq-Kopplung — @dpas Kern-
 * Vorwurf „Null mit Tempo/Start/Sync verbunden"): Trigger-Intervall = ein Beat-Bruchteil,
 * nicht mehr BaseFreq-abhängig.
 *   beatDurMs   = 60000 / Takt-BPM (getBeatDurMs-Closure, von werkbank.js gereicht)
 *   intervalMs  = beatDurMs · seqDiv ÷ seqMult
 * seqMult=1/seqDiv=1 → intervalMs == beatDurMs → 1/1 trifft GENAU den Beat. seqMult↑ =
 * schneller/vervielfacht, seqDiv↑ = langsamer/geteilt. Die alte MIN_HZ/MAX_HZ-Notbremse
 * bleibt als reiner Endlosschleifen-Schutz (auf Intervall-Grenzen übersetzt), ist bei
 * Tempo-Werten praktisch nie aktiv — kein stiller musikalischer Deckel.
 *
 * Phasen-Anker (4A.3): `handleClockBeat(time)` bekommt bei jedem rohen Scheduler-Beat der
 * Taktmetro-Engine (fan-out in werkbank.js, taktEngine.onClockBeat ist ein Einzel-Callback,
 * schon von Rec belegt) den Trigger-Raster nachgeführt, damit `tick()` (rAF/performance.now())
 * nicht gegen den AudioContext-Scheduler wegdriftet. `time` kommt als AudioContext-Sekunden
 * rein, werkbank.js rechnet sie VOR dem Aufruf auf performance.now()-Millisekunden um (wie
 * recEngine.handleClockBeat/scheduleBeat es auch tun) — ohne das war der Anker unwirksam
 * (Sekunden vs. Millisekunden verglichen, @dpa 20260723_1400).
 * Im Normalbetrieb (Beat kommt wie erwartet ~beatDurMs nach dem letzten) korrigiert jeder
 * Beat `nextAt` nur VORWÄRTS gegen `beatAnchorMs` (nie zurück, sonst Doppel-Trigger) —
 * unabhängig von seqDiv/seqMult. Weicht ein Beat aber SPRUNGHAFT vom erwarteten Zeitpunkt ab
 * (Resync „!"/„!!", Tempo-Sprung, Tab-Wiederaufwachen), ist der alte Anker wertlos: dann
 * wird komplett neu geankert, statt nur zu nudgen — sonst „Metronom springt, Sequenzer bleibt
 * stur" (genau der von @dpa gemeldete Bug).
 *
 * Start/Stop-Kopplung (4A.4): `seqEnabled` bleibt ein eigener Arm-Schalter, aber `tick()`
 * feuert NUR bei `seqEnabled && transportOn` (s. `running()`). `transportStarted()` armt auf
 * Step 0 (Downbeat-phasengleich), `transportStopped()` lässt die Position auf -1 verfallen.
 *
 * onTrigger(envHeight) feuert NUR bei einem aktiven Step (Wert > 0) — ein Step-Wert 0 ist
 * „kein Trigger", die vorige Hüllkurve klingt einfach aus (exakt teslacoils Semantik).
 */
import { SEQ_MAX, seqAdvance } from './seqCore.js';
import { busLatencyMs } from '../routing/latency.js';

const MIN_HZ = 0.05, MAX_HZ = 40;   // Notbremse gegen Endlosschleife/Ton-Chaos bei Extremwerten
const MIN_INTERVAL_MS = 1000 / MAX_HZ;   // 25 ms
const MAX_INTERVAL_MS = 1000 / MIN_HZ;   // 20000 ms

/**
 * @param {import('../MiniState.js').MiniState} state
 * @param {() => number} getBeatDurMs  Dauer eines Takt-Beats in ms (60000/BPM)
 * @param {(envHeight:number) => void} onTrigger  feuert bei jedem aktiven Step
 */
export function createStepSeqEngine(state, getBeatDurMs, onTrigger) {
    let pos = -1;
    let nextAt = null;        // performance.now()-Zeitstempel (ms) des nächsten fälligen Triggers
    let beatAnchorMs = null;  // Zeitpunkt des ersten Beats nach Transport-Start (Raster-Referenz)
    let lastBeatMs = null;    // letzter roher Beat — für die Sprung-Erkennung (Resync/Tempo-Sprung)
    let resetPending = false;
    let transportOn = false;
    let pendingBeatSync = false;   // armBeatSync(): der NÄCHSTE echte Beat wird zum neuen Anker

    const running = () => !!state.get('seqEnabled') && transportOn;

    const intervalMs = () => {
        const mult = Math.max(1, state.get('seqMult') | 0 || 1);
        const div = Math.max(1, state.get('seqDiv') | 0 || 1);
        const raw = (getBeatDurMs() * div) / mult;
        return Math.max(MIN_INTERVAL_MS, Math.min(MAX_INTERVAL_MS, raw));
    };

    // ISM-Latenz-Vertrag (Phase 2.2): kein eigener Scheduler-Vorlauf — tick() hängt am
    // Render-Loop (rAF), reiner Bus-Anteil. Die rAF-Frame-Unschärfe wird NICHT mit eingerechnet
    // (keine erfundene Genauigkeit, s. PHASE2_SPEC.md).
    function latency() { return busLatencyMs(); }

    return {
        get running() { return running(); },
        seqPos() { return pos; },
        latency,
        /** set0 (@dpa wie teslacoil): der NÄCHSTE Trigger startet wieder bei Step 0. */
        resetSeq() { resetPending = true; },

        /** Weicher Resync (werkbank.js: taktEngine.onAction('bang'), die Taste „!" —
         * „der nächste Schlag wird zur 1, der Takt läuft unbeirrt weiter"). Bewegt bewusst
         * NICHTS jetzt (anders als resyncPhase()/„!!"): Clock.resync(false) verschiebt keine
         * Audio-Zeit, sondern relabelt nur den NÄCHSTEN ohnehin fälligen Beat als „1" — der
         * Sequenzer soll darum exakt zu DIESEM nächsten Beat neu ankern, nicht sofort beim
         * Tastendruck (@dpa 20260723_1455: „soll aber erst beim nächsten BPM-Schlag
         * zurücksetzen, so dass BPM-Schlag und Seq.-Anfang synchron ist" — vorher setzte
         * resetSeq() den nächsten SEQUENZER-eigenen Trigger zurück, der bei seqMult/seqDiv
         * ≠ 1/1 nicht mit dem nächsten rohen Beat zusammenfällt). handleClockBeat() wertet
         * das Flag beim nächsten rohen Beat aus und ankert dort komplett neu. */
        armBeatSync() { pendingBeatSync = true; },

        /** Transport-Start-Kopplung (werkbank.js `_onTaktRunning`-Fan-out, 4A.4): Downbeat-
         * Start, phasengleich — der nächste Trigger fängt bei Step 0 an. Fasst den Beat-Anker
         * bewusst NICHT an: `clock.start()` liefert den allerersten Beat SYNCHRON, BEVOR
         * `emitRunning()` (und damit dieser Aufruf) läuft — würde hier zusätzlich resettet,
         * verwirft das genau diesen frischen, korrekten Anker wieder (Doppel-Reset, führte zu
         * einem zweiten Sprung beim nächsten Beat und schiefer Taktung am Lauf-Anfang).
         * `transportStopped()` hat beatAnchorMs/lastBeatMs schon auf null gebracht (oder sie
         * sind es seit dem Bau nie anders gewesen) — `handleClockBeat()` erkennt den ersten
         * Beat darüber ohnehin selbst als Sprung und ankert sauber. */
        transportStarted() { transportOn = true; resetPending = true; },

        /** Transport-Stop-Kopplung: Sequenzer verstummt sofort (running() → false), Position
         * verfällt auf -1, der Anker verfällt (wird beim nächsten Start/Beat neu gesetzt). */
        transportStopped() { transportOn = false; pos = -1; nextAt = null; beatAnchorMs = null; lastBeatMs = null; resetPending = false; },

        /** Expliziter Phasen-Sprung (werkbank.js: taktEngine.onAction('bang2'), die Taste
         * „!!" — „die 1 fällt sofort"). Setzt den Anker EIGENSTÄNDIG auf `performance.now()`
         * (derselbe Zeitraum, in dem der Klick synchron ausgelöst wurde — kein Rückgriff auf
         * die Zeit-Heuristik in handleClockBeat nötig, die kann einen Sprung verfehlen, wenn
         * er zufällig nah am alten Raster liegt, s. `jumped`). Wichtig: NICHT einfach auf
         * null setzen und den nächsten echten Beat neu ankern lassen — das führte zu einem
         * Doppel-Reset (der nächste Beat sah `lastBeatMs==null`, hielt sich selbst für einen
         * Sprung und wiederholte Step 0 statt auf Step 1 weiterzuzählen — „erster Trigger
         * bleibt 2 Zählzeiten auf Step 0", @dpa 20260723_1427). Mit einem SOFORT bekannten,
         * korrekten Anker sieht der nächste echte Beat eine normale (kleine) Differenz und
         * läuft glatt weiter. */
        resyncPhase() {
            const now = performance.now();
            beatAnchorMs = now; lastBeatMs = now; nextAt = null; resetPending = true;
        },

        /** Roher Scheduler-Beat der Taktmetro-Engine (werkbank.js `taktEngine.onClockBeat`-
         * Fan-out, 4A.3, Zeit bereits auf performance.now()-ms umgerechnet). Erkennt nur
         * SPRÜNGE (Resync/Tempo-Sprung/angeforderter Beat-Sync) und ankert dann komplett neu.
         * Bei stabilem Tempo tut diese Methode bewusst SONST NICHTS — s. Kommentar unten,
         * warum eine zusätzliche "sanfte" Nachführung bei jedem Beat mehr Bugs brachte, als
         * sie löste. */
        handleClockBeat(time) {
            // Angeforderter Sync auf den NÄCHSTEN echten Beat (armBeatSync, '!'): hat Vorrang
            // vor allem anderen — dieser Beat WIRD jetzt zum neuen Anker, unabhängig davon,
            // ob die Sprung-Heuristik unten ihn als „nah genug am alten Raster" einstufen
            // würde.
            let jumped = pendingBeatSync;
            if (pendingBeatSync) pendingBeatSync = false;

            const beatDurMs = getBeatDurMs();
            jumped = jumped || lastBeatMs == null || Math.abs(time - (lastBeatMs + beatDurMs)) > beatDurMs / 2;
            lastBeatMs = time;
            if (jumped) { beatAnchorMs = time; nextAt = null; resetPending = true; }
            // KEIN sonstiger Zweig mehr (@dpa 20260723_1500ff „1/3 läuft ungleichmäßig"):
            // tick() ist seit dem beatAnchorMs-Fix (s. dort) am echten ersten Beat verankert
            // und schreibt danach rein per `+= intervalMs()` fort — bei stabilem Tempo bleibt
            // das für jede realistische Sitzungsdauer exakt auf dem Raster (Gleitkomma-Fehler
            // über Stunden ist um Größenordnungen unter jeder hörbaren Schwelle), tempo-
            // Änderungen wirken sofort (intervalMs() liest bpm live). Eine zusätzliche
            // Vorwärts-Korrektur hier hätte nur Sinn gegen ECHTEN Uhren-Drift (rAF vs.
            // AudioContext) — den gibt es nicht, beide hängen an derselben Systemuhr. Sie
            // brachte stattdessen einen eigenen Bug: jeder rohe Beat trägt eigenes ms-Jitter
            // (Worker-Tick/Scheduler, ~5ms beobachtet), und sobald `elapsed` dadurch knapp
            // über ein Subdivisions-Vielfaches rutschte, rundete ceil() einen ganzen Schritt
            // zu weit hoch — riss bei JEDER Subdivision-Beat-Koinzidenz (z.B. seqMult=3: jeder
            // 3. Trigger) reproduzierbar einen Trigger raus, egal wie großzügig die Toleranz
            // (JITTER_MS 1e-6 → 5 → 15 halfen, aber nie zuverlässig genug).
        },

        /** Im Render-Loop aufrufen (werkbank.js, wie baseKeyboard.tick() u.a.). Feuert nur
         * bei laufendem Transport (running()) — kein Transport, kein Trigger, auch bei „An".
         * Wartet auf `beatAnchorMs` (echter erster Beat), statt mit `nowMs` zu raten: ein
         * roher nowMs-Fallback hier hätte einen Startwert gesetzt, der NICHT exakt auf dem
         * später von handleClockBeat verankerten Raster liegt — die Folge war ein fester
         * Versatz (~1 rAF-Frame), der sich bei jedem `+= intervalMs()` mitschleppt, bis eine
         * spätere handleClockBeat-Korrektur ihn in EINEM Sprung nachholt. Genau DAS erzeugte
         * bei jeder Subdivision-Beat-Koinzidenz (z.B. seqMult=3: jeder 3. Trigger fällt auf
         * einen rohen Beat) ein einzelnes zu langes Intervall (@dpa 20260723: „1/3 läuft
         * ungleichmäßig" — Messung zeigte reproduzierbar einen ~230ms- statt 166.7ms-Schritt
         * exakt beim 3. Trigger). Die winzige Verzögerung bis zum allerersten echten Beat
         * (~60-100ms, taktmetro-Lookahead) ist der Preis dafür — unhörbar gegen den alten Bug. */
        tick(nowMs) {
            if (!running()) { nextAt = null; return; }
            if (beatAnchorMs == null) return;
            if (nextAt == null) nextAt = beatAnchorMs;
            let guard = 0;
            while (nowMs >= nextAt && guard++ < 64) {
                const len = Math.max(1, Math.min(SEQ_MAX, state.get('seqLen') | 0));
                pos = seqAdvance(pos, len, resetPending);
                resetPending = false;
                const steps = state.get('seqSteps') || [];
                const v = Math.max(0, Math.min(1, steps[pos] || 0));
                if (v > 0) onTrigger(v);
                nextAt += intervalMs();
            }
        },
    };
}
