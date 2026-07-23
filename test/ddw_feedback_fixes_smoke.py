#!/usr/bin/env python3
"""Headless-Smoke für das ddw.md-Feedback vom 20260723_210324/230925 (nach dem ersten
Punkt-1/3/4-Durchgang). Lauf: python3 test/ddw_feedback_fixes_smoke.py

Hart begrenzt (Watchdog killt nach 40s), kein Pollen. Prüft die NICHT-Ohr-Fixes:
  · layerTop komplett entfernt (kein 'Oben'-Feld mehr in den Element-Settings).
  · Rechtsklick auf den seqOutput-PickMenu-Wrapper öffnet die normalen select-Element-
    Settings (nicht die Gruppen-Settings) — Rechtsklick auf den .pm-btn selbst öffnet
    weiterhin die PickMenu-Liste (unverändertes Verhalten für alle anderen PickMenus).
  · 'Rec > Clock' taucht NICHT mehr in der Sq-Ziel-Liste auf (keine Range-Metadaten).
  · Step-Grid zeichnet SOFORT neu, auch bei gestopptem Transport.
  · Header-Reset/Struktur sind bei keyMidi registriert (MIDI-/Tasten-Learn).
"""
import subprocess, sys, time, os, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8149
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

        # ── layerTop komplett raus ──
        sel = pg.locator('[data-ctrl^="s:"], [data-ctrl^="t:"]').first
        sel.click(button="right")
        panel = pg.locator('.elem-settings:visible')
        check(panel.count() == 1, "Element-Settings öffnet nicht per Rechtsklick")
        check(panel.locator('.es-layertop').count() == 0, "'Oben'-Feld (.es-layertop) sollte komplett entfernt sein")
        check(panel.locator('.kme-row[data-f="layerTop"]').count() == 0, "layerTop-Zeile sollte komplett entfernt sein")
        panel.locator('.kme-close').click()

        # ── 'Rec > Clock' nicht mehr als Sq-Ziel ──
        targets = pg.evaluate("() => window.__routing.reg.inputTargets('AmpEnv').map(t => t.name)")
        check(not any('Clock' in n for n in targets), f"'Rec > Clock' sollte NICHT mehr in inputTargets stehen: {targets}")
        check(any('Trigger' in n for n in targets), f"Poly-Synth-Trigger sollte weiter da sein: {targets}")

        # ── PickMenu-Rechtsklick: Wrapper → select-Settings, Button → PickMenu-Liste ──
        group = pg.locator('.group[data-group="Stepsequenzer"]')
        pm_wrap = group.locator('.pickmenu')
        check(pm_wrap.count() == 1, "seqOutput-PickMenu fehlt")
        # Rechtsklick auf den LABEL-Teil des Wrappers (außerhalb .pm-btn).
        lab = pm_wrap.locator('.pm-label')
        if lab.count():
            lab.click(button="right")
            time.sleep(0.05)
            panel2 = pg.locator('.elem-settings:visible')
            check(panel2.count() == 1, "Rechtsklick auf PickMenu-Wrapper sollte Element-Settings öffnen")
            check(pg.locator('.pm-pop:visible').count() == 0, "PickMenu-Liste sollte dabei NICHT aufgehen")
            if panel2.count():
                panel2.locator('.kme-close').click()
        # Rechtsklick auf den Knopf selbst → ebenfalls Element-Settings (noContextOpen:true
        # für DIESE PickMenu, @dpa wollte es unbedingt — anders als bei den übrigen sechs
        # PickMenus im Repo, wo Rechtsklick weiterhin die Liste öffnet, s. PickMenu.js).
        pm_wrap.locator('.pm-btn').click(button="right")
        time.sleep(0.05)
        check(pg.locator('.pm-pop:visible').count() == 0, "Rechtsklick auf .pm-btn sollte HIER nicht mehr die Liste öffnen")
        panel3 = pg.locator('.elem-settings:visible')
        check(panel3.count() == 1, "Rechtsklick auf .pm-btn sollte Element-Settings öffnen (noContextOpen)")
        if panel3.count():
            panel3.locator('.kme-close').click()

        # ── Grid zeichnet sofort neu, auch gestoppt (Transport läuft standardmäßig nicht) ──
        canvas = group.locator('canvas.seq-canvas')
        before = pg.evaluate("() => document.querySelector('.group[data-group=\"Stepsequenzer\"] canvas.seq-canvas').toDataURL()")
        box = canvas.bounding_box()
        x = box["x"] + box["width"] * (2.5 / 8)
        y = box["y"] + box["height"] * 0.3
        pg.mouse.click(x, y)
        time.sleep(0.05)
        after = pg.evaluate("() => document.querySelector('.group[data-group=\"Stepsequenzer\"] canvas.seq-canvas').toDataURL()")
        check(before != after, "Canvas sollte sich SOFORT ändern (gestoppt), auch ohne tick()-Loop")

        # ── Header Reset/Struktur bei keyMidi registriert UND zeigen das Learn-Panel wie
        # ihre Geschwister-Buttons (Punkt 5, ddw.md — @dpa 20260724_003531 image-3/4.png:
        # „beide auf beidem nicht" — ohne self:true blieb das Panel unsichtbar). ──
        reg = pg.evaluate("""() => {
            const km = window.__takt.host.keyMidi;
            const t = km._targets;
            const before = { reset: t.has('hdr:headerreset'), struct: t.has('hdr:structurebtn'),
                              resetSelf: t.get('hdr:headerreset').self, structSelf: t.get('hdr:structurebtn').self };
            km.setKeyEdit(true);
            const afterKey = { reset: !!t.get('hdr:headerreset').selfPanel, struct: !!t.get('hdr:structurebtn').selfPanel };
            km.setKeyEdit(false);
            km.setMidiEdit(true);
            const afterMidi = { reset: !!t.get('hdr:headerreset').selfPanel, struct: !!t.get('hdr:structurebtn').selfPanel };
            km.setMidiEdit(false);
            return { before, afterKey, afterMidi };
        }""")
        check(reg["before"]["reset"] is True, f"hdr:headerreset sollte bei keyMidi registriert sein: {reg}")
        check(reg["before"]["struct"] is True, f"hdr:structurebtn sollte bei keyMidi registriert sein: {reg}")
        check(reg["before"]["resetSelf"] is True, f"hdr:headerreset sollte self:true sein (Panel-Zeile statt Badge): {reg}")
        check(reg["before"]["structSelf"] is True, f"hdr:structurebtn sollte self:true sein: {reg}")
        check(reg["afterKey"]["reset"] is True and reg["afterKey"]["struct"] is True,
              f"Tasten-Modus: beide sollten ein Learn-Panel zeigen: {reg}")
        check(reg["afterMidi"]["reset"] is True and reg["afterMidi"]["struct"] is True,
              f"MIDI-Modus: beide sollten ein Learn-Panel zeigen: {reg}")

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
print("SMOKE OK: ddw.md-Feedback-Fixes (layerTop raus, PickMenu-Rechtsklick, Rec>Clock-Filter, Grid-Redraw, Header-Learn).")
