#!/usr/bin/env python3
"""Headless-Smoke für dd.md 20260802 (overcord, "DSR" = eine umbenannte Multi-ADSR-Klon-
Gruppe): "den Out select verstecken wollen - ging, aber dann ging die settings von DSR
nicht mehr auf. reload: Out wieder auf dem Panel (falsch), settings gehen noch immer nicht".

Zwei Bugs in lib/group/GroupHost.js, beide an derselben Stelle: Multi-ADSRs "Out"-Ziel
(adsrOutput, ein PickMenu) wird SPÄTER als der Rest der Gruppe per registerCtrlStyle()
angemeldet (multiEnv.js buildEnv(): erst host.addGroup(), danach erst der PickMenu/
registerCtrlStyle()-Aufruf für "Out").

1) applyOffPanel() lief zu diesem Zeitpunkt schon durch (innerhalb von addGroup()) und
   kennt "Out" darum noch nicht -> die ausgeblendet-Flagge wird nie auf das Element
   angewendet -> nach jedem Reload steht "Out" wieder auf dem Panel.
2) renderOffPanelList()/makeOffPanelRow() ging für ALLE 's:'-Controls von einem Eintrag in
   den statischen SELECTS-defs aus. "Out" ist dort nie eingetragen (dynamisches PickMenu,
   keine defs.SELECTS-Zeile) -> `cfg.label` auf undefined warf eine TypeError, die das
   GESAMTE Settings-Popup der Gruppe abbrach, bevor es sichtbar wurde.

Fix: registerCtrlStyle() wendet die ctrlOffPanel-Flagge direkt bei der eigenen
Registrierung an (statt nur auf einen schon gelaufenen applyOffPanel()-Durchlauf zu
hoffen); makeOffPanelRow() fällt für 's:'/'g:'-Controls ohne SELECTS/SEGMENTS-Eintrag auf
eine Label+Rohwert-Zeile zurück statt zu crashen.

Lauf: python3 test/adsrOutOffPanel_smoke.py
Hart begrenzt (Watchdog killt nach 40s), kein Pollen.
"""
import subprocess, sys, time, os, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8160
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
        pg.goto(f"http://localhost:{PORT}/overcord/", wait_until="networkidle", timeout=15000)

        # "Out" der ersten ADSR-Instanz (data-ctrl="s:adsrOutput_0") als ausgeblendet markieren —
        # simuliert den Rechtsklick-Weg (elemSettings.onOffPanel), ohne die UI-Klicks selbst
        # nachzustellen (die Persistenz-Semantik ist identisch: ctrlOffPanel-State-Key).
        pg.evaluate("""() => {
            const st = window.__polysynth.state;
            st.set('ctrlOffPanel', { ...(st.get('ctrlOffPanel') || {}), 's:adsrOutput_0': true });
        }""")

        # Reload -> Bug 1 (Reihenfolge registerCtrlStyle vs. applyOffPanel): "Out" muss
        # ausgeblendet BLEIBEN, nicht wieder auf dem Panel auftauchen.
        pg.reload(wait_until="networkidle", timeout=15000)
        out_el = pg.locator('[data-group="ADSR"] [data-ctrl="s:adsrOutput_0"]').first
        check(out_el.count() > 0, "Out-Control (s:adsrOutput_0) nicht gefunden — Selektor/Struktur geändert?")
        cls = out_el.get_attribute('class') or ''
        check('ctrl-offpanel' in cls, f"Out sollte nach Reload weiter ausgeblendet sein (Klasse 'ctrl-offpanel'), war: {cls!r}")

        # Bug 2: Gruppen-Settings müssen trotz ausgeblendetem "Out" öffnen (kein Crash mitten
        # im Aufbau von renderOffPanelList()/makeOffPanelRow()).
        group = pg.locator('.group[data-group="ADSR"]').first
        group.scroll_into_view_if_needed()
        group.locator('.group-title-bar').click(button="right")
        gset = pg.locator('.group-settings:visible')
        check(gset.count() > 0, "Gruppen-Settings-Popup ist nach dem Rechtsklick nicht sichtbar (Crash beim Aufbau?)")

        # Die Off-Panel-Liste soll "Out" als Zeile zeigen (Label + Rohwert), nicht crashen.
        off_head = gset.get_by_text('Nicht auf dem Panel')
        check(off_head.count() > 0, "Off-Panel-Liste ('Nicht auf dem Panel') fehlt im Settings-Popup")
        gset.locator('.kme-close').click()

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
print("SMOKE OK: Multi-ADSR 'Out' bleibt nach Reload ausgeblendet, Gruppen-Settings öffnen trotzdem ohne Crash.")
