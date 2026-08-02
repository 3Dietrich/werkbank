#!/usr/bin/env python3
"""Headless-Selbsttest: zwei @dpa-Klarstellungen vom 20260727_144x.

1) Seq→ADSR-Gate: NEGATIVE Sq-Step-Werte müssen genauso triggern wie positive.
   @dpa: "alles was SeqOut>0 sendet ist Gate Trigger [...] muss ich korrigieren:
   zukünftig != 0. Also alles was nicht 0 ist wird als Gate gesendet [...]
   0 ist der GateOff." Vorher prüfte multiEnv.js' gate-write() nur `v > 0` — ein
   negativer Sq-Wert (z.B. -0.5) schaltete das Gate fälschlich AUS statt AN.

2) Nullpunktversatz ist jetzt der EXAKTE Ruhepunkt, nicht mehr "Ziel-min + Nullpunkt".
   @dpa: "ich verstehe nicht, warum ich für Frequenzänderungen auf Nullpunkt=2
   setzen sollte? Das klingt falsch. Es muss auf 1 enden." Bei Nullpunkt=1 und
   einer Env im Ruhezustand (0) muss der ausgelieferte Wert exakt 1 sein —
   unabhängig vom Ziel-min (hier postQuantMod, min=-1).

Lauf: python3 test/adsrGateNegSeqNullpunkt_smoke.py
Hart begrenzt (40s Watchdog), kein Pollen.
"""
import subprocess, sys, time, os, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8226
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
        page.mouse.click(5, 5)
        page.wait_for_function(
            "() => window.__env.mgr.engines[0]._audio().state === 'running'", timeout=5000)

        # ── 1) Negativer Seq-Wert triggert das Gate (nicht nur v>0) ──
        result1 = page.evaluate("""() => {
            const st = window.__polysynth.state;
            const env = window.__env.mgr.engines[0];
            st.set('adsrTrigMode_0', 'gate'); st.set('adsrAOn_0', true); st.set('adsrDOn_0', false);
            st.set('adsrSOn_0', true); st.set('adsrROn_0', false); st.set('adsrA_0', 0.001);
            // EXAKT der write()-Pfad, den ein Sq-Step nutzt (routing.deliver auf den Gate-Port).
            window.__routing.reg.deliver({ module: 'stepseq', port: 'amp', instance: '_neg' },
                                          { module: 'polysynth.env_0', port: 'gate' }, -0.5);
            const gateAfterNeg = env._gate;
            window.__routing.reg.deliver({ module: 'stepseq', port: 'amp', instance: '_neg' },
                                          { module: 'polysynth.env_0', port: 'gate' }, 0);
            const gateAfterZero = env._gate;
            return { gateAfterNeg, gateAfterZero };
        }""")
        check(result1['gateAfterNeg'] is True,
              f"Negativer Seq-Wert (-0.5) sollte das Gate EINSCHALTEN: {result1}")
        check(result1['gateAfterZero'] is False,
              f"Seq-Wert 0 sollte das Gate AUSSCHALTEN: {result1}")

        # ── 2) Nullpunktversatz ist der exakte Ruhepunkt (nicht Ziel-min + Nullpunkt) ──
        result2 = page.evaluate("""() => {
            const st = window.__polysynth.state;
            const env = window.__env.mgr.engines[0];
            st.set('adsrOutput_0', 'polysynth.postQuantMod');   // min=-1, max=1
            st.set('adsrNullpunkt_0', 1);
            st.set('adsrTrigMode_0', 'trig');
            // "nur A aktiv"-Sonderfall (envCore.js): Attack + 0.5ms lin-down auf 0 — garantiert
            // einen echten Ruhezustand, statt (wie zuvor in diesem Test) mit S an/R aus für
            // immer auf Peak hängen zu bleiben (setValueCurveAtTime hält den letzten Wert).
            st.set('adsrDOn_0', false); st.set('adsrSOn_0', false); st.set('adsrROn_0', false);
            let delivered = null;
            window.__polysynth.engine.setPostModValue = ((orig) => (v) => { delivered = v; orig(v); })(window.__polysynth.engine.setPostModValue);
            // Env im Ruhezustand (nie getriggert bzw. schon abgeklungen) — direkt flushen
            // erzwingt KEINE Auslieferung (wasActive/justTriggered beide false) — also erst
            // kurz triggern und lange genug warten, bis sie sicher wieder bei 0 ist.
            env.trigger();
            return new Promise((res) => setTimeout(() => {
                window.__env.mgr.flush();
                setTimeout(() => { window.__env.mgr.flush(); res({ delivered }); }, 30);
            }, 200));
        }""")
        d = result2['delivered']
        check(d is not None and abs(d - 1.0) < 0.02,
              f"Nullpunkt=1 sollte den Ruhepunkt exakt auf 1.0 legen (Ziel-min=-1 darf keine Rolle mehr spielen), war {d}")

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
print("SMOKE OK: negative Seq-Werte triggern das ADSR-Gate, Nullpunktversatz ist der exakte Ruhepunkt.")
