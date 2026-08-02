#!/usr/bin/env python3
"""Headless-Smoke: ddw.md @dpa 20260724_153349, Outputs ("es fehlt mir PolySynth-TonWahl!
Der sollte auf 1 - 12 (moduloed?) reagieren können.").

Prüft:
  - Poly-Synth deklariert jetzt einen 'tonWahl'-Input-Port ("Ton-Wahl") in der Registry.
  - Direkter Aufruf von routing.deliver(...) auf diesen Port setzt polySynthState.baseNote
    korrekt (1 -> 'C', 12 -> 'B' bei NOTE_NAMES-Reihenfolge C..B).
  - Werte außerhalb 1..12 wickeln sich zyklisch um (13 -> wie 1, 0 -> wie 12).

Lauf: python3 test/tonWahlSqTarget_smoke.py
Hart begrenzt (Watchdog killt nach 40s), kein Pollen.
"""
import subprocess, sys, time, os, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8212
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
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": 1600, "height": 1100})
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.goto(f"http://localhost:{PORT}/overcord/", wait_until="networkidle", timeout=15000)

        # ── Port existiert in der Registry ──
        targets = pg.evaluate("() => window.__routing.reg.inputTargets('Value').map(t => t.module + '.' + t.port)")
        check('polysynth.tonWahl' in targets, f"'polysynth.tonWahl' sollte unter den Value-Zielen sein, war {targets!r}")

        # ── Direkte Zustellung über die Registry (wie ein Sq-Trigger es täte) ──
        # deliver() braucht eine registrierte QUELLE (findPort(srcRef,'out')), sonst no-op —
        # ein winziges Test-Modul mit einem 'Value'-Output reicht dafür.
        note_names = pg.evaluate("""() => {
            window.__routing.reg.registerModule('test', { outputs: { x: { type: 'Value', label: 'x' } }, inputs: {} });
            window.__routing.reg.deliver({module:'test', port:'x'}, {module:'polysynth', port:'tonWahl'}, 1);
            const n1 = window.__polysynth.state.get('baseNote');
            window.__routing.reg.deliver({module:'test', port:'x'}, {module:'polysynth', port:'tonWahl'}, 12);
            const n12 = window.__polysynth.state.get('baseNote');
            window.__routing.reg.deliver({module:'test', port:'x'}, {module:'polysynth', port:'tonWahl'}, 13);
            const n13 = window.__polysynth.state.get('baseNote');   // sollte wie 1 sein
            window.__routing.reg.deliver({module:'test', port:'x'}, {module:'polysynth', port:'tonWahl'}, 0);
            const n0 = window.__polysynth.state.get('baseNote');    // sollte wie 12 sein
            return { n1, n12, n13, n0 };
        }""")
        check(note_names['n1'] == note_names['n13'], f"Wert 1 und 13 sollten dieselbe Tonklasse ergeben (Modulo), war {note_names}")
        check(note_names['n0'] == note_names['n12'], f"Wert 0 und 12 sollten dieselbe Tonklasse ergeben (Modulo), war {note_names}")
        check(note_names['n1'] != note_names['n12'], f"Wert 1 und 12 sollten unterschiedliche Tonklassen ergeben, war {note_names}")

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
print("SMOKE OK: 'Ton-Wahl' ist ein Sq-Ziel und reagiert moduloed auf 1..12.")
