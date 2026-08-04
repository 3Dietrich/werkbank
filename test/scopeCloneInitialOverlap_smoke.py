#!/usr/bin/env python3
"""Headless-Smoke: Bug 1 (ddw.md @dpa, "Controls ueberlappen initial") am ZWEITEN,
generischen Fall neben dem Debug-Panel (test/debugPanelInitialOverlap_smoke.py) --
eine per +➩ vervielfaeltigte Gruppe (hier: Signal-Scope, s. lib/scope/multiScope.js),
um zu belegen, dass der Fix in lib/group/GroupHost.js (`placeLateUnit`, s. dort) generisch
ist und nicht nur das Debug-Panel trifft.

Root Cause identisch zum Debug-Panel-Fall: `createScopeManager.buildScope(i)` baut die
Klon-Gruppe ("Scope 2", ...) leer per `host.addGroup({name, ...})` -- WENN zu diesem
Zeitpunkt schon IRGENDEIN (auch ein veralteter/gestrichener) ctrlPos-Eintrag fuer diese
Gruppe existiert (z.B. aus einem Config-Import mit einem aelteren Control-Schema),
friert addGroup() die noch LEERE Gruppe sofort ein (`free-canvas`). Die eigentlichen
Controls (Quellen-PickMenu `s:scopeSrc_1`, Scope-Widget `u:scope_1`) haengen erst DANACH
per `host.mountInGroup()` an -- ohne den Fix landeten beide ungeachtet ihrer Reihenfolge
bei (0,0) (CSS `position:absolute` ohne eigenes left/top faellt auf die "static position"
zurueck) und ueberlappten sich.

Seed: `scopeCount:2` + ein VERALTETER ctrlPos-Eintrag fuer "Scope 2" (Control-ID, die es
in der aktuellen defs-Version gar nicht mehr gibt) -- reicht, um addGroup() zum Einfrieren
zu bewegen, BEVOR PickMenu/Widget ueberhaupt existieren. Genau der reale Trigger (Import
einer aelteren Config) statt eines synthetischen Testpfads.

Lauf: python3 test/scopeCloneInitialOverlap_smoke.py
Hart begrenzt (40s Watchdog), kein Pollen.
"""
import subprocess, sys, time, os, threading, json
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8297
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

ENTRIES = [("overcord/", "werkbank"), ("werkbank-leer/", "werkbank-leer"), ("pitchosc/", "pitchosc")]

# Ein veralteter Eintrag (Control-ID, die es nicht mehr gibt) reicht, damit addGroup() die
# frisch gebaute, noch leere Klon-Gruppe "Scope 2" sofort einfriert -- exakt der Halbzustand
# einer importierten aelteren Config.
SEED_STATE = {"scopeCount": 2, "ctrlPos": {"Scope 2": {"s:scopeSrcOld": {"x": 5, "y": 5}}}}

def rects_overlap(a, b):
    return a["left"] < b["right"] and a["right"] > b["left"] and a["top"] < b["bottom"] and a["bottom"] > b["top"]

try:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for entry, app_prefix in ENTRIES:
            ctx = browser.new_context(viewport={"width": 1600, "height": 1100})
            page = ctx.new_page()
            page.on("pageerror", lambda e, entry=entry: errors.append(f"{entry}: {e}"))
            ls_key = f"{app_prefix}_scope"
            seed_js = f"window.localStorage.setItem({json.dumps(ls_key)}, {json.dumps(json.dumps(SEED_STATE))});"
            page.add_init_script(seed_js)
            page.goto(f"http://localhost:{PORT}/{entry}", wait_until="networkidle", timeout=15000)
            page.wait_for_function("window.__scope && window.__scope.host", timeout=15000)

            stored = page.evaluate("() => window.__scope.state.get('ctrlPos')")
            check(stored and 'Scope 2' in stored, f"{entry}: Seed-ctrlPos kam nicht an, Test waere ein Blindgaenger (war {stored!r})")

            src_f = page.locator('[data-ctrl="s:scopeSrc_1"]')
            scope_f = page.locator('[data-ctrl="u:scope_1"]')
            check(src_f.count() == 1, f"{entry}: Scope-2-PickMenu fehlt")
            check(scope_f.count() == 1, f"{entry}: Scope-2-Widget fehlt")

            sr = src_f.bounding_box()
            wr = scope_f.bounding_box()
            check(sr is not None and wr is not None, f"{entry}: Bounding-Box fehlt (sr={sr}, wr={wr})")
            if sr and wr:
                sr_r = {"left": sr["x"], "top": sr["y"], "right": sr["x"] + sr["width"], "bottom": sr["y"] + sr["height"]}
                wr_r = {"left": wr["x"], "top": wr["y"], "right": wr["x"] + wr["width"], "bottom": wr["y"] + wr["height"]}
                check(not rects_overlap(sr_r, wr_r),
                      f"{entry}: Scope-2-PickMenu ({sr_r}) ueberlappt Scope-2-Widget ({wr_r}) SOFORT nach Seitenaufbau, ohne e-Mode-Toggle")

            errs = [e for e in errors if "favicon" not in e.lower()]
            check(len(errs) == 0, f"{entry}: Console-/Page-Errors: {errs}")

            page.close()
            ctx.close()
        browser.close()
except Exception as e:
    fails.append(f"Exception: {e}")
finally:
    srv.terminate()

if fails:
    print("SMOKE FAIL:")
    for f in fails:
        print(" -", f)
    sys.exit(1)
print("SMOKE OK: Per +➚ vervielfaeltigte Scope-2-Gruppe (PickMenu + Widget) ueberlappt beim "
      "ALLERERSTEN Rendern NICHT mehr, in overcord/, werkbank-leer/ UND pitchosc/ -- belegt "
      "den generischen Fix in GroupHost.js.mountInGroup()/placeLateUnit().")
