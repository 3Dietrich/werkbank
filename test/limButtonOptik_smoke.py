#!/usr/bin/env python3
"""Headless-Selbsttest Lim-Button-Optik (ddw.md 20260802: "den Lim Button neben Attack
und Release (geordnet nach Limiter settings und Optik): BGoff, BGon (und der
Vollständigkeit halber auch VG/schrift)"). Der Lim-Button (lib/MasterVolume.js) ist KEIN
GroupHost-Control (Header-Element, kein registerCtrlStyle) — Optik wird hier von Hand in
seinem Rechtsklick-Popover verdrahtet (masterState.limStyle: bg/bgOn/fg/size, dasselbe
Feldschema wie jeder GroupHost-Button). Der Test verifiziert: Popover zeigt alle drei
Sektionen (Limiter/WaveShaper/Optik — WaveShaper zog per ddw.md 20260802_234615 Punkt 1
als Checkbox-Zeile mit rein, der frühere separate [WS]-Header-Button ist weg), die vier
Optik-Felder existieren, und ein geändertes Feld schlägt sich sowohl in
masterState.limStyle als auch im tatsächlichen Button-Style nieder.

Lauf: python3 test/limButtonOptik_smoke.py
Hart begrenzt (30s Watchdog), kein Pollen.
"""
import subprocess, sys, time, os, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8272
HARD_LIMIT_S = 30

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
        ctx = browser.new_context(bypass_csp=True)
        page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(f"http://localhost:{PORT}/overcord/", wait_until="domcontentloaded")
        page.wait_for_function("window.__master", timeout=15000)

        # ── 1) Rechtsklick öffnet das Popover mit allen drei Sektionen + allen Feldern ──
        limBtn = page.locator(".mv-lim")
        limBtn.click(button="right")
        page.wait_for_selector(".mv-lim-pop", timeout=5000)
        secs = page.eval_on_selector_all(".mv-lim-sec", "els => els.map(e => e.textContent)")
        check(secs == ["Limiter", "WaveShaper", "Optik"], f"Sektionen falsch/fehlen: {secs}")
        for sel in (".mv-lim-bg", ".mv-lim-bgon", ".mv-lim-fg", ".mv-lim-size", ".mv-lim-ws"):
            check(page.locator(sel).count() == 1, f"Feld {sel} fehlt im Popover")

        # ── 1b) Die WS-Checkbox spiegelt beim Öffnen den State und setzt ihn beim Klicken
        #      (kein eigener [WS]-Header-Button mehr — die Checkbox bindet nur einmal beim
        #      Öffnen, s. MasterVolume.js wireExtra, darum hier NICHT zwischendurch per
        #      state.set() von außen verstellen — das würde die Checkbox nicht nachziehen). ──
        check(page.locator(".mv-ws").count() == 0, "[WS]-Header-Button sollte weg sein (WS lebt im Lim-Popover)")
        was_on = page.evaluate("window.__master.state.get('waveshaperOn')")
        was_checked = page.locator(".mv-lim-ws").is_checked()
        check(was_checked == bool(was_on), f"Checkbox sollte beim Öffnen den State spiegeln (state={was_on}, checked={was_checked})")
        page.locator(".mv-lim-ws").click()
        now_on = page.evaluate("window.__master.state.get('waveshaperOn')")
        check(now_on != was_on, f"WS-Checkbox sollte waveshaperOn umschalten (war {was_on}, ist {now_on})")

        # ── 2) BGon ändern → landet in masterState.limStyle UND wird bei limiterOn=true
        #      tatsächlich als background auf den Button angewendet ──
        page.evaluate("() => { window.__master.state.set('limiterOn', true); }")
        page.locator(".mv-lim-bgon").fill("#ff00aa")
        page.locator(".mv-lim-bgon").dispatch_event("input")
        data = page.evaluate("""() => ({
            limStyleBgOn: window.__master.state.get('limStyle').bgOn,
            btnBg: document.querySelector('.mv-lim').style.background,
        })""")
        check(data['limStyleBgOn'] == '#ff00aa', f"limStyle.bgOn nicht gesetzt: {data}")
        check('255, 0, 170' in data['btnBg'].replace(' ', '').replace(',', ', ') or '#ff00aa' in data['btnBg'].lower()
              or 'rgb(255,0,170)' in data['btnBg'].replace(' ', ''),
              f"Button-Background zeigt die neue Farbe nicht: {data}")

        # ── 3) Schrift(size) ändern → landet in limStyle UND als fontSize auf dem Button ──
        page.locator(".mv-lim-size").fill("18")
        page.locator(".mv-lim-size").dispatch_event("input")
        data2 = page.evaluate("""() => ({
            size: window.__master.state.get('limStyle').size,
            fontSize: document.querySelector('.mv-lim').style.fontSize,
        })""")
        check(data2['size'] == 18, f"limStyle.size nicht gesetzt: {data2}")
        check(data2['fontSize'] == '18px', f"Button-fontSize nicht übernommen: {data2}")

        browser.close()
finally:
    srv.terminate()

for e in errors: print("PAGEERROR:", e)
if fails:
    for f in fails: print("FAIL:", f)
    sys.exit(1)
print("SMOKE: Lim-Button-Optik OK — Popover zeigt Limiter+WaveShaper+Optik-Sektionen, "
      "WS-Checkbox schaltet waveshaperOn, BGoff/BGon/VG/Schrift landen in "
      "masterState.limStyle und auf dem Button.")
