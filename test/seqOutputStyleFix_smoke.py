#!/usr/bin/env python3
"""Headless-Smoke für den Sq-Output-Settings-Feinschliff (ddw.md @dpa 20260724_114012):
  · Label-Pos funktioniert jetzt auch am PickMenu (Typ 'select'), nicht nur bei echten
    <select>-Feldern.
  · Länge (boxSize) unterläuft jetzt den CSS-Boden (.pm-btn min-width:140px) und kann
    wirklich kleiner werden.
  · Größe (Schriftgröße) geht bis 6px runter (Feld-min von 7 auf 6 gesenkt).
Lauf: python3 test/seqOutputStyleFix_smoke.py

Hart begrenzt (Watchdog killt nach 40s), kein Pollen.
"""
import subprocess, sys, time, os, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8166
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
        pm = group.locator('.pickmenu[data-ctrl="s:seqOutput_0"]')
        pm_btn = pm.locator('.pm-btn')
        pm_btn.click(button="right")
        panel = pg.locator('.elem-settings:visible')
        check(panel.count() == 1, f"Settings-Panel öffnet nicht, count={panel.count()}")

        # ── Label-Pos ──
        lp = panel.locator('.kme-row[data-f="labelPos"] select')
        lp.select_option("left")
        time.sleep(0.05)
        cls = pg.evaluate("() => document.querySelector('.pickmenu[data-ctrl=\"s:seqOutput_0\"]').className")
        check("sel-label-left" in cls, f"pickmenu sollte 'sel-label-left' tragen, war {cls!r}")
        flex_dir = pg.evaluate("() => getComputedStyle(document.querySelector('.pickmenu[data-ctrl=\"s:seqOutput_0\"]')).flexDirection")
        check(flex_dir == "row", f"flex-direction sollte 'row' sein bei labelPos=left, war {flex_dir!r}")

        # ── Länge (boxSize) unter 140px ──
        boxsize = panel.locator('.kme-row[data-f="boxSize"] .es-boxsize')
        boxsize.fill("60")
        boxsize.dispatch_event("input")
        time.sleep(0.05)
        w = pg.evaluate("() => document.querySelector('.pickmenu[data-ctrl=\"s:seqOutput_0\"] .pm-btn').getBoundingClientRect().width")
        check(w <= 65, f"Breite sollte jetzt ~60px sein (nicht mehr am 140px-Boden hängen), war {w}")

        # ── Größe bis 6 ──
        size_in = panel.locator('.kme-row[data-f="size"] .es-size')
        check(size_in.get_attribute("min") == "6", f"Größe-Feld sollte min='6' haben, war {size_in.get_attribute('min')!r}")
        size_in.fill("6")
        size_in.dispatch_event("input")
        time.sleep(0.05)
        fs = pg.evaluate("() => getComputedStyle(document.querySelector('.pickmenu[data-ctrl=\"s:seqOutput_0\"] .pm-btn')).fontSize")
        check(fs == "6px", f"font-size sollte 6px sein, war {fs!r}")

        panel.locator('.kme-close').click()

        # ── Aufräumen ──
        pg.evaluate("""() => {
            const s = window.__stepseq.state;
            const cur = { ...(s.get('ctrlStyles') || {}) };
            delete cur['s:seqOutput_0'];
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
print("SMOKE OK: Sq-Output-Settings — Label-Pos, Länge (unter 140px) und Größe (bis 6px) funktionieren.")
