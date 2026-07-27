#!/usr/bin/env python3
"""Headless-Selbsttest: zwei @dpa-Vorgaben vom 20260727_135331 ("settings:"-Abschnitt).

1) Alle Einstellungsveränderungen sollen DIREKT übernommen werden, ohne Enter zu
   drücken (Enter bleibt nur als gewohnte Bestätigung erhalten, ist aber nicht mehr
   nötig). Root Cause: KnobMetaEditor.js hatte für Min/Max/Step/Dez./Einheit — anders
   als fast jedes andere Feld im selben Panel — GAR KEINEN Live-Listener; sie griffen
   nur bei Enter oder zufällig als Nebeneffekt eines ANDEREN Feld-Events.

2) Zahl-/Text-Eingabefelder selektieren beim Fokussieren ihren gesamten Inhalt — auch
   beim Anklicken, nicht nur per Tab (bisher: GroupHost.js' eigene Textfelder taten
   das NUR bei Tab-Fokus, `focusByTab`-Gate; alle anderen Panels — KnobMetaEditor,
   ElementSettings, … — gar nicht). Fix: globaler capture-Listener (lib/selectOnFocus.js).

Lauf: python3 test/settingsLiveApplySelectAll_smoke.py
Hart begrenzt (40s Watchdog), kein Pollen.
"""
import subprocess, sys, time, os, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8231
HARD_LIMIT_S = 40

def watchdog():
    time.sleep(HARD_LIMIT_S)
    print(f"SMOKE: HARD-TIMEOUT nach {HARD_LIMIT_S}s — abgebrochen.")
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
        page = browser.new_page(viewport={"width": 1200, "height": 900})
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(f"http://localhost:{PORT}/", wait_until="domcontentloaded")
        page.wait_for_function("window.__polysynth", timeout=15000)

        knob = page.locator('#polysynth [data-ctrl^="k:"]').first
        knob.scroll_into_view_if_needed()
        knob.click(button="right")
        page.wait_for_timeout(150)

        # ── 1) Min/Max/Step/Dez./Einheit übernehmen OHNE Enter ──
        maxf = page.locator('.kme-max:visible')
        before = page.evaluate("() => JSON.stringify(window.__polysynth.state.get('knobMeta')||{})")
        maxf.fill("777")
        page.wait_for_timeout(80)   # kein Enter, kein Blur
        meta = page.evaluate("""() => {
            const wrap = document.querySelectorAll('#polysynth [data-ctrl^="k:"]')[0];
            const id = wrap.dataset.ctrl.replace(/^k:/, '');
            return (window.__polysynth.state.get('knobMeta')||{})[id];
        }""")
        check(meta is not None and meta.get('max') == 777,
              f"Max=777 sollte ohne Enter direkt in knobMeta stehen, war {meta}")

        decf = page.locator('.kme-decimals:visible')
        decf.fill("4")
        page.wait_for_timeout(80)
        meta2 = page.evaluate("""() => {
            const wrap = document.querySelectorAll('#polysynth [data-ctrl^="k:"]')[0];
            const id = wrap.dataset.ctrl.replace(/^k:/, '');
            return (window.__polysynth.state.get('knobMeta')||{})[id];
        }""")
        check(meta2 is not None and meta2.get('decimals') == 4,
              f"Dez.=4 sollte ohne Enter direkt in knobMeta stehen, war {meta2}")

        # ── 2) Select-all bei Klick (nicht nur Tab) ──
        page.evaluate("""() => {
            window.__selectCalls = 0;
            const orig = HTMLInputElement.prototype.select;
            HTMLInputElement.prototype.select = function() { window.__selectCalls++; return orig.call(this); };
        }""")
        minf = page.locator('.kme-min:visible')
        minf.click()
        page.wait_for_timeout(30)
        calls_after_click = page.evaluate("() => window.__selectCalls")
        check(calls_after_click >= 1, f"Klick auf Zahlenfeld sollte select() auslösen, war {calls_after_click} Aufrufe")

        browser.close()
finally:
    srv.terminate()
    try:
        srv.wait(timeout=5)
    except Exception:
        srv.kill()

for e in errors: print("PAGEERROR:", e)
if fails:
    for f in fails: print("FAIL:", f)
    sys.exit(1)
print("SMOKE OK: KnobMetaEditor-Range-Felder übernehmen live (ohne Enter), Zahlenfelder selektieren bei Klick.")
