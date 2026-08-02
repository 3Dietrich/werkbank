#!/usr/bin/env python3
"""Headless-Selbsttest: sehr kurze ADSR-Trigger (A≈0, D=0.01) kommen zuverlässig
bei ihrem Ziel an (ddw.md 20260727, @dpa: "die trigger kommen bei A≈0, D=0.01, nur
ca. 7 von 10 triggern durch, bei D=0.008 noch viel weniger. Das ist für die Env zu
ungenau!").

Root Cause: multiEnv.js flush() (werkbank.js-Render-Loop, ~60fps/~16,7ms) sampelt
engine.read() nur EINMAL pro Frame und überspringt still, solange der gesampelte
Wert unter der Ruheschwelle liegt (Schutz gegen Dauer-Nachfeuern eines schlafenden
Modulators). Bei D=0.01 dauert die GESAMTE Trigger-Kurve (inkl. Outin-Fades) nur
≈10,5ms — kürzer als ein Frame. Landet ein trigger() ungünstig in der Frame-Lücke,
ist die Kurve beim nächsten flush() schon wieder fertig/bei 0: der schon vorhandene
`wasActive`-Übergangsfix (Release-Bugfix) greift NICHT, weil nie ein Übergang
aktiv→still BEOBACHTET wurde — die Env galt zu keinem Sample-Zeitpunkt als aktiv.
Trefferwahrscheinlichkeit ≈ Pulsdauer/Framedauer, passt zu den gemeldeten ~70%/noch
weniger.

Fix (multiEnv.js trigger()+flush(), `_justTriggered`-Flag, analog zu `wasActive`):
jeder trigger() setzt ein Flag, das flush() beim NÄCHSTEN Aufruf als "aktiv"
zählt — unabhängig vom gesampelten Momentanwert. Garantiert mindestens EINE
Auslieferung pro Trigger.

Repro deterministisch (kein Timing-Glücksspiel): trigger() wird aufgerufen und
SOFORT (0ms später, synchron) flush() — das ist exakt der Worst-Case, den ein
rAF-Frame-Offset erzeugen kann (Trigger landet direkt VOR dem flush()-Aufruf,
bevor die Automation-Kurve überhaupt einen Sample gerendert hat).

Lauf: python3 test/adsrTrigPrecision_smoke.py
Hart begrenzt (40s Watchdog), kein Pollen.
"""
import subprocess, sys, time, os, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8217
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
        page = browser.new_page()
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(f"http://localhost:{PORT}/overcord/", wait_until="domcontentloaded")
        page.wait_for_function("window.__env && window.__polysynth && window.__routing", timeout=15000)

        result = page.evaluate("""() => {
            const st = window.__polysynth.state;
            const env = window.__env.mgr.engines[0];

            // @dpas Repro-Werte: A≈0, D=0.01, Trig-Modus, Ziel mit min/max (postQuantMod).
            st.set('adsrA_0', 0.0001); st.set('adsrD_0', 0.01); st.set('adsrS_0', 0.7); st.set('adsrR_0', 0.3);
            st.set('adsrAOn_0', true); st.set('adsrDOn_0', true); st.set('adsrSOn_0', true); st.set('adsrROn_0', true);
            st.set('adsrPeak_0', 1); st.set('adsrTrigMode_0', 'trig');
            st.set('adsrOutput_0', 'polysynth.postQuantMod');

            let deliveries = 0;
            window.__polysynth.engine.setPostModValue = ((orig) => (v) => { deliveries++; orig(v); })(window.__polysynth.engine.setPostModValue);

            // 20x: trigger() dann SOFORT (synchron, 0ms) flush() — Worst-Case-Race.
            const N = 20;
            for (let i = 0; i < N; i++) {
                env.trigger();
                window.__env.mgr.flush();
            }
            return { N, deliveries };
        }""")

        n, deliveries = result["N"], result["deliveries"]
        print(f"trigger()+sofortiges flush(): {deliveries}/{n} Auslieferungen")
        check(deliveries == n,
              f"Nicht jeder Trigger kam beim Ziel an — {deliveries}/{n} (Bug: kurze Trigger gehen "
              f"zwischen zwei flush()-Aufrufen verloren)")

        browser.close()
finally:
    srv.terminate()
    try:
        srv.wait(timeout=5)
    except Exception:
        srv.kill()

for e in errors:
    print("PAGEERROR:", e)
if fails:
    for f in fails:
        print("FAIL:", f)
    sys.exit(1)
print("SMOKE OK: jeder kurze ADSR-Trigger (A≈0, D=0.01) kommt zuverlässig beim Ziel an, auch im Worst-Case-Race mit flush().")
