#!/usr/bin/env python3
"""Headless-Smoke: ddw.md @dpa 20260724_153349, PolySynth/Keyboard/R ("nur bei diesem
speziell: Over und kill sollen nach dem click auf einen Speicher automatisch auf Use
zürückgehen").

Prüft:
  - [R] auf 'over' gestellt, ein Slot geklickt (mit gehaltenem Akkord) → Slot überschrieben
    UND [R] springt automatisch zurück auf 'use' (akReset === 0).
  - [R] auf 'kill' gestellt, ein belegter Slot geklickt → Slot gelöscht UND [R] zurück auf 'use'.
  - Regression: bei 'use' bleibt [R] unverändert (kein Reset-Loop).

Lauf: python3 test/chordMemoryResetToUse_smoke.py
Hart begrenzt (Watchdog killt nach 40s), kein Pollen.
"""
import subprocess, sys, time, os, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8210
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

        # ── 'over': Slot 0 leer, [R] auf over, Akkord "halten" (state direkt simuliert, kein
        # echtes Keyboard-Drücken nötig — snapshotChord() liest PlayKeyboard._active direkt,
        # daher über eine echte Taste). ──
        key0 = pg.locator('.play-keyboard .kb-key').first
        check(key0.count() >= 1, "Keine Keyboard-Taste gefunden")
        kbox = key0.bounding_box()
        pg.mouse.move(kbox["x"] + kbox["width"] / 2, kbox["y"] + kbox["height"] / 2)
        pg.mouse.down()   # Note halten
        time.sleep(0.05)

        pg.evaluate("() => window.__polysynth.state.set('akReset', 1)")  # over
        slot0 = pg.locator('[data-ctrl="u:speicher:0"]').first
        check(slot0.count() >= 1, "Speicher-Slot 0 nicht gefunden")
        sbox = slot0.bounding_box()
        pg.mouse.move(sbox["x"] + sbox["width"] / 2, sbox["y"] + sbox["height"] / 2)
        pg.mouse.down()
        time.sleep(0.1)
        pg.mouse.up()   # Slot-Gate wieder los (falls eins offen ist)

        after_over = pg.evaluate("() => window.__polysynth.state.get('akReset')")
        check(after_over == 0, f"[R] sollte nach 'over'-Klick auf 'use' (0) zurückspringen, war {after_over}")
        mem0 = pg.evaluate("() => window.__polysynth.state.get('akMemory')[0]")
        check(mem0 is not None and len(mem0) > 0, f"Slot 0 sollte durch 'over' belegt sein, war {mem0!r}")

        pg.mouse.up()   # Taste loslassen (falls noch unten)
        time.sleep(0.05)

        # ── 'kill': Slot 0 ist jetzt belegt (aus dem 'over'-Schritt) — [R] auf kill, klicken. ──
        pg.evaluate("() => window.__polysynth.state.set('akReset', 2)")  # kill
        pg.mouse.move(sbox["x"] + sbox["width"] / 2, sbox["y"] + sbox["height"] / 2)
        pg.mouse.down()
        time.sleep(0.1)
        pg.mouse.up()

        after_kill = pg.evaluate("() => window.__polysynth.state.get('akReset')")
        check(after_kill == 0, f"[R] sollte nach 'kill'-Klick auf 'use' (0) zurückspringen, war {after_kill}")
        mem0_after = pg.evaluate("() => window.__polysynth.state.get('akMemory')[0]")
        check(not mem0_after, f"Slot 0 sollte durch 'kill' geleert sein, war {mem0_after!r}")

        # ── Regression: bei 'use' bleibt [R] unverändert nach einem Klick auf einen leeren Slot. ──
        pg.evaluate("() => window.__polysynth.state.set('akReset', 0)")
        slot1 = pg.locator('[data-ctrl="u:speicher:1"]').first
        s1box = slot1.bounding_box()
        pg.mouse.move(s1box["x"] + s1box["width"] / 2, s1box["y"] + s1box["height"] / 2)
        pg.mouse.down()
        time.sleep(0.05)
        pg.mouse.up()
        still_use = pg.evaluate("() => window.__polysynth.state.get('akReset')")
        check(still_use == 0, f"[R] sollte bei 'use' unverändert bleiben (Regression), war {still_use}")

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
print("SMOKE OK: [R] springt nach over/kill-Klick automatisch auf 'use' zurück, 'use' selbst bleibt unangetastet.")
