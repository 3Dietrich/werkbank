#!/usr/bin/env python3
"""Regressions-Smoke für den ECHTEN UI-Klickpfad des Gruppen-Combo/-Snapshot-„+ Neu"-Knopfs
(ddw.md @dpa 20260724_114012: "sie speichern nicht, sie klappen (samt den Settings) zu -
danach ist noch leer"). Lauf: python3 test/groupComboUiSave_smoke.py

Root Cause (gefixt in GroupHost.js _outsideClose): die Combo-/Snapshot-PickMenus hängen
ihr Dropdown (.pm-pop) an <body>, NICHT im .group-settings-Panel. Ohne Ausnahme für
.pm-pop schloss ein Klick auf "+ Neu" schon auf MOUSEDOWN das ganze Panel (inkl. der
PickMenu selbst), bevor der eigentliche Klick (der fn() auslöst) das Element überhaupt
noch erreichte — der bisherige Playwright-Test (groupCombo_smoke.py) hat das NICHT
gefangen, weil er saveGroupCombo() direkt aufrief statt über echte Klicks.

Hart begrenzt (Watchdog killt nach 40s), kein Pollen.
"""
import subprocess, sys, time, os, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8156
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
        pg.on("dialog", lambda d: d.accept("UI-Combo-Test"))
        pg.goto(f"http://localhost:{PORT}/", wait_until="networkidle", timeout=15000)

        group = pg.locator('.group[data-group="Transport / Tempo"]').first
        group.locator('.group-title-bar').click(button="right")
        gset = pg.locator('.group-settings:visible')
        check(gset.count() == 1, f"Gruppen-Settings öffnen nicht, count={gset.count()}")

        # ── Combo-PickMenu öffnen (erste .pm-btn im Panel), dann "+ Neu" klicken ──
        combo_btn = gset.locator('.pickmenu .pm-btn').first
        combo_btn.click()
        pop = pg.locator('.pm-pop:visible')
        check(pop.count() == 1, f"Combo-Dropdown öffnet nicht, count={pop.count()}")
        foot_new = pop.locator('.pm-foot-btn')
        foot_new.click()   # löst prompt() aus, dialog-handler bestätigt mit "UI-Combo-Test"

        # ── Das GANZE Gruppen-Settings-Panel muss noch offen sein (nur das Dropdown schließt) ──
        check(gset.count() == 1 and gset.is_visible(), "Gruppen-Settings-Panel sollte NACH '+ Neu' noch offen sein (Bugfix)")

        # ── Der Eintrag muss WIRKLICH gespeichert worden sein ──
        pool = pg.evaluate("() => (window.__takt.state.get('groupCombos')||{})['Transport / Tempo']")
        names = [it['name'] for it in (pool or [])]
        check('UI-Combo-Test' in names, f"'UI-Combo-Test' sollte im Pool stehen (echter Klickpfad): {names!r}")

        gset.locator('.kme-close').click()

        # ── Aufräumen ──
        pg.evaluate("""() => {
            const s = window.__takt.state;
            const all = { ...(s.get('groupCombos')||{}) };
            all['Transport / Tempo'] = (all['Transport / Tempo']||[]).filter(it => it.name !== 'UI-Combo-Test');
            s.set('groupCombos', all);
            const sel = { ...(s.get('groupComboSel')||{}) };
            if (sel['Transport / Tempo'] === 'UI-Combo-Test') { delete sel['Transport / Tempo']; s.set('groupComboSel', sel); }
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
print("SMOKE OK: '+ Neu' im Gruppen-Combo-PickMenu speichert wirklich (Panel bleibt offen, Eintrag landet im Pool).")
