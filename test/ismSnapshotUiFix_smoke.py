#!/usr/bin/env python3
"""Regressions-Smoke für den ISM-Snapshot-Feinschliff (ddw.md @dpa 20260724_114012):
  · Label ist EINMAL "Snap" (kein doppeltes "Snapshot SNAPSHOOT", kein eigenes .pm-label
    mehr innerhalb der PickMenu — die kme-row liefert das Label schon).
  · "+ Neu" speichert über den ECHTEN Klickpfad (derselbe _outside/_onKey-Bugfix wie bei
    Gruppen-Combo/-Snapshot, hier in MiniSettings.js statt GroupHost.js).
Lauf: python3 test/ismSnapshotUiFix_smoke.py

Hart begrenzt (Watchdog killt nach 40s), kein Pollen.
"""
import subprocess, sys, time, os, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8157
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
        pg.on("dialog", lambda d: d.accept("UI-ISM-Test"))
        pg.goto(f"http://localhost:{PORT}/", wait_until="networkidle", timeout=15000)

        h2 = pg.locator('#bench-polysynth > h2')
        h2.click(button="right")
        panel = pg.locator('.knob-meta-editor.mini-settings:visible')
        check(panel.count() == 1, f"Instrument-Settings öffnen nicht, count={panel.count()}")

        # ── Label EINMAL "Snap", kein internes .pm-label mehr ──
        row = panel.locator('.kme-row:has(.pickmenu)')
        row_label_text = row.locator('label').inner_text()
        check(row_label_text.strip() == 'Snap', f"Zeilen-Label sollte 'Snap' sein, war {row_label_text!r}")
        pm_label = row.locator('.pm-label')
        check(pm_label.count() == 0, f"PickMenu sollte KEIN eigenes .pm-label mehr haben, gefunden={pm_label.count()}")

        # ── "+ Neu" über den echten Klickpfad ──
        snap_btn = row.locator('.pm-btn')
        snap_btn.click()
        pop = pg.locator('.pm-pop:visible')
        check(pop.count() == 1, f"Snapshot-Dropdown öffnet nicht, count={pop.count()}")
        pop.locator('.pm-foot-btn').click()

        check(panel.count() == 1 and panel.is_visible(), "Instrument-Settings-Panel sollte NACH '+ Neu' noch offen sein (Bugfix)")
        list_names = pg.evaluate("() => (window.__polysynth.state.get('ismSnaps')||[]).map(s => s.name)")
        check('UI-ISM-Test' in list_names, f"'UI-ISM-Test' sollte in ismSnaps stehen (echter Klickpfad): {list_names!r}")

        panel.locator('.kme-close').click()

        # ── Aufräumen ──
        pg.evaluate("""() => {
            const s = window.__polysynth.state;
            s.set('ismSnaps', (s.get('ismSnaps')||[]).filter(it => it.name !== 'UI-ISM-Test'));
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
print("SMOKE OK: ISM-Snapshot-Label ist 'Snap' (kein Duplikat), '+ Neu' speichert über echten Klickpfad.")
