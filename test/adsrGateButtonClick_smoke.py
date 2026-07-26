#!/usr/bin/env python3
"""Headless-Selbsttest: ECHTER Mausklick auf den Gate-Button (ddw.md 20260726).

Bug-Regression: ADSR_BUTTONS.adsrGate.onClick in lib/polysynth/defs.js rief
`onAction('adsrGate')` fest verdrahtet auf, ohne die Instanz-Endung (`_0`, `_1`, …).
GroupHost ruft onClick aber mit dem ECHTEN indizierten Key auf (`onClick(key, phase)`,
GroupHost.js:580) — werkbank.js' Dispatcher prüft `id.startsWith('adsrGate_')`, was auf
den unindizierten String nie zutraf. Ergebnis: der Gate-Button hat die Env-Engine bei
KEINER Instanz jemals erreicht (@dpa 20260726: "egal wie ich sie starte, bleibt bei 000").
Der bestehende adsrKette_smoke.py testet nur den internen JS-Aufruf
(window.__env.mgr.gateAt(0)) und haette diesen Bug NIE gefangen — dieser Test klickt
das echte DOM-Element.

Zweiter Aspekt: der AudioContext wird von MasterVolume.js frueh (ohne Nutzer-Geste)
angelegt und bleibt bis zum ersten echten Klick 'suspended' — EnvEngine._audio() in
multiEnv.js muss ihn bei Bedarf resumen (wie taktmetro/engine.js und polysynth/engine.js
es schon taten), sonst bleibt jede AudioParam-Automation wirkungslos.

Lauf: python3 test/adsrGateButtonClick_smoke.py
Hart begrenzt (40s Watchdog), kein Pollen.
"""
import subprocess, sys, time, os, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8149
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
        ctx = browser.new_context(bypass_csp=True)
        page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(f"http://localhost:{PORT}/", wait_until="domcontentloaded")
        page.wait_for_function("window.__env && window.__polysynth && window.__routing", timeout=15000)

        ctx_state_before = page.evaluate(
            "() => window.__audioBus.getContext() ? window.__audioBus.getContext().state : 'none'")

        # @dpas Repro-Config (ddw.md 20260726): Peak>1 (klemmt auf 1) + Inv=true, Gate-Modus.
        page.evaluate("""() => {
            const st = window.__polysynth.state;
            st.set('adsrAOn_0', true); st.set('adsrDOn_0', true);
            st.set('adsrSOn_0', true); st.set('adsrROn_0', true);
            st.set('adsrA_0', 0.003); st.set('adsrD_0', 2.5); st.set('adsrS_0', 0.79); st.set('adsrR_0', 1.25);
            st.set('adsrPeak_0', 3.5099); st.set('adsrInv_0', true);
            st.set('adsrTrigMode_0', 'gate');
        }""")

        gate_btn = page.locator('[data-ctrl="b:adsrGate_0"]')
        check(gate_btn.count() == 1, f"Gate-Button [data-ctrl='b:adsrGate_0'] nicht eindeutig im DOM (count={gate_btn.count()})")

        # ECHTER Klick — kein JS-Funktionsaufruf.
        gate_btn.first.click()
        page.wait_for_timeout(150)

        ctx_state_after = page.evaluate("() => window.__audioBus.getContext().state")
        gate_flag = page.evaluate("() => window.__env.mgr.engines[0]._gate")
        v = page.evaluate("() => window.__env.mgr.engines[0].read()")

        # Gate wieder lösen (zweiter echter Klick, sauberer Zustand für Folgetests)
        gate_btn.first.click()
        page.wait_for_timeout(50)
        page.evaluate("() => window.__polysynth.state.set('adsrInv_0', false)")

        print(f"AudioContext state: {ctx_state_before} -> {ctx_state_after}, _gate={gate_flag}, read={v}")
        check(ctx_state_after == 'running',
              f"AudioContext resumt nicht nach echtem Klick (state={ctx_state_after})")
        check(gate_flag is True,
              f"Gate-Button-Klick erreicht envManager.gateAt() nicht (_gate={gate_flag}) — "
              f"onClick-Key-Wiring in defs.js vermutlich wieder unindiziert")
        check(v != 0, f"Engine.read() ist 0 nach echtem Gate-Klick (v={v})")
        check(v < 0, f"Engine.read() sollte bei Inv=true negativ sein (v={v})")

        browser.close()
finally:
    srv.terminate()

for e in errors:
    print("PAGEERROR:", e)
if fails:
    for f in fails:
        print("FAIL:", f)
    sys.exit(1)
print("SMOKE: Gate-Button-Klick OK — echter DOM-Klick erreicht envManager, AudioContext resumt, Env liefert reale negative Werte.")
