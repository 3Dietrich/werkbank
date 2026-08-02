#!/usr/bin/env python3
"""Headless-Smoke: die "Debug"-Gruppe (ddw.md @dpa 20260802: "bei teslacoil die debug
Gruppe.. die will ich auch in beiden, werkbank-leer und overcord"). Port aus
teslacoil/js/ui/DebugPanel.js — sechs Controls (Name, Note, Text/Prompt, Rec, Rec2,
Reset, Speichern) aus denselben generischen Fabriken wie jeder andere werkbank-Control,
s. lib/debugPanel/.

Prueft in BEIDEN Ensembles (overcord/ + werkbank-leer/, gemeinsamer lib/debugPanel/-Code):
  - Die Debug-Gruppe + alle sechs Controls existieren (data-ctrl-IDs).
  - Name/Text-Feld schreiben NICHT in die literalen Sound-Snapshot-Keys 'debugName'/
    'debugPrompt' (die ein Gruppen-/ISM-Snapshot ueber data-ctrl="x:debugName" ableiten
    wuerde) -- sie landen ausschliesslich in `debugMeta` (eigener Optik-Key, s.
    DebugPanel.js-Kopf). Das ist der Kern des "kein Sound-Recall"-Vertrags.
  - Rec/Rec2 schliessen sich gegenseitig aus (Klick auf Rec2 stoppt eine laufende Rec-
    Aufnahme, deren Take bleibt aber erhalten) -- ueber die echten Header-Buttons, ctrl-on-
    Klasse UND DebugPanel.recording() geprueft.
  - Reset leert beide Aufnahmen (ctrl-on faellt bei beiden weg).
  - e-Mode (setArranging(true)) loescht Name/Prompt NICHT aus dem DOM -- der ursprüngliche
    Verdacht war, dass GroupHost.js' freezeGroup() Kinder ohne data-ctrl aus ihrem
    .group-ctrls-Container entfernt; Name/Prompt tragen data-ctrl (ueber host.mountInGroup),
    genau um das zu vermeiden.

Geprueft GEZAEHLT/PROGRAMMATISCH ueber Playwright-Klicks + window.__debug, nie ueber
tatsaechliches Abspielen/Hoeren (CLAUDE.md "Headless-Audio-Falle"). ScriptProcessorNode
(kein AudioWorklet/addModule()) faellt NICHT unter die Headless-Audio-Falle des Projekts.

Lauf: python3 test/debugPanel_smoke.py
Hart begrenzt (40s Watchdog), kein Pollen.
"""
import subprocess, sys, time, os, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8299
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
        browser = p.chromium.launch()
        for entry in ("overcord/", "werkbank-leer/"):
            page = browser.new_page(viewport={"width": 1600, "height": 1100})
            page.on("pageerror", lambda e, entry=entry: errors.append(f"{entry}: {e}"))
            page.goto(f"http://localhost:{PORT}/{entry}", wait_until="networkidle", timeout=15000)
            page.wait_for_function("window.__debug && window.__debug.host", timeout=15000)

            group = page.locator('.group[data-group="Debug"]')
            check(group.count() == 1, f"{entry}: Debug-Gruppe fehlt")

            name_f = group.locator('[data-ctrl="x:debugName"]')
            prompt_f = group.locator('[data-ctrl="x:debugPrompt"]')
            note_f = group.locator('[data-ctrl="n:debugNote"]')
            rec_btn = group.locator('[data-ctrl="b:debugRec"] button')
            rec2_btn = group.locator('[data-ctrl="b:debugRec2"] button')
            reset_btn = group.locator('[data-ctrl="b:debugRecReset"] button')
            save_btn = group.locator('[data-ctrl="b:debugSave"] button')
            for loc, label in ((name_f, 'x:debugName'), (prompt_f, 'x:debugPrompt'), (note_f, 'n:debugNote'),
                                (rec_btn, 'b:debugRec'), (rec2_btn, 'b:debugRec2'),
                                (reset_btn, 'b:debugRecReset'), (save_btn, 'b:debugSave')):
                check(loc.count() == 1, f"{entry}: Control {label} fehlt (count={loc.count()})")

            # ── Name/Prompt tippen: landet in debugMeta, NICHT in state.debugName/debugPrompt ──
            name_input = name_f.locator('input')
            name_input.click()
            name_input.fill('filter-bug')
            prompt_input = prompt_f.locator('textarea')
            prompt_input.click()
            prompt_input.fill('hoerst du das Zwitschern bei Step 3?')

            meta = page.evaluate("() => window.__debug.state.get('debugMeta')")
            check(meta and meta.get('name') == 'filter-bug', f"{entry}: debugMeta.name nicht uebernommen: {meta}")
            check(meta and meta.get('prompt') == 'hoerst du das Zwitschern bei Step 3?', f"{entry}: debugMeta.prompt nicht uebernommen: {meta}")
            leak_name = page.evaluate("() => window.__debug.state.get('debugName')")
            leak_prompt = page.evaluate("() => window.__debug.state.get('debugPrompt')")
            check(leak_name is None, f"{entry}: 'debugName' darf NIE ein State-Key werden (Sound-Snapshot-Leck), war {leak_name!r}")
            check(leak_prompt is None, f"{entry}: 'debugPrompt' darf NIE ein State-Key werden (Sound-Snapshot-Leck), war {leak_prompt!r}")
            all_sound = page.evaluate("() => window.__debug.host.allSoundValues()")
            check('debugName' not in all_sound and 'debugPrompt' not in all_sound,
                  f"{entry}: allSoundValues() (ISM-/Ensemble-Snapshot-Basis) enthaelt Name/Prompt: {all_sound}")

            # ── Rec/Rec2 schliessen sich aus ──
            rec_btn.click()
            page.wait_for_timeout(50)
            check(rec_btn.evaluate("el => el.classList.contains('ctrl-on')"), f"{entry}: Rec sollte nach Klick ON sein")
            check(page.evaluate("() => window.__debug.panel.recording('a')") is True, f"{entry}: panel.recording('a') sollte true sein")

            rec2_btn.click()
            page.wait_for_timeout(50)
            check(not rec_btn.evaluate("el => el.classList.contains('ctrl-on')"), f"{entry}: Rec sollte durch Rec2 gestoppt worden sein")
            check(rec2_btn.evaluate("el => el.classList.contains('ctrl-on')"), f"{entry}: Rec2 sollte nach Klick ON sein")
            check(page.evaluate("() => window.__debug.panel.recording('a')") is False, f"{entry}: Slot a sollte gestoppt sein")
            check(page.evaluate("() => window.__debug.panel.recording('b')") is True, f"{entry}: Slot b sollte laufen")

            # ── Reset leert beide ──
            reset_btn.click()
            page.wait_for_timeout(50)
            check(not rec_btn.evaluate("el => el.classList.contains('ctrl-on')"), f"{entry}: Rec sollte nach Reset AUS sein")
            check(not rec2_btn.evaluate("el => el.classList.contains('ctrl-on')"), f"{entry}: Rec2 sollte nach Reset AUS sein")
            check(page.evaluate("() => window.__debug.panel.lastSeconds('a')") == 0, f"{entry}: Take a sollte nach Reset leer sein")
            check(page.evaluate("() => window.__debug.panel.lastSeconds('b')") == 0, f"{entry}: Take b sollte nach Reset leer sein")

            # ── e-Mode: Name/Prompt ueberleben freezeGroup() (data-ctrl via mountInGroup) ──
            page.evaluate("() => window.__debug.host.setArranging(true)")
            page.wait_for_timeout(50)
            check(name_f.count() == 1, f"{entry}: Name-Feld verschwand im e-Mode (freezeGroup-Regression)")
            check(prompt_f.count() == 1, f"{entry}: Prompt-Feld verschwand im e-Mode (freezeGroup-Regression)")
            pos = name_f.evaluate("el => getComputedStyle(el).position")
            check(pos == 'absolute', f"{entry}: Name-Feld sollte im e-Mode position:absolute haben, war {pos!r}")
            page.evaluate("() => window.__debug.host.setArranging(false)")

            errs = [e for e in errors if "favicon" not in e.lower()]
            check(len(errs) == 0, f"{entry}: Console-/Page-Errors: {errs}")

            page.close()
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
print("SMOKE OK: Debug-Gruppe (6 Controls) in overcord/ UND werkbank-leer/ verdrahtet, "
      "Rec/Rec2 schliessen sich aus, Reset leert beide, Name/Prompt bleiben ausserhalb des "
      "Sound-Snapshots und ueberleben den e-Mode.")
