#!/usr/bin/env python3
"""Headless-Smoke für den ISM-Snapshot (ddw.md @dpa 20260724: "ISM UND (Snapshot)").
Lauf: python3 test/ismSnapshot_smoke.py

Hart begrenzt (Watchdog killt nach 40s), kein Pollen. Testet am Poly-Synth (mehrere
Gruppen: "Oszillator"/"Amp-Env"/"Keyboard" etc.):
  · Rechtsklick auf die ISM-Kopfzeile (<h2>) öffnet Settings inkl. "Snapshot"-PickMenu-Zeile.
  · saveIsmSnap() sammelt Werte ÜBER MEHRERE Gruppen hinweg (nicht nur eine).
  · Werte in ZWEI verschiedenen Gruppen ändern, dann recallIsmSnap() → beide kommen zurück.
"""
import subprocess, sys, time, os, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8154
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

        check(pg.evaluate("() => typeof window.__polysynth.instr.saveIsmSnap === 'function'"), "instr.saveIsmSnap fehlt")

        # ── Rechtsklick auf die ISM-Kopfzeile öffnet Settings inkl. Snapshot-PickMenu ──
        h2 = pg.locator('#bench-polysynth > h2')
        h2.click(button="right")
        panel = pg.locator('.knob-meta-editor.mini-settings:visible')
        check(panel.count() == 1, f"Instrument-Settings öffnen nicht, count={panel.count()}")
        pm = panel.locator('.pickmenu .pm-btn')
        check(pm.count() == 1, f"Snapshot-PickMenu-Knopf fehlt, count={pm.count()}")
        panel.locator('.kme-close').click()

        # ── Werte über mehrere Gruppen hinweg merken ──
        before = pg.evaluate("() => ({ attack: window.__polysynth.state.get('ampAttack'), hold: window.__polysynth.state.get('kbHold') })")
        list_len = pg.evaluate("() => window.__polysynth.instr.saveIsmSnap('Ganzer Sound').length")
        check(list_len == 1, f"saveIsmSnap sollte 1 Eintrag liefern, war {list_len}")
        snap = pg.evaluate("() => window.__polysynth.state.get('ismSnaps')[0]")
        check('ampAttack' in snap['values'], f"Snapshot sollte ampAttack (Amp-Env-Gruppe) enthalten: {list(snap['values'].keys())!r}")
        check('kbHold' in snap['values'], f"Snapshot sollte kbHold (Keyboard-Gruppe) enthalten: {list(snap['values'].keys())!r}")

        # ── Werte in ZWEI Gruppen ändern ──
        pg.evaluate("""() => {
            const s = window.__polysynth.state;
            s.set('ampAttack', (s.get('ampAttack') || 0) + 0.2);
            s.set('kbHold', !s.get('kbHold'));
        }""")
        changed = pg.evaluate("() => ({ attack: window.__polysynth.state.get('ampAttack'), hold: window.__polysynth.state.get('kbHold') })")
        check(changed['attack'] != before['attack'] and changed['hold'] != before['hold'], f"Werte sollten geändert sein: {changed!r} vs {before!r}")

        ok = pg.evaluate("() => window.__polysynth.instr.recallIsmSnap(0)")
        check(ok is True, "recallIsmSnap sollte true liefern")
        after = pg.evaluate("() => ({ attack: window.__polysynth.state.get('ampAttack'), hold: window.__polysynth.state.get('kbHold') })")
        check(after == before, f"Recall sollte BEIDE Gruppen zurückholen: {after!r} != {before!r}")

        # ── Aufräumen ──
        pg.evaluate("() => window.__polysynth.instr.deleteIsmSnap(0)")

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
print("SMOKE OK: ISM-Snapshot (Poly-Synth) über mehrere Gruppen hinweg (Save/Recall).")
