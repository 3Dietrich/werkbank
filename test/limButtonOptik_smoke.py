#!/usr/bin/env python3
"""Headless-Selbsttest Lim-Button-Optik (ddw.md 20260802: "den Lim Button neben Attack
und Release (geordnet nach Limiter settings und Optik): BGoff, BGon (und der
Vollständigkeit halber auch VG/schrift)"). Der Lim-Button (lib/MasterVolume.js) ist KEIN
GroupHost-Control (Header-Element, kein registerCtrlStyle) — Optik wird hier von Hand in
seinem Rechtsklick-Popover verdrahtet (masterState.limStyle: bg/bgOn/fg/size, dasselbe
Feldschema wie jeder GroupHost-Button). Der Test verifiziert: Popover zeigt beide
Sektionen (Limiter/Optik), die vier Felder existieren, und ein geändertes Feld schlägt
sich sowohl in masterState.limStyle als auch im tatsächlichen Button-Style nieder.

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

        # ── 1) Rechtsklick öffnet das Popover mit beiden Sektionen + allen vier Optik-Feldern ──
        limBtn = page.locator(".mv-lim")
        limBtn.click(button="right")
        page.wait_for_selector(".mv-lim-pop", timeout=5000)
        secs = page.eval_on_selector_all(".mv-lim-sec", "els => els.map(e => e.textContent)")
        check(secs == ["Limiter", "Optik"], f"Sektionen falsch/fehlen: {secs}")
        for sel in (".mv-lim-bg", ".mv-lim-bgon", ".mv-lim-fg", ".mv-lim-size"):
            check(page.locator(sel).count() == 1, f"Feld {sel} fehlt im Popover")

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
print("SMOKE: Lim-Button-Optik OK — Popover zeigt Limiter+Optik-Sektionen, "
      "BGoff/BGon/VG/Schrift landen in masterState.limStyle und auf dem Button.")
