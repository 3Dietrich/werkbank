#!/usr/bin/env python3
"""Headless-Smoke für dd.md 20260802: "bei zu langem Amp release! OSZ Poly=36, Rel auf <1
läuft bei jedem Tempo, Rel höher drehen und es wird unrhythmisch und noch höher wiederholt
es Step 1. Das selbe passiert auch bei Poly=128."

Selbst eingebauter Regressions-Bug aus demselben Chat: der Amp-Env-Umbau auf AdsrCore
(envCore.js) erzeugte pro Note ein Float32Array mit Release-Sekunden×Samplerate Einträgen,
JS-generiert bei JEDEM Anschlag/Loslassen — bei hoher Polyphonie + langem Release genug
CPU-Last, um den Audio-Thread/Scheduler (Sequenzer-Takt!) ins Stottern/Hängen zu bringen.

Fix (engine.js ampCfgIsNative/scheduleAmpTriggerNative/scheduleAmpReleaseNative): bei
Standard-Einstellungen (Skew=1, kein Invert — der weitaus häufigste Fall) läuft das Amp-Env
über billige native WebAudio-Ramps statt der Array-Kurve. Dieser Test nagelt die
PERFORMANCE fest (nicht nur die Korrektheit, die deckt ampEnvAdsrCore_smoke.py schon ab):
40 Voices, Release=5s, Poly=128 müssen in << 1s an-/abklingen, nicht in ~5-6s wie vorher
gemessen (Faktor ~8000 durch den Array-Pfad).

Lauf: python3 test/ampEnvNativeFastpath_smoke.py
Hart begrenzt (Watchdog killt nach 40s), kein Pollen.
"""
import subprocess, sys, time, os, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8164
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
        b = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        pg = b.new_page()
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.goto(f"http://localhost:{PORT}/overcord/", wait_until="networkidle", timeout=15000)

        r = pg.evaluate("""() => {
            const eng = window.__polysynth.engine;
            const st = window.__polysynth.state;
            st.set('polyMax', 128);
            st.set('voiceSteal', true);
            st.set('adsrA', 0.01);
            st.set('adsrD', 0.15);
            st.set('adsrS', 0.7);
            st.set('adsrR', 5);    // @dpas Report: "Rel höher drehen"
            st.set('adsrASkew', 1); st.set('adsrDSkew', 1); st.set('adsrRSkew', 1);
            st.set('adsrInv', false);
            // Native Fastpath gilt nur für den unveränderten Default (Modus=gate, Fest=aus,
            // s. engine.js ampCfgIsNative) — explizit setzen, falls ein vorheriger Testlauf
            // (oder eine geladene Config) etwas anderes hinterlassen hat.
            st.set('adsrTrigMode', 'gate'); st.set('adsrLenFest', false);
            st.set('osc2On', false);
            const t0 = performance.now();
            for (let n = 40; n < 80; n++) eng.noteOn(n, 100);   // 40 Voices
            const t1 = performance.now();
            for (let n = 40; n < 80; n++) eng.noteOff(n);
            const t2 = performance.now();
            return { spawnMs: t1 - t0, releaseMs: t2 - t1, voices: eng.voiceCount() };
        }""")
        check(r["voices"] == 40, f"erwartet 40 klingende Voices, war {r['voices']}")
        # Großzügige Schwelle (Headless-Sandbox ist selbst nicht schnell) — der alte Array-Pfad
        # lag bei ~5700ms für releaseMs allein, der native Pfad bei <5ms. 500ms Schranke lässt
        # jede realistische Maschine locker durch, würde aber die alte Regression zuverlässig fangen.
        check(r["spawnMs"] < 500, f"40× noteOn(Release=5s,Poly=128) sollte <500ms dauern (nativer Pfad), war {r['spawnMs']}ms")
        check(r["releaseMs"] < 500, f"40× noteOff(Release=5s,Poly=128) sollte <500ms dauern (nativer Pfad), war {r['releaseMs']}ms — Array-Pfad-Regression?")

        errs = [e for e in errors if "favicon" not in e.lower()]
        check(len(errs) == 0, f"Console-/Page-Errors: {errs}")

except Exception as e:
    fails.append(f"Exception: {e}")
finally:
    srv.terminate()

if fails:
    print("SMOKE FAIL:")
    for f in fails:
        print(" -", f)
    sys.exit(1)
print("SMOKE OK: Amp-Env bei Standard-Skew läuft über native Ramps — 40 Voices/Release=5s/Poly=128 in <500ms statt ~5-6s.")
