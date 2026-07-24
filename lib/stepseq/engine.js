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
 * (Render-Loop) sowie `handleClockBeat(time)` (Beat-Anker, Fan-out aus taktEngine.
 * onClockBeat) und `transportStarted()`/`transportStopped()`/`transportContinue()` (Fan-out
 * aus taktEngine.onRunning, s. werkbank.js `_onTaktRunning`).
 *
 * ── Clock-Quelle & Trigger-Modell (ddw.md 20260725_003258, Umstellung auf Beat-Phasen-Modulo,
 *    Folge zu git 9252418) ──────────────────────────────────────────────────────────────────
 * FRÜHER wurde in ms akkumuliert (`nextAt += intervalMs`). Das brach beim '>'-Continue: der
 * erste Beat setzte `beatAnchorMs=jetzt` → tick() setzte `nextAt=beatAnchorMs` → SOFORTIGER
 * Trigger, egal wo im Intervall gestoppt wurde (@dpa: „'>' triggert beim Wieder-Start sofort
 * einen Step, obwohl der Seq mitten im Intervall war"; reproduzierbar bei seqDiv=8).
 *
 * JETZT hängen die Trigger an einem MODULO eines fortlaufenden Beat-Zählers statt an
 * akkumulierter Zeit:
 *   beatIdx      = fortlaufender Zähler, +1 pro rohem Clock-Beat (handleClockBeat). Bleibt bei
 *                  '>'-Continue erhalten (clock.js führt die Beat-Folge lückenlos fort,
 *                  keepPhase=true), wird bei avv ('|>') auf 0 gesetzt.
 *   φ (phaseNow) = beatIdx + Interpolation des Bruchteils seit dem letzten Beat, OHNE Klemme.
 *                  `beatAnchorMs` ist eine ZUKUNFTSPROJIZIERTE, jitterfreie Beat-Zeit (s. phaseNow),
 *                  darum ist φ rein linear und das Neu-Ankern bei jedem Beat nahtlos — keine
 *                  Rückwärtssprünge, keine Doppel/Ausfälle (die im alten ceil()-Kommentar gewarnte
 *                  Jitter-Falle existiert im Projektions-Modell nicht).
 *   stepBeats    = seqDiv / seqMult (Beats pro Step). seqDiv↑ = langsamer/geteilt, seqMult↑ =
 *                  schneller/vervielfacht. 1/1 → 1 Beat/Step → trifft GENAU den Beat.
 *   Trigger      = wenn φ das nächste Vielfache erreicht: `while (φ >= triggerPhase) { feuern;
 *                  triggerPhase += stepBeats; }` — AKKUMULATION (kein ceil()/round()), darum
 *                  reißt kein Jitter einen Step raus, auch bei Subdivision-Beat-Koinzidenz
 *                  (@dpas alter „1/3 läuft ungleichmäßig"-Bug, der genau am ceil() hing).
 * Die alte MIN_HZ/MAX_HZ-Notbremse bleibt als reiner Endlosschleifen-/Burst-Schutz, in
 * Phase-Space übersetzt (min/max stepBeats), praktisch nie aktiv — kein stiller Deckel.
 *
 * ── Phasen-Anker & Sprünge (handleClockBeat, 4A.3) ──────────────────────────────────────────
 * `time` kommt als AudioContext-Sekunden rein, werkbank.js rechnet VOR dem Aufruf auf
 * performance.now()-Millisekunden um (wie recEngine.handleClockBeat/scheduleBeat) — ohne das
 * verglich der Anker Sekunden mit Millisekunden und korrigierte de facto nie (@dpa 20260723_1400).
 * Jeder rohe Beat setzt `beatAnchorMs=time` und `beatIdx+=1` — die Phase trägt sich damit von
 * selbst fort, eine „sanfte" Zeit-Nachführung wie früher entfällt (sie brachte den ceil()-Bug).
 * SPRÜNGE (Resync '!'/'!!', Tempo-Sprung, Tab-Wiederaufwachen) re-ankern auf Step 0: `triggerPhase
 * = beatIdx; resetPending`. Der '>'-Continue ist der EINE Fall, der beim ersten (immer als Sprung
 * wirkenden) Beat NICHT auf Step 0 zurücksetzt und `triggerPhase` behält — so nimmt er die Phase
 * genau dort wieder auf, wo er stand, ohne Sofort-Trigger.
 *
 * ── Start/Stop-Kopplung (4A.4) ──────────────────────────────────────────────────────────────
 * `seqEnabled` bleibt ein eigener Arm-Schalter, aber `tick()` feuert NUR bei
 * `seqEnabled && transportOn` (s. `running()`). `transportStarted()` (avv, '|>') armt auf Step 0
 * (Downbeat-phasengleich), `transportContinue()` ('>') nimmt die eingefrorene Position + Phase
 * wieder auf, `transportStopped()` friert Position UND Phase ein und lässt die Anzeige verfallen.
 *
 * onTrigger(value) feuert bei jedem Step, dessen Wert NICHT `null` ist (Punkt 1, ddw.md:
 * die Skala/„off"-Semantik hängt am gewählten Sq-Ziel, s. seqCore.js Kopfkommentar) — ein
 * Step-Wert `null` ist „kein Trigger", die vorige Hüllkurve klingt einfach aus.
 */
import { SEQ_MAX, seqAdvance } from './seqCore.js';
import { busLatencyMs } from '../routing/latency.js';

const MIN_HZ = 0.05, MAX_HZ = 40;   // Notbremse gegen Endlosschleife/Ton-Chaos bei Extremwerten
const MIN_INTERVAL_MS = 1000 / MAX_HZ;   // 25 ms
const MAX_INTERVAL_MS = 1000 / MIN_HZ;   // 20000 ms

/**
 * @param {import('../MiniState.js').MiniState} state
 * @param {() => number} getBeatDurMs  Dauer eines Takt-Beats in ms (60000/BPM)
 * @param {(value:number) => void} onTrigger  feuert bei jedem aktiven (nicht-null) Step
 */
export function createStepSeqEngine(state, getBeatDurMs, onTrigger) {
    let pos = -1;
    let beatIdx = null;        // fortlaufender Beat-Zähler (+1 pro rohem Clock-Beat), null bis zum ersten Beat
    let beatAnchorMs = null;   // performance.now()-Zeit (ms) des letzten rohen Beats — Referenz der φ-Interpolation
    let triggerPhase = null;   // φ (in Beats) des nächsten fälligen Triggers; null = noch nicht geankert
    let lastBeatMs = null;     // letzter roher Beat — für die Sprung-Erkennung (Resync/Tempo-Sprung/Tab-Wake)
    let resetPending = false;
    let transportOn = false;
    let pendingBeatSync = false;   // armBeatSync('!'): der NÄCHSTE echte Beat wird zum neuen Step-0-Anker
    let frozenPos = -1;            // beim Stop eingefrorene Position (für '>'-Continue, ddw.md 20260724_212747)
    let armAvv = false;            // '|>'-Start: der nächste Beat setzt beatIdx=0/triggerPhase=0 (Step 0)
    let armContinue = false;       // '>'-Continue: der nächste (Sprung-)Beat behält triggerPhase, resettet NICHT

    const running = () => !!state.get('seqEnabled') && transportOn;

    // Beats pro Step = seqDiv/seqMult, mit der alten MIN/MAX-Notbremse in Phase-Space übersetzt
    // (verhindert Burst bei Extrem-mult / Endlosschleife bei Extrem-div; bei Tempo-Werten nie aktiv).
    const stepBeats = () => {
        const mult = Math.max(1, state.get('seqMult') | 0 || 1);
        const div = Math.max(1, state.get('seqDiv') | 0 || 1);
        const beatDur = getBeatDurMs();
        const raw = div / mult;
        if (!(beatDur > 0)) return raw;
        const minSb = MIN_INTERVAL_MS / beatDur;
        const maxSb = MAX_INTERVAL_MS / beatDur;
        return Math.max(minSb, Math.min(maxSb, raw));
    };

    // Kontinuierliche Beat-Phase φ: der Zähler beim letzten Beat plus der interpolierte Bruchteil
    // seither — OHNE Klemme, bewusst. `beatAnchorMs` ist keine roh gemessene, sondern eine
    // ZUKUNFTSPROJIZIERTE Beat-Zeit (werkbank.js: perfNow + (t − ctxNow)·1000, t = die deterministisch
    // vom Clock-Scheduler geplante AudioContext-Zeit). Damit sind die Anker exakt beatDur auseinander
    // und tragen KEINEN Worker-/Scheduler-Jitter (dieser sitzt nur im ZEITPUNKT des Callbacks, nicht
    // im projizierten Wert). Folge: φ ist rein linear in `now`, und das Neu-Ankern bei jedem Beat ist
    // nahtlos (beide Anker projizieren dieselbe Zeitachse → identischer φ-Wert am Übergang) — kein
    // Rückwärtssprung, keine Doppel/Ausfälle. Für Subdivisions (mult>1, stepBeats<1) trägt genau diese
    // Interpolation die Zwischen-Trigger; die integer-φ-Trigger fallen exakt auf die projizierte
    // Beat-Zeit. Eine Klemme auf [0,1] wäre hier schädlich: läuft der nächste Beat-Callback lookahead-
    // FRÜH (now < beatAnchorMs des neuen Beats), schnappte die untere Klemme φ zu früh auf beatIdx und
    // die integer-Trigger feuerten ~lookahead zu zeitig (gemessen ~28ms bei mult=2 → 222 statt 250ms).
    function phaseNow(nowMs) {
        const beatDur = getBeatDurMs();
        return beatDur > 0 ? beatIdx + (nowMs - beatAnchorMs) / beatDur : beatIdx;
    }

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
         * Sequenzer soll darum exakt zu DIESEM nächsten Beat neu ankern (Step 0), nicht sofort
         * beim Tastendruck (@dpa 20260723_1455). handleClockBeat() wertet das Flag beim nächsten
         * rohen Beat aus und setzt triggerPhase=beatIdx (Step 0 auf dem BPM-Schlag). */
        armBeatSync() { pendingBeatSync = true; },

        /** Transport-Start-Kopplung (werkbank.js `_onTaktRunning`-Fan-out, 4A.4, avv '|>'):
         * Downbeat-Start, phasengleich — der nächste rohe Beat setzt beatIdx=0/triggerPhase=0,
         * Step 0 fällt auf ihn. Der Anker selbst wird NICHT hier angefasst: `clock.start()`
         * liefert den allerersten Beat SYNCHRON, BEVOR dieser Aufruf läuft — würde hier zusätzlich
         * geankert, verwürfe das genau diesen frischen Beat wieder (Doppel-Reset). Das armAvv-Flag
         * lässt genau den ersten Beat die Nullstellung machen. */
        transportStarted() { transportOn = true; armAvv = true; armContinue = false; resetPending = true; },

        /** Transport-Continue (ddw.md 20260724_212747 + 20260725_003258, '>' = „continue ohne
         * avv"): startet den Transport, OHNE alles auf den Anfang zu ziehen — die beim Stop
         * eingefrorene Position (frozenPos) UND die Beat-Phase (triggerPhase/beatIdx) leben weiter.
         * `armContinue` unterdrückt genau EINMAL das Step-0-Reset, das handleClockBeat sonst beim
         * ersten (immer als Sprung erkannten) Beat nach Start feuern würde: so wird nur das
         * beatAnchorMs-Raster neu geankert, triggerPhase bleibt → der nächste Trigger kommt erst
         * am phasenrichtigen Rasterpunkt (kein Sofort-Trigger mehr). Gegenstück zu transportStarted(). */
        transportContinue() { transportOn = true; pos = frozenPos; armContinue = true; armAvv = false; },

        /** Transport-Stop-Kopplung: Sequenzer verstummt sofort (running() → false), Position
         * verfällt auf -1 (Anzeige aus), aber Position und Phase werden für den '>'-Continue
         * EINGEFROREN: frozenPos, beatIdx und triggerPhase bleiben stehen. beatAnchorMs/lastBeatMs
         * fallen auf null, damit über die Stop-Pause NICHT interpoliert wird (sonst rechnete der
         * erste tick() nach Continue aus der alten, weit zurückliegenden Anker-Zeit ein riesiges φ
         * → der alte Sofort-Trigger-Bug). */
        transportStopped() {
            if (pos >= 0) frozenPos = pos;
            transportOn = false; pos = -1;
            beatAnchorMs = null; lastBeatMs = null;
            resetPending = false; armAvv = false; armContinue = false; pendingBeatSync = false;
            // beatIdx UND triggerPhase bleiben eingefroren — der '>'-Continue nimmt die Phase wieder auf.
        },

        /** Expliziter Phasen-Sprung (werkbank.js: taktEngine.onAction('bang2'), die Taste „!!" —
         * „die 1 fällt sofort"). Setzt den Anker EIGENSTÄNDIG auf `performance.now()` und
         * triggerPhase=beatIdx (Step 0 jetzt). clock.resync(true) hat schon einen SYNCHRONEN Beat
         * gefeuert (der über handleClockBeat lief, BEVOR dieser Aufruf dran ist) — dieser Pfad ist
         * die GARANTIE, falls die Sprung-Heuristik dort den Resync knapp verfehlt, weil er zufällig
         * nah am alten Raster lag (@dpa 20260723_1427). Direkt zu setzen (statt ein Flag) ist nötig,
         * weil der synchrone Beat schon durch ist. */
        resyncPhase() {
            beatAnchorMs = performance.now();
            lastBeatMs = beatAnchorMs;
            if (beatIdx == null) beatIdx = 0;
            triggerPhase = beatIdx;
            resetPending = true;
            armAvv = false; armContinue = false;
        },

        /** Roher Scheduler-Beat der Taktmetro-Engine (werkbank.js `taktEngine.onClockBeat`-
         * Fan-out, 4A.3, Zeit bereits auf performance.now()-ms umgerechnet). Führt den
         * Beat-Zähler (+1) nach und behandelt Sonderfälle: avv (Step 0), Continue (Phase behalten),
         * angeforderten Sync '!' und echte Sprünge (Tempo-Sprung/Tab-Wake) → Step 0. Bei einem
         * normalen Beat bei stabilem Tempo passiert SONST nichts — beatIdx + Interpolation tragen
         * die Phase, triggerPhase läuft in tick() per `+= stepBeats()` fort. */
        handleClockBeat(time) {
            const beatDurMs = getBeatDurMs();
            // Angeforderter Sync ('!') hat Vorrang: dieser Beat WIRD Step 0, unabhängig von der
            // Sprung-Heuristik.
            const sync = pendingBeatSync; pendingBeatSync = false;
            const jumped = lastBeatMs == null || Math.abs(time - (lastBeatMs + beatDurMs)) > beatDurMs / 2;
            lastBeatMs = time;
            beatAnchorMs = time;

            if (armAvv) {   // '|>' avv: Nullstellung auf DIESEM Beat (Step 0 / Downbeat)
                beatIdx = 0; triggerPhase = 0; resetPending = true;
                armAvv = false; armContinue = false;
                return;
            }
            beatIdx = (beatIdx == null ? 0 : beatIdx + 1);
            if (armContinue) {   // '>' continue: Raster neu ankern, aber triggerPhase behalten
                if (triggerPhase == null) triggerPhase = beatIdx;   // Sicherheitsnetz (Continue ohne Vorlauf)
                armContinue = false;
                return;
            }
            if (sync || jumped) {   // '!' / '!!' (heuristisch) / Tempo-Sprung / Tab-Wake → Step 0
                triggerPhase = beatIdx; resetPending = true;
            }
            // Normaler Beat: nichts weiter (s. Kopfkommentar — eine „sanfte" Nachführung brachte
            // früher den ceil()-Bug; die Phase trägt sich über beatIdx/Interpolation von selbst).
        },

        /** Im Render-Loop aufrufen (werkbank.js, wie baseKeyboard.tick() u.a.). Feuert nur bei
         * laufendem Transport (running()) und erst, wenn ein echter Beat geankert hat (beatAnchorMs
         * / triggerPhase gesetzt) — ein roher nowMs-Fallback hier läge nicht exakt auf dem
         * Clock-Raster. Vergleicht die kontinuierliche Beat-Phase φ gegen triggerPhase und feuert
         * per Akkumulation (`triggerPhase += stepBeats()`), nicht per ceil() — s. Kopfkommentar. */
        tick(nowMs) {
            if (!running()) { return; }
            if (beatAnchorMs == null || triggerPhase == null) return;
            let guard = 0;
            const phi = phaseNow(nowMs);
            while (phi >= triggerPhase && guard++ < 64) {
                const len = Math.max(1, Math.min(SEQ_MAX, state.get('seqLen') | 0));
                pos = seqAdvance(pos, len, resetPending);
                resetPending = false;
                const steps = state.get('seqSteps') || [];
                const v = steps[pos];
                if (v != null) onTrigger(v);   // null = off (Punkt 1, ddw.md); Skala ist ziel-abhängig, kein Clamp hier
                triggerPhase += stepBeats();
            }
        },
    };
}
