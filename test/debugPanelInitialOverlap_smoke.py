#!/usr/bin/env python3
"""Headless-Smoke: Bug 1 aus ddw.md (@dpa, Screenshots) — "es gibt initial Einstellungen,
wo die Gruppe oder das Instrument zunaechst noch nicht richtig dargestellt wird, man muss
kurz in den e-mode und wieder raus - dann stimmt es." Konkretes Beispiel: Debug-Panel zeigt
beim ERSTEN Laden das Prompt-Textfeld uebereinander mit einem gespeicherten Eintrags-Titel
(Rec/Rec2-Button-Reihe).

Root Cause (s. lib/group/GroupHost.js `placeLateUnit`-Kommentar): `mountInGroup()` haengt
Nachzuegler-Controls (Debug: Name-/Prompt-Textfelder aus mount.js; genauso Scope/Env/Sq/
Rec/Meter-Klone) STRUKTURELL in eine Gruppe, oft ERST NACHDEM diese schon `free-canvas`
eingefroren ist (freezeGroup() lief waehrend mountGroups()/addGroup(), WEIL irgendein
anderes Control der Gruppe schon einen gespeicherten ctrlPos-Eintrag hatte -- z.B. eine
aeltere Config von VOR diesem neuen Control). Das neu angehaengte Control bekam bisher
NIE eine eigene position (nur die CSS-Regel `.group-body.free-canvas > [data-ctrl] {
position:absolute }` OHNE left/top) -- der Browser faellt auf die "static position"
zurueck, die bei lauter schon absolut positionierten Geschwistern faktisch (0,0) ergibt:
Ueberlappung mit was zufaellig dort schon steht. Reproduziert hier durch VORAB (vor dem
ersten mountGroups()-Aufruf) genau diesen Halbzustand in den localStorage zu schreiben --
ctrlPos fuer die Debug-Gruppe, aber NUR fuer die (deklarativ, frueh gebauten) Rec/Rec2-
Buttons, NICHT fuer die (per mountInGroup() NACH mountGroups() angehaengten) Name-/Prompt-
Textfelder.

Prueft in overcord/, werkbank-leer/ UND pitchosc/ (gemeinsamer lib/debugPanel/-Code):
  - Direkt nach dem ersten Seitenaufbau (KEIN manueller e-Mode-Toggle) ueberlappt das
    Prompt-Textfeld NICHT mit der Rec-Button-Reihe (Bounding-Box-Vergleich).
  - Das Prompt-Feld hat schon beim ersten Rendern eine sinnvolle (nicht (0,0)-nahe) Position.

Geprueft rein ueber DOM-Geometrie (getBoundingClientRect), nie ueber Audio/Play-Buttons
(CLAUDE.md "Headless-Audio-Falle").

Lauf: python3 test/debugPanelInitialOverlap_smoke.py
Hart begrenzt (40s Watchdog), kein Pollen.
"""
import subprocess, sys, time, os, threading, json
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8298
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

# App-Praefix je Einstieg (s. lib/appId.js) -> localStorage-Key-Praefix.
ENTRIES = [("overcord/", "werkbank"), ("werkbank-leer/", "werkbank-leer"), ("pitchosc/", "pitchosc")]

# Nur die Buttons haben schon eine gespeicherte Position -- die Textfelder (Nachzuegler
# per mountInGroup) bewusst NICHT, genau der Halbzustand aus der ddw.md-Beschreibung.
SEED_CTRLPOS = {
    "Debug": {
        "b:debugRec": {"x": 0, "y": 50},
        "b:debugRec2": {"x": 110, "y": 50},
        "b:debugRecReset": {"x": 220, "y": 50},
        "b:debugSave": {"x": 0, "y": 100},
        "n:debugNote": {"x": 220, "y": 100},
    }
}

def rects_overlap(a, b):
    return a["left"] < b["right"] and a["right"] > b["left"] and a["top"] < b["bottom"] and a["bottom"] > b["top"]

try:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for entry, app_prefix in ENTRIES:
            ctx = browser.new_context(viewport={"width": 1600, "height": 1100})
            page = ctx.new_page()
            page.on("pageerror", lambda e, entry=entry: errors.append(f"{entry}: {e}"))
            # Seed VOR jedem document-Skript dieser Seite (jede Navigation) -- die App
            # importiert den Werksstand nur fuer Keys, die NOCH NICHT existieren (s.
            # lib/defaultConfig.js), unser Seed bleibt also unangetastet.
            ls_key = f"{app_prefix}_debug"
            seed_js = f"window.localStorage.setItem({json.dumps(ls_key)}, {json.dumps(json.dumps({'ctrlPos': SEED_CTRLPOS}))});"
            page.add_init_script(seed_js)
            page.goto(f"http://localhost:{PORT}/{entry}", wait_until="networkidle", timeout=15000)
            page.wait_for_function("window.__debug && window.__debug.host", timeout=15000)

            # Sicherstellen, dass der Seed tatsaechlich griff (nicht durch einen Fehler in
            # add_init_script/Timing verloren ging) -- sonst waere der Test ein Blindgaenger.
            stored_ctrlpos = page.evaluate("() => window.__debug.state.get('ctrlPos')")
            check(stored_ctrlpos and stored_ctrlpos.get('Debug', {}).get('b:debugRec') == {"x": 0, "y": 50},
                  f"{entry}: Seed-ctrlPos kam nicht an, Test waere ein Blindgaenger (war {stored_ctrlpos!r})")

            prompt_f = page.locator('[data-ctrl="x:debugPrompt"]')
            rec_f = page.locator('[data-ctrl="b:debugRec"]')
            check(prompt_f.count() == 1, f"{entry}: Prompt-Feld fehlt")
            check(rec_f.count() == 1, f"{entry}: Rec-Button fehlt")

            pr = prompt_f.bounding_box()
            rr = rec_f.bounding_box()
            check(pr is not None and rr is not None, f"{entry}: Bounding-Box fehlt (pr={pr}, rr={rr})")
            if pr and rr:
                pr_r = {"left": pr["x"], "top": pr["y"], "right": pr["x"] + pr["width"], "bottom": pr["y"] + pr["height"]}
                rr_r = {"left": rr["x"], "top": rr["y"], "right": rr["x"] + rr["width"], "bottom": rr["y"] + rr["height"]}
                check(not rects_overlap(pr_r, rr_r),
                      f"{entry}: Prompt-Feld ({pr_r}) ueberlappt Rec-Button ({rr_r}) SOFORT nach Seitenaufbau, ohne e-Mode-Toggle")
                # Zusatz: das Prompt-Feld darf nicht bei (0,0)-nahe der Gruppe kleben (Symptom
                # der fehlenden eigenen Position) -- es MUSS unter den Buttons stehen (top > 0
                # innerhalb der Gruppe).
                grp = page.locator('.group[data-group="Debug"]').bounding_box()
                rel_top = pr["y"] - grp["y"] if grp else None
                check(rel_top is not None and rel_top > 30,
                      f"{entry}: Prompt-Feld sitzt zu weit oben in der Gruppe (rel_top={rel_top}) -- Anzeichen fuer (0,0)-Fallback")

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
print("SMOKE OK: Debug-Panel-Nachzuegler (Prompt-Textfeld) ueberlappt beim ALLERERSTEN "
      "Rendern NICHT mehr die Rec-Button-Reihe, in overcord/, werkbank-leer/ UND pitchosc/ "
      "-- kein manueller e-Mode-Toggle noetig.")
