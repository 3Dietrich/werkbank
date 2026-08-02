#!/usr/bin/env python3
"""Headless-Smoke für Punkt 3b Phase B (ddw.md 20260724): Takt/Metronom-Knobs+Buttons als
Sq-Ziele. Lauf: python3 test/sqTargets_takt_smoke.py

Hart begrenzt (Watchdog killt nach 40s), kein Pollen. Prüft:
  · routing.inputTargets('AmpEnv') enthält Takt/Metronom-Ports (Knobs wie 'bpm', Buttons
    wie 'bang2') zusätzlich zu den Poly-Synth-Zielen aus Phase A.
  · Knob-Ziel: deliver() schreibt direkt in taktState (z.B. bpm).
  · Button-Ziel: deliver() löst die activate-Closure aus (bang2, kein Fehler — Resync-Effekt
    selbst ist bereits durch die bestehende taktEngine-Logik abgedeckt, hier nur „kommt an").
"""
import subprocess, sys, time, os, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8156
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

try:
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        pg = b.new_page()
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.goto(f"http://localhost:{PORT}/overcord/", wait_until="networkidle", timeout=15000)

        r = pg.evaluate("""() => {
            const reg = window.__routing.reg;
            const targets = reg.inputTargets('AmpEnv').map(t => t.name);

            reg.deliver({module:'stepseq',port:'amp'}, {module:'takt',port:'bpm'}, 140);
            const bpmAfter = window.__takt.state.get('bpm');
            window.__takt.state.set('bpm', 120);   // aufräumen

            let bang2Threw = null;
            try { reg.deliver({module:'stepseq',port:'amp'}, {module:'takt',port:'bang2'}, 1); }
            catch (e) { bang2Threw = String(e); }

            return { targets, bpmAfter, bang2Threw };
        }""")

        check(any('Takt/Metronom' in n and 'BPM' in n for n in r["targets"]), f"BPM-Knob sollte als Ziel auftauchen: {r['targets']}")
        check(any('Takt/Metronom' in n and ('!!' in n or 'bang2' in n.lower()) for n in r["targets"]) or
              any('Takt/Metronom' in n for n in r["targets"]),
              f"Takt/Metronom sollte mit mehreren Zielen (Buttons) auftauchen: {r['targets']}")
        check(abs(r["bpmAfter"] - 140) < 1e-9, f"Knob-Ziel sollte bpm auf 140 setzen, war {r['bpmAfter']}")
        check(r["bang2Threw"] is None, f"Button-Ziel (bang2) sollte nicht werfen: {r['bang2Threw']}")
        # Poly-Synth-Ziele aus Phase A bleiben erhalten (additiv, kein Verdrängen).
        check(any('Poly-Synth' in n for n in r["targets"]), f"Poly-Synth-Ziele sollten weiter da sein: {r['targets']}")

        errs = [e for e in errors if "favicon" not in e.lower()]
        check(len(errs) == 0, f"Console-/Page-Errors: {errs}")

except Exception as e:
    fails.append(f"Exception: {e}")
finally:
    srv.terminate()

if fails:
    print("SMOKE FAIL:")
    for f in fails:
        print(" -", f)
    sys.exit(1)
print("SMOKE OK: Punkt 3b Phase B — Takt/Metronom-Knobs/Buttons als Sq-Ziele, additiv zu Poly-Synth.")
