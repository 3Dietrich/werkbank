#!/usr/bin/env python3
"""Headless-Smoke für Punkt 3 (ddw.md Z.875): 'top Layer'-Feld in ElementSettings.
Lauf: python3 test/layerTop_smoke.py

Hart begrenzt (Watchdog killt nach 40s), kein Pollen — wie test/phase4a_seqsync_smoke.py.
Prüft NUR das cross-cutting Feld selbst (nicht die ganze Settings-UI):

  · Rechtsklick auf ein beliebiges Control öffnet die Settings, 'Oben'-Checkbox ist da (JEDER Typ).
  · Ankreuzen → Wrapper-Element bekommt sofort z-index 6 (live, wie jedes andere Feld).
  · Persistiert in ctrlStyles[id].layerTop; Panel schließen/neu öffnen zeigt den Haken wieder an.
  · Abwählen → z-index wieder leer.
"""
import subprocess, sys, time, os, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8146
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
        pg = b.new_page(viewport={"width": 1600, "height": 1000})
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.goto(f"http://localhost:{PORT}/", wait_until="networkidle", timeout=15000)

        # Gezielt ein Select/Toggle/Button-Control (nicht 'k:' Knob — der hat sein EIGENES
        # Meta-Editor-Panel, keins der ElementSettings).
        ctrl = pg.locator('[data-ctrl^="s:"], [data-ctrl^="t:"], [data-ctrl^="b:"]').first
        check(ctrl.count() > 0, "kein passendes Select/Toggle/Button-[data-ctrl]-Element gefunden")
        ctrl.scroll_into_view_if_needed()
        ctrl_id = ctrl.get_attribute('data-ctrl')

        ctrl.click(button="right")
        # Mehrere GroupHost-Instanzen (eins pro Instrument) erzeugen je ein eigenes
        # ElementSettings-Panel im DOM — nur eins ist gerade sichtbar (display:block).
        panel = pg.locator('.elem-settings:visible')
        check(panel.count() == 1, f"erwartet genau 1 sichtbares Element-Settings-Panel, gefunden: {panel.count()}")

        layertop = panel.locator('.es-layertop')
        check(layertop.count() == 1, "Oben-Checkbox (.es-layertop) fehlt im Panel")
        row = panel.locator('.kme-row[data-f="layerTop"]')
        check(row.is_visible(), "layerTop-Zeile ist nicht sichtbar")
        check(not layertop.is_checked(), f"layerTop sollte initial aus sein für {ctrl_id}")

        layertop.check()
        time.sleep(0.05)
        z = pg.evaluate("(id) => document.querySelector(`[data-ctrl='${id}']`).style.zIndex", ctrl_id)
        check(z == '6', f"z-index sollte nach Ankreuzen 6 sein, war {z!r}")

        panel.locator('.kme-close').click()
        check(not panel.is_visible(), "Panel schließt nicht")

        ctrl.click(button="right")
        check(panel.locator('.es-layertop').is_checked(), "Haken bleibt nach Schließen/Neuöffnen nicht gesetzt (Persistenz)")

        panel.locator('.es-layertop').uncheck()
        time.sleep(0.05)
        z2 = pg.evaluate("(id) => document.querySelector(`[data-ctrl='${id}']`).style.zIndex", ctrl_id)
        check(z2 == '', f"z-index sollte nach Abwählen wieder leer sein, war {z2!r}")

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
print("SMOKE OK: 'top Layer'-Feld (Punkt 3) — sichtbar für jeden Typ, live z-index, persistiert.")
