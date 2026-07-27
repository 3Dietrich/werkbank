#!/usr/bin/env python3
"""Headless-Selbsttest: ADSR-Release erreicht seinen Ziel-Ruhepunkt zuverlässig
(ddw.md 20260727, @dpa: „das Release ist sehr kurz und das Ende kommt oft NICHT
bei seinem Ziel [PostQuantMod] an. es bleibt irgendwo dazwischen hängen").

Root Cause: multiEnv.js flush() liefert NICHTS mehr, sobald die Env als „schläft"
gilt (Ruhezustand-Schutz gegen Dauer-Nachfeuern, s. Kopf-Kommentar dort). Bei einer
SEHR KURZEN Release-Zeit (hier 13.2ms, @dpas reale Config aus
werkbank-config-20260727084922.json) UND ~16ms Frame-Abstand kann flush() die
komplette Rampe zwischen zwei Aufrufen verpassen — der letzte gesampelte Wert VOR
dem Verstummen landet irgendwo mitten in der Rampe, nie am wahren Ruhepunkt.

Fix (multiEnv.js flush(), `wasActive`-Tracking): beim ÜBERGANG aktiv→still wird
GENAU EINMAL noch der aktuelle (dann faktisch settled) Wert ausgeliefert, bevor es
wie zuvor dauerhaft verstummt.

Repro exakt wie @dpas Setup: Seq (4 Steps [1.5,0,1,0], 1 Step/Beat) auf
polysynth.env_0.gate, A/D=1ms, S=1, R=13.2ms, Gate-Modus, Nullpunktversatz=1,
Ziel=postQuantMod (min -1/max 1) → Ruhepunkt MUSS exakt 1.0 sein (Nullpunkt-Fix
20260727_144x: Nullpunkt ist jetzt der EXAKTE Ruhepunkt, nicht mehr "Ziel-min +
Nullpunkt" — @dpa: "ich verstehe nicht, warum ich für Frequenzänderungen auf
Nullpunkt=2 setzen sollte? Es muss auf 1 enden"), über mehrere Zyklen hinweg
(nicht nur beim ersten Mal).

Lauf: python3 test/adsrReleaseSettle_smoke.py
Hart begrenzt (45s Watchdog), kein Pollen. Audio-Clock (ctx.currentTime) statt
setTimeout für die Zyklen — busy-wait auf reale Audio-Zeit.
"""
import subprocess, sys, time, os, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8213
HARD_LIMIT_S = 45


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
        page.goto(f"http://localhost:{PORT}/", wait_until="domcontentloaded")
        page.wait_for_function("window.__env && window.__polysynth && window.__routing && window.__takt", timeout=15000)

        result = page.evaluate("""async () => {
            const st = window.__polysynth.state;
            const takt = window.__takt.state;
            const env = window.__env.mgr.engines[0];
            const ctx = window.__audioBus.getContext();

            // @dpas exakte Config (werkbank-config-20260727084922.json)
            st.set('adsrA_0', 0.001); st.set('adsrD_0', 0.001); st.set('adsrS_0', 1);
            st.set('adsrR_0', 0.0132);
            st.set('adsrAOn_0', true); st.set('adsrDOn_0', true); st.set('adsrSOn_0', true); st.set('adsrROn_0', true);
            st.set('adsrPeak_0', 1); st.set('adsrInv_0', false);
            st.set('adsrTrigMode_0', 'gate');
            st.set('adsrLenFest_0', true); st.set('adsrLenUnit_0', 'beats'); st.set('adsrLenBeat_0', 1);
            st.set('adsrNullpunkt_0', 1);
            st.set('adsrOutput_0', 'polysynth.postQuantMod');
            takt.set('bpm', 127.30204532467982);

            const beatSec = 60 / takt.get('bpm');
            const waitAudio = (sec) => new Promise((res) => {
                const t1 = ctx.currentTime + sec;
                const check = () => { if (ctx.currentTime >= t1) res(); else requestAnimationFrame(check); };
                check();
            });

            let postQuantModValue = null;
            window.__polysynth.engine.setPostModValue = ((orig) => (v) => { postQuantModValue = v; orig(v); })(window.__polysynth.engine.setPostModValue);

            // 4-Step-Muster wie beim echten Seq 6: on(1.49994), off, on(0.99996), off — über
            // routing.deliver GENAU wie multiSq.js es beim echten Step-Trigger tut.
            const restValues = [];
            for (let cycle = 0; cycle < 6; cycle++) {
                for (let step = 0; step < 4; step++) {
                    const isOn = (step === 0 || step === 2);
                    window.__routing.reg.deliver(
                        { module: 'stepseq', port: 'amp', instance: '_5' },
                        { module: 'polysynth.env_0', port: 'gate' },
                        isOn ? (step === 0 ? 1.49994 : 0.99996) : 0
                    );
                    await waitAudio(beatSec);
                    window.__env.mgr.flush();
                    if (!isOn) restValues.push(postQuantModValue);
                }
            }
            return { restValues };
        }""")

        vals = result["restValues"]
        check(len(vals) == 12, f"Erwartet 12 Ruhepunkt-Messungen, waren {len(vals)}")
        for i, v in enumerate(vals):
            check(v is not None and abs(v - 1.0) < 0.02,
                  f"Ruhepunkt #{i} nicht bei Nullpunktversatz-Ziel (erwartet 1.0, war {v})")

        browser.close()
finally:
    srv.terminate()
    try:
        srv.wait(timeout=5)
    except Exception:
        srv.kill()

if errors:
    print(f"SMOKE: {len(errors)} Konsolen-/Seitenfehler:")
    for e in errors[:10]:
        print("  ", e)
    fails.append("Konsolen-/Seitenfehler aufgetreten")

if fails:
    print(f"SMOKE FAIL ({len(fails)}):")
    for f in fails:
        print("  -", f)
    sys.exit(1)

print("SMOKE OK: ADSR-Release erreicht seinen Ziel-Ruhepunkt zuverlässig (12/12 Zyklen, kurze Release + Sq-Gate).")
