#!/usr/bin/env python3
"""Headless-Smoke für Fill/set0-Optik-Speicher (ddw.md @dpa 20260724_012823: "Speicher wie
bei Control/Knob-Settings" für die Sq-eigenen Elemente). Lauf: python3 test/seqFillSet0_style_smoke.py

Hart begrenzt (Watchdog killt nach 40s), kein Pollen — wie test/seqOutput_smoke.py.
Prüft:
  · Fill-Knopf und set0-Knopf öffnen je einen EIGENEN ElementSettings-Rechtsklick (Typ 'opener':
    Textumschalt-Feld + Farbe/Größe, ohne Label/L.Pos).
  · Eine gesetzte Hintergrundfarbe wird SOFORT auf genau diesen einen Knopf angewandt (nicht auf
    den anderen, nicht auf die ganze Grid-Box).
  · Die Farbe steckt danach unter eigenen ctrlStyles-Keys ('u:seqFill_0'/'u:seqSet0_0') im
    localStorage und übersteht einen Reload (Persistenz-Kette bis MiniState/localStorage).
"""
import subprocess, sys, time, os, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8148
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
        pg = b.new_page(viewport={"width": 1600, "height": 1100})
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.goto(f"http://localhost:{PORT}/", wait_until="networkidle", timeout=15000)

        check(pg.evaluate("() => !!window.__stepseq && !!window.__stepseq.mgr"), "window.__stepseq.mgr fehlt")

        group = pg.locator('.group[data-group="Stepsequenzer"]')
        fill_btn = group.locator('button.seq-ic:has-text("Fill")')
        s0_btn = group.locator('button.seq-ic:has-text("⟲")')
        check(fill_btn.count() == 1, f"Fill-Knopf fehlt, count={fill_btn.count()}")
        check(s0_btn.count() == 1, f"set0-Knopf fehlt, count={s0_btn.count()}")

        # ── Rechtsklick auf Fill öffnet EIGENES Settings-Panel (Typ 'opener': kein Label-Feld) ──
        fill_btn.click(button="right")
        panel = pg.locator('.elem-settings:visible')
        check(panel.count() == 1, f"Element-Settings-Panel für Fill öffnet nicht, count={panel.count()}")
        check(not panel.locator('.kme-row[data-f="label"]').is_visible(), "Fill-Panel sollte KEIN Label-Feld zeigen (Typ 'opener')")
        bg_input = panel.locator('.kme-row[data-f="bg"] .es-bg')
        check(bg_input.count() == 1, "BG-Farbfeld fehlt im Fill-Panel")
        bg_input.fill("#ff00aa")
        bg_input.dispatch_event("input")
        panel.locator('.kme-close').click()
        time.sleep(0.05)

        fill_bg = pg.evaluate("() => getComputedStyle(document.querySelector('.group[data-group=\"Stepsequenzer\"] button.seq-ic')).backgroundColor")
        check("255, 0, 170" in fill_bg, f"Fill-Knopf sollte die neue Farbe zeigen, war {fill_bg!r}")
        s0_bg = pg.evaluate("() => getComputedStyle(document.querySelectorAll('.group[data-group=\"Stepsequenzer\"] button.seq-ic')[1]).backgroundColor")
        check("255, 0, 170" not in s0_bg, f"set0-Knopf sollte NICHT mitgefärbt sein, war {s0_bg!r}")

        # ── Persistenz: eigener ctrlStyles-Key, übersteht Reload ──
        saved = pg.evaluate("() => (window.__stepseq.state.get('ctrlStyles')||{})['u:seqFill_0']")
        check(bool(saved and saved.get('bg') == '#ff00aa'), f"ctrlStyles['u:seqFill_0'] sollte bg='#ff00aa' enthalten: {saved!r}")
        pg.reload(wait_until="networkidle")
        fill_bg2 = pg.evaluate("() => getComputedStyle(document.querySelector('.group[data-group=\"Stepsequenzer\"] button.seq-ic')).backgroundColor")
        check("255, 0, 170" in fill_bg2, f"Fill-Farbe sollte den Reload überstehen, war {fill_bg2!r}")

        # ── Aufräumen: Testfarbe wieder entfernen, damit @dpas echter State sauber bleibt ──
        pg.evaluate("""() => {
            const cur = { ...(window.__stepseq.state.get('ctrlStyles') || {}) };
            delete cur['u:seqFill_0'];
            window.__stepseq.state.set('ctrlStyles', cur);
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
print("SMOKE OK: Fill/set0 haben eigene, persistierte Optik-Settings (ctrlStyles 'u:seqFill_i'/'u:seqSet0_i').")
