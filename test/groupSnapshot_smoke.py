#!/usr/bin/env python3
"""Headless-Smoke für den Gruppen-Snapshot-Speicher (ddw.md @dpa 20260724: "Gruppen (Combo
und Snapshot)"). Lauf: python3 test/groupSnapshot_smoke.py

Hart begrenzt (Watchdog killt nach 40s), kein Pollen. Testet an der statischen Gruppe
"Transport / Tempo" (bpm-Knob):
  · "Snapshot"-PickMenu-Zeile im Gruppen-Settings-Panel (neben "Combo").
  · saveGroupSnap() merkt den aktuellen bpm-Wert.
  · Wert ändern, dann recallGroupSnap() → alter Wert kommt zurück (State UND ctrlBindings-UI).
  · Ein reiner Optik-Key (ctrlStyles) landet NICHT im Snapshot (Trennung Combo/Snapshot).
"""
import subprocess, sys, time, os, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8151
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

        check(pg.evaluate("() => typeof window.__takt.host.saveGroupSnap === 'function'"), "host.saveGroupSnap fehlt")

        group = pg.locator('.group[data-group="Transport / Tempo"]').first
        group.locator('.group-title-bar').click(button="right")
        gset = pg.locator('.group-settings:visible')
        pm_btns = gset.locator('.pickmenu .pm-btn')
        check(pm_btns.count() == 2, f"erwartet 2 PickMenu-Knöpfe (Combo+Snapshot), gefunden {pm_btns.count()}")
        gset.locator('.kme-close').click()

        # ── bpm merken, ändern, Snapshot speichern ──
        bpm0 = pg.evaluate("() => window.__takt.state.get('bpm')")
        list_len = pg.evaluate("() => window.__takt.host.saveGroupSnap('Transport / Tempo', 'Mein Snap').length")
        check(list_len == 1, f"saveGroupSnap sollte 1 Eintrag liefern, war {list_len}")
        snap = pg.evaluate("() => (window.__takt.state.get('groupSnaps')||{})['Transport / Tempo'][0]")
        check(snap['values'].get('bpm') == bpm0, f"Snapshot sollte bpm={bpm0} enthalten: {snap['values']!r}")
        check('ctrlStyles' not in snap and 'knobMeta' not in snap, "Snapshot sollte KEINE Optik-Keys enthalten (Combo/Snapshot-Trennung)")

        pg.evaluate("() => window.__takt.state.set('bpm', 199)")
        after_change = pg.evaluate("() => window.__takt.state.get('bpm')")
        check(after_change == 199, f"bpm sollte jetzt 199 sein, war {after_change}")

        ok = pg.evaluate("() => window.__takt.host.recallGroupSnap('Transport / Tempo', 0)")
        check(ok is True, "recallGroupSnap sollte true liefern")
        after_recall = pg.evaluate("() => window.__takt.state.get('bpm')")
        check(after_recall == bpm0, f"Recall sollte bpm auf {bpm0} zurückholen, war {after_recall}")

        # ── Aufräumen ──
        pg.evaluate("() => window.__takt.host.deleteGroupSnap('Transport / Tempo', 0)")
        pool = pg.evaluate("() => (window.__takt.state.get('groupSnaps')||{})['Transport / Tempo']")
        check(pool == [], f"Pool sollte nach Löschen leer sein, war {pool!r}")

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
print("SMOKE OK: Gruppen-Snapshot (Save/Recall/Delete, Combo/Snapshot-Trennung) an statischer Gruppe.")
