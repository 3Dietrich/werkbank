#!/usr/bin/env python3
"""Headless-Smoke: die Hilfstexte (Hover-Hints) übersetzen sich mit der Sprache mit
(ddw.md @dpa 20260724_153349: "De/En: die Hilfstexte auch! vorallem!").

Prüft:
  - HintBubble-Hover über einen data-ctrl-Control (Takt-Toggle "aktiv") zeigt Deutsch,
    nach Sprachwechsel auf English sofort die englische Fassung — ohne Reload.
  - factoryHint() liest bei Step-Sequenzer-Klonen trotz Index-Suffix (t:seqEnabled_0)
    den Basis-Eintrag (Regression-Schutz für den Suffix-Strip-Fix in lib/hints.js).
  - Das Tab/Tempo-Sonderfenster (GroupHost.js makeSpecial, layout:'table') übersetzt
    Label- UND Hilfstext-Spalte live mit (vorher komplett am i18n-System vorbei).

Lauf: python3 test/hintTranslation_smoke.py
Hart begrenzt (Watchdog killt nach 40s), kein Pollen.
"""
import subprocess, sys, time, os, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8196
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

        # ── Hover-Hint eines data-ctrl-Controls: Metronom-Toggle "aktiv" (t:metroOn) — hatte
        # VORHER ueberhaupt keinen Hilfetext-EN-Eintrag (nur den rohen deutschen Titel). ──
        metro_on = pg.locator('[data-ctrl="t:metroOn"]').first
        check(metro_on.count() >= 1, "t:metroOn-Control nicht gefunden")
        box = metro_on.bounding_box()
        pg.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
        time.sleep(0.6)
        hint_de = pg.evaluate("() => { const b = document.querySelector('.hint-bubble'); return b ? b.textContent : 'NOTFOUND'; }")
        check("Metronom-Klick an/aus" in hint_de, f"Deutscher Hilfetext fuer metroOn fehlt, war {hint_de!r}")
        pg.mouse.move(10, 10)
        time.sleep(0.1)

        # ── Sprache auf English (⚙-Fenster, lib/SettingsWindow.js: Menü statt Knopfpaar) ──
        pg.locator('#cfgmenu').click()
        panel = pg.locator('.sw-window:visible')
        panel.locator('.sw-select').select_option('en')
        time.sleep(0.1)
        panel.locator('.sw-close').click()

        pg.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
        time.sleep(0.6)
        hint_en = pg.evaluate("() => { const b = document.querySelector('.hint-bubble'); return b ? b.textContent : 'NOTFOUND'; }")
        check("Metronome click on/off" in hint_en, f"Englischer Hilfetext fuer metroOn fehlt, war {hint_en!r}")
        pg.mouse.move(10, 10)
        time.sleep(0.1)

        # ── Sq-Klon-Suffix (t:seqEnabled_0): Hover zeigt den Basis-Hilfetext trotz Suffix. ──
        seq_enabled = pg.locator('[data-ctrl^="t:seqEnabled"]').first
        check(seq_enabled.count() >= 1, "t:seqEnabled_*-Control nicht gefunden")
        sbox = seq_enabled.bounding_box()
        pg.mouse.move(sbox["x"] + sbox["width"] / 2, sbox["y"] + sbox["height"] / 2)
        time.sleep(0.6)
        seq_hint_en = pg.evaluate("() => { const b = document.querySelector('.hint-bubble'); return b ? b.textContent : 'NOTFOUND'; }")
        check("Armed" in seq_hint_en, f"Sq-Klon-Hilfetext (Suffix-Strip) fehlt, war {seq_hint_en!r}")
        pg.mouse.move(10, 10)
        time.sleep(0.1)

        # ── Tab/Tempo-Sonderfenster: Label- und Hilfstext-Spalte auf English. ──
        pg.locator('.special-open').first.click()
        time.sleep(0.2)
        table_txt = pg.evaluate("() => document.querySelector('.special-pop-table')?.textContent || 'NOTFOUND'")
        check("max. BPM" in table_txt, f"Special-Table-Label sollte uebersetzt sein (EN='max. BPM'), war Ausschnitt {table_txt[:200]!r}")
        check("Upper limit for tapping" in table_txt, f"Special-Table-Hilfstext sollte uebersetzt sein, war Ausschnitt {table_txt[:400]!r}")

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
print("SMOKE OK: Hilfstexte (Hover + Sonderfenster) uebersetzen sich mit der Sprache, Sq-Klon-Suffix wird korrekt aufgeloest.")
