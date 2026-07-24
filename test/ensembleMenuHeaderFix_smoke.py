#!/usr/bin/env python3
"""Regressions-Smoke für den Ensemble-Menü-Feinschliff (ddw.md @dpa 20260724_114012:
"es sollte auch über rechte Maus (select-)settings haben" · "es soll rechts neben Werkbank
sein"). Lauf: python3 test/ensembleMenuHeaderFix_smoke.py

Hart begrenzt (Watchdog killt nach 40s), kein Pollen.
  · Das Menü sitzt im .topbar DIREKT nach dem <h1>Werkbank</h1>, NICHT in .topbar-right.
  · Rechtsklick öffnet ein echtes Element-Settings-Panel (Typ 'select', wie
    wireHeaderBtnSettings es für die anderen Header-Knöpfe schon tut) statt nur die
    PickMenu-Liste zu öffnen (noContextOpen).
  · Eine gesetzte Hintergrundfarbe wirkt auf den .pm-btn und übersteht Reload
    (ctrlStyles['hdr:ensemble']).
"""
import subprocess, sys, time, os, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8158
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

        # ── Position: direkt nach dem <h1>, NICHT in .topbar-right ──
        in_right = pg.evaluate("() => !!document.querySelector('.topbar-right [data-ctrl=\"hdr:ensemble\"]')")
        check(not in_right, "Ensemble-Menü sollte NICHT mehr in .topbar-right sitzen")
        right_after_h1 = pg.evaluate("""() => {
            const h1 = document.querySelector('.topbar h1');
            const next = h1.nextElementSibling;
            return !!(next && next.dataset && next.dataset.ctrl === 'hdr:ensemble');
        }""")
        check(right_after_h1, "Ensemble-Menü sollte direkt auf <h1>Werkbank</h1> folgen")

        # ── Rechtsklick öffnet Element-Settings (nicht die PickMenu-Liste) ──
        menu = pg.locator('[data-ctrl="hdr:ensemble"]')
        menu.click(button="right")
        pop = pg.locator('.pm-pop:visible')
        check(pop.count() == 0, "Rechtsklick sollte NICHT die PickMenu-Liste öffnen (noContextOpen)")
        settings = pg.locator('.knob-meta-editor:visible').filter(has_not=pg.locator('.mini-settings'))
        check(settings.count() >= 1, f"Element-Settings-Panel sollte sich öffnen, count={settings.count()}")
        bg_input = settings.first.locator('.kme-row[data-f="bg0"] input[type="color"]')
        check(bg_input.count() == 1, "BG0-Farbfeld sollte im Ensemble-Settings-Panel stehen (Typ 'select')")
        bg_input.fill("#3355ff")
        bg_input.dispatch_event("input")
        settings.first.locator('.kme-close').click()

        bg_after = pg.evaluate("() => getComputedStyle(document.querySelector('[data-ctrl=\"hdr:ensemble\"] .pm-btn')).backgroundColor")
        check("51, 85, 255" in bg_after, f"pm-btn sollte die neue Farbe zeigen, war {bg_after!r}")

        pg.reload(wait_until="networkidle")
        bg_after2 = pg.evaluate("() => getComputedStyle(document.querySelector('[data-ctrl=\"hdr:ensemble\"] .pm-btn')).backgroundColor")
        check("51, 85, 255" in bg_after2, f"Farbe sollte den Reload überstehen, war {bg_after2!r}")

        # ── Aufräumen ──
        pg.evaluate("""() => {
            // ctrlStyles['hdr:ensemble'] liegt im globalen Haupt-State (werkbank_state), nicht
            // in window.__ensemble.state (das ist der separate Ensemble-Snapshot-Store).
            const st = JSON.parse(localStorage.getItem('werkbank_state') || '{}');
            if (st.ctrlStyles) { delete st.ctrlStyles['hdr:ensemble']; localStorage.setItem('werkbank_state', JSON.stringify(st)); }
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
print("SMOKE OK: Ensemble-Menü sitzt neben 'Werkbank', hat echte Rechtsklick-Settings (Farbe persistiert).")
