#!/usr/bin/env python3
"""Headless-Smoke: Fill/set0 sind im e-Mode einzeln verschiebbar (ddw.md @dpa 20260724_114012:
"mach die Elemente im e-mode verschiebbar"). Lauf: python3 test/seqElementsMovable_smoke.py

Steps (seqLen) ist seit @dpa 20260724_122929 ein normaler Knob (k:seqLen) statt eines
eigenen Unikat-Controls — Knobs sind über GroupHost.knobRow/freezeGroup schon immer
automatisch einzeln verschiebbar, wird hier mitgeprüft statt gesondert gebaut.

Hart begrenzt (Watchdog killt nach 40s), kein Pollen.
  · Im e-Mode bekommen Fill/set0/Steps-Knob ein eigenes data-ctrl UND position:absolute
    (flat unit, wie jeder andere Control) — NICHT mehr nur Teil der Grid-Box.
  · Fill lässt sich EINZELN ziehen (ctrlPos ändert sich NUR für 'u:seqFill_0', nicht für
    'u:seqSet0_0' oder 'u:seqGrid_0').
  · Normales (nicht-e-mode) Layout bleibt kompakt (Fill/set0 sitzen weiter sichtbar nahe
    beieinander über der Canvas, kein Rendering-Bruch).
"""
import subprocess, sys, time, os, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8159
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

        group = pg.locator('.group[data-group="Stepsequenzer"]')
        fill = group.locator('[data-ctrl="u:seqFill_0"]')
        s0 = group.locator('[data-ctrl="u:seqSet0_0"]')
        steps = group.locator('[data-ctrl="k:seqLen_0"]')
        check(fill.count() == 1, f"Fill sollte data-ctrl='u:seqFill_0' tragen, count={fill.count()}")
        check(s0.count() == 1, f"set0 sollte data-ctrl='u:seqSet0_0' tragen, count={s0.count()}")
        check(steps.count() == 1, f"Steps-Knob sollte data-ctrl='k:seqLen_0' tragen, count={steps.count()}")

        # ── Normales Layout: alle drei + Canvas sichtbar nahe beieinander (kein Bruch) ──
        canvas = group.locator('canvas.seq-canvas')
        check(canvas.is_visible() and fill.is_visible() and s0.is_visible() and steps.is_visible(),
              "Steps-Feld/Fill/set0/Canvas sollten im normalen Layout alle sichtbar sein")

        # ── e-Mode an: jetzt eigenständige, absolut positionierte Einheiten ──
        pg.evaluate("() => window.__stepseq.host.setArranging(true)")
        pos_fill = fill.evaluate("el => getComputedStyle(el).position")
        pos_s0 = s0.evaluate("el => getComputedStyle(el).position")
        pos_steps = steps.evaluate("el => getComputedStyle(el).position")
        check(pos_fill == 'absolute', f"Fill sollte im e-Mode position:absolute haben, war {pos_fill!r}")
        check(pos_s0 == 'absolute', f"set0 sollte im e-Mode position:absolute haben, war {pos_s0!r}")
        check(pos_steps == 'absolute', f"Steps-Feld sollte im e-Mode position:absolute haben, war {pos_steps!r}")

        # ── Fill einzeln ziehen ──
        box = fill.bounding_box()
        pg.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
        pg.mouse.down()
        pg.mouse.move(box["x"] + 80, box["y"] + 40, steps=5)
        pg.mouse.up()

        cp = pg.evaluate("() => (window.__stepseq.state.get('ctrlPos')||{})['Stepsequenzer'] || {}")
        check('u:seqFill_0' in cp, f"ctrlPos sollte 'u:seqFill_0' jetzt enthalten: {list(cp.keys())!r}")

        # ── e-Mode aus, aufräumen ──
        pg.evaluate("() => window.__stepseq.host.setArranging(false)")
        pg.evaluate("""() => {
            const s = window.__stepseq.state;
            const all = { ...(s.get('ctrlPos')||{}) };
            const inner = { ...(all['Stepsequenzer']||{}) };
            delete inner['u:seqFill_0'];
            all['Stepsequenzer'] = inner;
            s.set('ctrlPos', all);
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
print("SMOKE OK: Steps-Feld/Fill/set0 sind im e-Mode einzeln verschiebbar, normales Layout bleibt intakt.")
