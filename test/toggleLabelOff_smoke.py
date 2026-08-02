#!/usr/bin/env python3
"""Headless-Smoke: Toggle Label-Pos='Ohne' versteckt das Label wirklich (ddw.md @dpa
20260724_122929: "toggle controls zeigen [Label-Pos = ohne] die Labels fälschlicherweise
noch rechts an"). Lauf: python3 test/toggleLabelOff_smoke.py

Hart begrenzt (Watchdog killt nach 40s), kein Pollen. GroupHost.makeToggle() setzte die
Klasse 'tgl-label-off' schon korrekt — es fehlte nur die CSS-Ausblend-Regel dafür
(anders als bei .select-field.sel-label-off).
"""
import subprocess, sys, time, os, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8169
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

        # Stepsequenzer "An"-Toggle als Testkandidat.
        toggle = pg.locator('.group[data-group="Stepsequenzer"] .toggle-field')
        toggle.click(button="right")
        panel = pg.locator('.elem-settings:visible')
        check(panel.count() == 1, f"Settings-Panel öffnet nicht, count={panel.count()}")

        lp = panel.locator('.kme-row[data-f="labelPos"] select')
        lp.select_option("off")
        time.sleep(0.05)

        span = toggle.locator('span')
        check(not span.is_visible(), "Toggle-Label sollte bei Label-Pos='Ohne' verschwinden")

        # ── zurück auf Standard, aufräumen ──
        lp.select_option("right")
        time.sleep(0.05)
        check(span.is_visible(), "Toggle-Label sollte bei Label-Pos='Rechts' wieder sichtbar sein")
        panel.locator('.kme-close').click()
        pg.evaluate("""() => {
            const s = window.__stepseq.state;
            const cur = { ...(s.get('ctrlStyles') || {}) };
            delete cur['t:seqEnabled_0'];
            s.set('ctrlStyles', cur);
        }""")

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
print("SMOKE OK: Toggle Label-Pos='Ohne' versteckt das Label jetzt wirklich.")
