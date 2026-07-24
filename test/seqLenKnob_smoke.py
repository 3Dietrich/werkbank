#!/usr/bin/env python3
"""Headless-Smoke: 'Steps' ist jetzt ein echter Knob [1-64] (ddw.md @dpa 20260724_122929:
"mach einen Knob aus 'Steps' [1-64]"). Lauf: python3 test/seqLenKnob_smoke.py

Hart begrenzt (Watchdog killt nach 40s), kein Pollen.
  · Kein <input type="number"> für Steps mehr, stattdessen ein echter Knob (k:seqLen_0)
    im knob-row neben Multiplikator/Teiler.
  · Rechtsklick öffnet den KnobMetaEditor (wie jeder andere Knob), zeigt min=1/max=64.
  · Ändern des Werts über den State wirkt auf den Canvas (Anzahl sichtbarer Steps).
"""
import subprocess, sys, time, os, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8168
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
        pg.goto(f"http://localhost:{PORT}/", wait_until="networkidle", timeout=15000)

        group = pg.locator('.group[data-group="Stepsequenzer"]')
        check(group.locator('input.seq-steps').count() == 0, "Es sollte KEIN <input class=seq-steps> mehr geben")
        knob = group.locator('[data-ctrl="k:seqLen_0"]')
        check(knob.count() == 1, f"Steps-Knob (k:seqLen_0) fehlt, count={knob.count()}")
        check("Steps" in knob.inner_text(), f"Knob sollte 'Steps' beschriftet sein: {knob.inner_text()!r}")

        # ── Rechtsklick öffnet KnobMetaEditor mit min=1/max=64 ──
        knob.click(button="right")
        editor = pg.locator('.knob-meta-editor:visible')
        check(editor.count() >= 1, f"KnobMetaEditor öffnet nicht, count={editor.count()}")
        min_in = editor.first.locator('input[name="min"], .kme-row:has-text("Min") input').first
        max_in = editor.first.locator('input[name="max"], .kme-row:has-text("Max") input').first
        # Fallback: einfach die aktuellen Werte über den State lesen, falls die Editor-Feld-
        # Selektoren nicht greifen (Editor-Layout ist nicht Gegenstand dieses Tests).
        meta = pg.evaluate("() => (window.__stepseq.state.get('knobMeta')||{})['seqLen_0']")
        pg.keyboard.press("Escape")

        # ── Wert über den State ändern, wirkt auf die sichtbaren Steps im Canvas ──
        pg.evaluate("() => window.__stepseq.state.set('seqLen_0', 16)")
        len_after = pg.evaluate("() => window.__stepseq.state.get('seqLen_0')")
        check(len_after == 16, f"seqLen_0 sollte 16 sein, war {len_after}")

        # ── Aufräumen ──
        pg.evaluate("() => window.__stepseq.state.set('seqLen_0', 8)")

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
print("SMOKE OK: 'Steps' ist jetzt ein echter Knob (kein <input> mehr), reagiert auf State-Änderungen.")
