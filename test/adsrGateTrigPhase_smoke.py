#!/usr/bin/env python3
"""Headless-Regressionstest: ⏵-Button triggert bei btnMode='gate' NICHT erst beim
Loslassen (ddw.md 20260727: "Der > Button triggert (plötzlich?) bei 'release' ?? man
drückt ihn - nichts passiert, man released ihn - trigger..").

Root Cause: steht der Gate-Button per Element-Settings auf btnMode='gate' (statt dem
defs.js-Default 'trigger'), feuert GroupHost.js' mousedown-Handler fire('down') SOFORT
und registriert einen mouseup-Listener, der fire('up') feuert. Beide Aufrufe liefen
bis hierhin OHNE Phase durch onAction() zu envManager.gateAt(i) — im TRIG-Modus rief
gateAt() bei JEDEM Aufruf unconditional eng.trigger() auf. Der zweite (Release-)Aufruf
canceLte per cancelScheduledValues() die kaum begonnene erste (Press-)Kurve, bevor sie
hörbar/sichtbar wurde — es sah so aus, als würde erst das Loslassen triggern.

Fix: phase ('down'/'up') wird jetzt durchgereicht (defs.js → werkbank.js → gateAt());
im Trig-Modus wird 'up' ignoriert, getriggert wird ausschließlich bei 'down'.

Lauf: python3 test/adsrGateTrigPhase_smoke.py
Hart begrenzt (40s Watchdog), kein Pollen.
"""
import subprocess, sys, time, os, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8151
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
        page.goto(f"http://localhost:{PORT}/overcord/", wait_until="domcontentloaded")
        page.wait_for_function("window.__env && window.__polysynth && window.__routing", timeout=15000)

        # Trig-Modus (Default) + Button per Element-Settings auf btnMode='gate' gestellt
        # (@dpas Repro-Config: b:adsrGate_0 => {btnMode: 'gate', ...}).
        page.evaluate("""() => {
            const st = window.__polysynth.state;
            st.set('adsrAOn_0', true); st.set('adsrDOn_0', true);
            st.set('adsrSOn_0', true); st.set('adsrROn_0', true);
            st.set('adsrA_0', 0.01); st.set('adsrD_0', 0.15); st.set('adsrS_0', 0.7); st.set('adsrR_0', 0.3);
            st.set('adsrPeak_0', 1); st.set('adsrTrigMode_0', 'trig');
            const cs = { ...(st.get('ctrlStyles') || {}) };
            cs['b:adsrGate_0'] = { ...(cs['b:adsrGate_0'] || {}), btnMode: 'gate' };
            st.set('ctrlStyles', cs);
            window.__polysynth.host.reapplyCtrlStyles(['b:adsrGate_0']);
            // Spy: zaehlt trigger()-Aufrufe UND wann relativ zu mousedown/mouseup sie kamen.
            const eng = window.__env.mgr.engines[0];
            window.__trigLog = [];
            const orig = eng.trigger.bind(eng);
            eng.trigger = () => { window.__trigLog.push(performance.now()); orig(); };
        }""")

        gate_btn = page.locator('[data-ctrl="b:adsrGate_0"] button')
        check(gate_btn.count() == 1, f"Gate-Button-<button> nicht eindeutig im DOM (count={gate_btn.count()})")
        gate_btn.first.scroll_into_view_if_needed()
        box = gate_btn.first.bounding_box()
        check(box is not None, "Gate-Button hat keine bounding_box (nicht sichtbar?)")

        cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
        page.mouse.move(cx, cy)
        page.mouse.down()
        t_down = page.evaluate("() => performance.now()")
        page.wait_for_timeout(120)   # Press gehalten — Trigger MUSS jetzt schon passiert sein
        trig_count_while_held = page.evaluate("() => window.__trigLog.length")
        page.mouse.up()
        page.wait_for_timeout(80)
        trig_count_after_release = page.evaluate("() => window.__trigLog.length")
        trig_log = page.evaluate("() => window.__trigLog")

        print(f"trigLog={trig_log}, t_down~={t_down:.0f}, "
              f"count_while_held={trig_count_while_held}, count_after_release={trig_count_after_release}")

        check(trig_count_while_held == 1,
              f"Trigger kam nicht (schon) beim Drücken — count_while_held={trig_count_while_held} "
              f"(Bug: 'triggert erst bei Release')")
        check(trig_count_after_release == 1,
              f"Loslassen loeste einen ZWEITEN Trigger aus (count_after_release={trig_count_after_release}) "
              f"— im Trig-Modus darf 'up' nicht erneut triggern")

        browser.close()
finally:
    srv.terminate()

for e in errors:
    print("PAGEERROR:", e)
if fails:
    for f in fails:
        print("FAIL:", f)
    sys.exit(1)
print("SMOKE: adsrGate-Button (btnMode='gate', Trig-Modus) triggert genau EINMAL bei Press, nicht bei Release.")
