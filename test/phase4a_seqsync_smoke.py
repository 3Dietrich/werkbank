#!/usr/bin/env python3
"""Headless-Smoke für Phase 4A (Stepseq als Transport-Kind, PHASE4_SPEC.md 4A.6).
Lauf: python3 test/phase4a_seqsync_smoke.py

Hart begrenzt (Watchdog killt nach 40s), kein Pollen — wie test/phase2_routing_smoke.py.
Prüft NUR das, was 4A zusagt (Tempo-Clock statt BaseFreq, Beat-Anker, Start/Stop-Kopplung),
nicht die ganze Stepseq-UI:

  · seqEnabled an, Transport gestoppt → kein emit-Puls auf stepseq.amp (Start-Kopplung).
  · Transport an, bpm=120 (beatDurMs=500), seqMult=1/seqDiv=1, voller Step-Puffer →
    mittlerer Trigger-Abstand ≈ 500ms (1/1 = exakt der Beat).
  · seqMult=2 → ≈250ms (schneller/vervielfacht). seqDiv=2 → ≈1000ms (langsamer/geteilt).
  · Transport-Stop → Puls endet, Position -1; erneuter Start beginnt wieder bei Step 0.
  · Phase-2-Zusage (window.__routing kennt alle vier Module) bleibt stehen.

Der jeweils ERSTE gemessene Abstand nach Start/Parameter-Wechsel wird verworfen (Skip_first):
der allererste Trigger feuert per Definition sofort (Downbeat, nowMs-Fallback, bevor der
erste echte Scheduler-Beat den Anker korrigiert hat) — das ist kein Drift, sondern der
bewusste „phasengleiche Downbeat-Start" (4A.4), verzerrt aber eine einzelne Intervall-Probe.
"""
import subprocess, sys, time, os, signal, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8144
HARD_LIMIT_S = 40

def watchdog():
    time.sleep(HARD_LIMIT_S)
    print(f"SMOKE: HARD-TIMEOUT nach {HARD_LIMIT_S}s — abgebrochen (kein Hänger-Pollen).")
    os._exit(2)

threading.Thread(target=watchdog, daemon=True).start()

srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT)],
                       cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
errors, fails = [], []
check = lambda ok, msg: None if ok else fails.append(msg)

def avg_interval(ts, skip_first=1):
    diffs = [ts[i + 1] - ts[i] for i in range(len(ts) - 1)]
    diffs = diffs[skip_first:] if len(diffs) > skip_first else diffs
    return sum(diffs) / len(diffs) if diffs else None

