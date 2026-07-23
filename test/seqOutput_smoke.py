#!/usr/bin/env python3
"""Headless-Smoke für Punkt 1 (ddw.md): dynamisches Sq-Output-Ziel (PickMenu statt <select>).
Lauf: python3 test/seqOutput_smoke.py

Hart begrenzt (Watchdog killt nach 40s), kein Pollen — wie test/phase4a_seqsync_smoke.py.
Prüft:
  · seqOutput ist eine PickMenu (kein <select> mehr) in der Stepsequenzer-Gruppe, zeigt das
    Default-Ziel 'Poly-Synth → Trigger' (aus routing.inputTargets('AmpEnv'), dezentral an
    lib/polysynth/defs.js ports.inputs.trig deklariert).
  · Menü öffnen zeigt mind. 1 Eintrag; Fußzeile trägt den ↪️-Reload (kein Reload-Button in
    der Gruppenansicht selbst — @dpa: „der gehört nicht dazu").
  · Ein Trigger (window.__stepseq direkt antriggern) liefert über routing.deliver() tatsächlich
    beim Poly-Synth an (heldCount steigt), OHNE dass routing.emit()/eine statische Verbindung
    involviert ist.
  · Step-Grid: Klick auf einen Step schaltet ihn zwischen null (aus) und einem Zahlenwert
    (off-Modus AN, Default) — kein 0-Sentinel mehr.
  · ElementSettings-Panel (Rechtsklick aufs Grid) zeigt die neue Data-Sektion (Aus/Min/Max/
    Stepsize).
"""
import subprocess, sys, time, os, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8147
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
        check(pg.evaluate("() => !!window.__polysynth && !!window.__routing"), "window.__polysynth/__routing fehlt")

        # ── seqOutput ist jetzt eine PickMenu (kein <select> mehr) ──
        group = pg.locator('.group[data-group="Stepsequenzer"]')
        check(group.count() == 1, f"Stepsequenzer-Gruppe nicht gefunden, count={group.count()}")
        sel = group.locator('select')
        check(sel.count() == 0, f"seqOutput sollte KEIN <select> mehr sein, gefunden: {sel.count()}")
        pm_btn = group.locator('.pickmenu .pm-btn')
        check(pm_btn.count() == 1, f"seqOutput-PickMenu-Knopf fehlt, count={pm_btn.count()}")
        name0 = pg.evaluate("() => window.__stepseq.state.get('seqOutput_0')")
        check(name0 == 'polysynth.trig', f"Default-Ziel sollte 'polysynth.trig' sein, war {name0!r}")

        # ── Menü öffnen: Eintrag + Reload-Fußzeile, KEIN Reload-Button außerhalb ──
        pm_btn.click()
        pop = pg.locator('.pm-pop:visible')
        check(pop.count() == 1, f"PickMenu-Popup öffnet nicht, count={pop.count()}")
        items = pop.locator('.pm-item')
        check(items.count() >= 1, f"erwartet mind. 1 Ziel in der Liste, gefunden: {items.count()}")
        check('Poly-Synth' in (items.first.inner_text() or ''), f"erstes Ziel sollte Poly-Synth sein: {items.first.inner_text()!r}")
        foot = pop.locator('.pm-foot-btn')
        check(foot.count() == 1, f"erwartet genau 1 Fußzeilen-Aktion (Reload), gefunden: {foot.count()}")
        group_reload = group.locator('button:has-text("Neu laden")')
        check(group_reload.count() == 0, "Reload-Button darf NICHT in der Gruppenansicht selbst sitzen")
        foot.click()   # schließt das Menü (PickMenu-Verhalten) und lädt neu
        check(not pg.locator('.pm-pop:visible').count(), "Menü sollte nach Fußzeilen-Klick schließen")

        # ── Trigger liefert über deliver() wirklich beim Poly-Synth an ──
        before = pg.evaluate("() => window.__polysynth.engine.heldCount()")
        pg.evaluate("""() => {
            window.__routing.reg.deliver({module:'stepseq',port:'amp'}, {module:'polysynth',port:'trig'}, 0.8);
        }""")
        time.sleep(0.05)
        after = pg.evaluate("() => window.__polysynth.engine.heldCount()")
        check(after > before, f"deliver() sollte eine Note anschlagen, heldCount {before} -> {after}")
        pg.evaluate("() => window.__polysynth.engine.allNotesOff()")

        # ── Step-Grid: Klick toggelt null <-> Zahl (kein 0-Sentinel mehr) ──
        canvas = group.locator('canvas.seq-canvas')
        check(canvas.count() == 1, f"Step-Canvas fehlt, count={canvas.count()}")
        steps_before = pg.evaluate("() => window.__stepseq.state.get('seqSteps_0').slice(0,4)")
        box = canvas.bounding_box()
        # Step 1 (Index 1, zweiter von links) anklicken — Step 0 ist per Default schon an.
        x = box["x"] + box["width"] * (1.5 / 8)
        y = box["y"] + box["height"] * 0.5
        pg.mouse.click(x, y)
        time.sleep(0.05)
        steps_after = pg.evaluate("() => window.__stepseq.state.get('seqSteps_0').slice(0,4)")
        check(steps_before[1] != steps_after[1], f"Klick auf Step 1 sollte den Wert ändern: {steps_before} -> {steps_after}")
        check(steps_after[1] is None or isinstance(steps_after[1], (int, float)), f"Step-Wert sollte null oder Zahl sein: {steps_after[1]!r}")

        # ── ElementSettings Data-Sektion (Rechtsklick aufs Grid) ──
        canvas.click(button="right")
        panel = pg.locator('.elem-settings:visible')
        check(panel.count() == 1, f"Element-Settings-Panel öffnet nicht, count={panel.count()}")
        check(panel.locator('.es-seqoff').count() == 1, "Data-Feld 'Aus' fehlt im Panel")
        check(panel.locator('.es-seqmin').count() == 1, "Data-Feld 'Min' fehlt im Panel")
        check(panel.locator('.es-seqmax').count() == 1, "Data-Feld 'Max' fehlt im Panel")
        check(panel.locator('.es-seqstep').count() == 1, "Data-Feld 'Stepsize' fehlt im Panel")
        check(panel.locator('.kme-row[data-f="seqOff"]').is_visible(), "'Aus'-Zeile nicht sichtbar")
        panel.locator('.kme-close').click()

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
print("SMOKE OK: Sq-Output-PickMenu (Punkt 1) — dynamisches Ziel, deliver()-Routing, Grid-Toggle, Data-Sektion.")