try:
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        pg = b.new_page(viewport={"width": 1400, "height": 900})
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.goto(f"http://localhost:{PORT}/", wait_until="networkidle", timeout=15000)

        check(pg.evaluate("() => !!window.__stepseq && !!window.__takt && !!window.__routing"),
              "window.__stepseq/__takt/__routing fehlt")
        # Phase-2-Zusage bleibt stehen (4A ist additiv).
        mods = pg.evaluate("() => window.__routing.reg.modules().map(m => m.id)")
        check(set(mods) == {"takt", "polysynth", "stepseq", "rec"},
              f"erwartet takt/polysynth/stepseq/rec, gefunden: {mods}")

        # ── Test-Rig: alle Stepseq.amp-Pulse über die Registry-Aktivität einsammeln ──
        pg.evaluate("""() => {
            window.__seqPulses = [];
            window.__routing.reg.onActivity((e) => {
                if (e.src.module === 'stepseq' && e.src.port === 'amp') window.__seqPulses.push(performance.now());
            });
        }""")

        # bekanntes Tempo + voller Step-Puffer (jeder Step triggert, 1/1 muss den Beat treffen)
        # Indizierte Keys (Multi-Sq-Umbau, s. lib/stepseq/multiSq.js scoped()) — Sq 0.
        pg.evaluate("""() => {
            window.__takt.state.set('bpm', 120);
            window.__stepseq.state.set('seqSteps_0', new Array(120).fill(1));
            window.__stepseq.state.set('seqLen_0', 8);
            window.__stepseq.state.set('seqMult_0', 1);
            window.__stepseq.state.set('seqDiv_0', 1);
            window.__stepseq.state.set('seqEnabled_0', true);
        }""")

        # ── 1) An, aber Transport gestoppt → kein Puls (beweist die Start-Kopplung) ──
        time.sleep(0.8)
        n0 = pg.evaluate("() => window.__seqPulses.length")
        check(n0 == 0, f"Puls VOR Transport-Start (sollte 0 sein): {n0}")

        # ── 2) Transport an, 1/1 → Abstand ≈ beatDurMs (500ms bei 120 bpm) ──
        pg.evaluate("() => window.__takt.engine.onAction('start')")
        time.sleep(2.6)
        avg_11 = avg_interval(pg.evaluate("() => window.__seqPulses.slice()"))
        check(avg_11 is not None and abs(avg_11 - 500) < 30,
              f"1/1-Abstand erwartet ≈500ms (±30ms), gemessen: {avg_11}")

        # ── 3a) seqMult=2 → ≈250ms (schneller/vervielfacht) ──
        pg.evaluate("() => { window.__seqPulses.length = 0; window.__stepseq.state.set('seqMult_0', 2); }")
        time.sleep(1.8)
        avg_mult2 = avg_interval(pg.evaluate("() => window.__seqPulses.slice()"))
        check(avg_mult2 is not None and abs(avg_mult2 - 250) < 25,
              f"seqMult=2-Abstand erwartet ≈250ms (±25ms), gemessen: {avg_mult2}")

        # ── 3b) seqMult=1, seqDiv=2 → ≈1000ms (langsamer/geteilt) ──
        pg.evaluate("""() => {
            window.__seqPulses.length = 0;
            window.__stepseq.state.set('seqMult_0', 1);
            window.__stepseq.state.set('seqDiv_0', 2);
        }""")
        time.sleep(5.2)
        avg_div2 = avg_interval(pg.evaluate("() => window.__seqPulses.slice()"))
        check(avg_div2 is not None and abs(avg_div2 - 1000) < 45,
              f"seqDiv=2-Abstand erwartet ≈1000ms (±45ms), gemessen: {avg_div2}")

        # ── 4) Transport-Stop → Puls endet, Position -1; avv-Neustart ('|>'/startCont) bei Step 0 ──
        # Hinweis: seit dem Semantik-Tausch (ddw.md 20260724_233253) ist 'start' ('>') = continue
        # (weiter ab Position), 'startCont' ('|>') = avv (von vorne). Für „Neustart bei Step 0" ist
        # daher startCont der richtige Knopf (vorher stand hier 'start', was jetzt continue wäre).
        pos_before_stop = pg.evaluate("() => window.__stepseq.mgr.engineAt(0).seqPos()")
        check(pos_before_stop >= 0, f"vor dem Stop sollte eine Position mitten im Muster stehen: {pos_before_stop}")
        pg.evaluate("() => window.__takt.engine.onAction('start')")   # stop
        time.sleep(0.1)
        pos_after_stop = pg.evaluate("() => window.__stepseq.mgr.engineAt(0).seqPos()")
        check(pos_after_stop == -1, f"nach Transport-Stop Position erwartet -1, ist: {pos_after_stop}")
        pg.evaluate("() => { window.__seqPulses.length = 0; }")
        time.sleep(0.8)
        n_after_stop = pg.evaluate("() => window.__seqPulses.length")
        check(n_after_stop == 0, f"Puls NACH Transport-Stop (sollte 0 sein): {n_after_stop}")

        pg.evaluate("() => window.__takt.engine.onAction('startCont')")   # avv-Neustart ('|>')
        time.sleep(0.35)
        pos_after_restart = pg.evaluate("() => window.__stepseq.mgr.engineAt(0).seqPos()")
        check(pos_after_restart == 0, f"nach avv-Neustart erwartet Step 0, ist: {pos_after_restart}")

        # Panik, damit keine Voice den Rest des Laufs durchklingt.
        pg.evaluate("""() => {
            window.__takt.engine.onAction('start');
            window.__polysynth.engine.allNotesOff();
        }""")

        b.close()
finally:
    srv.send_signal(signal.SIGINT)

if errors:
    print("JS-Fehler:", *errors, sep="\n  ")
if fails:
    print("FAILS:", *fails, sep="\n  ")
print("SMOKE:", "OK" if not errors and not fails else "FAILED")
sys.exit(1 if errors or fails else 0)
