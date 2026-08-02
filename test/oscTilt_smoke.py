#!/usr/bin/env python3
"""Headless-Smoke für Punkt 4 (ddw.md 20260724_003531 — KORRIGIERTE Formel gegenüber dem
ersten Versuch): OSZ-Höhen-Dämpfung als Amp-Verhältnis jeder Note ZUR BASEFREQ.
Lauf: python3 test/oscTilt_smoke.py

Hart begrenzt (Watchdog killt nach 40s), kein Pollen — wie test/phase4a_seqsync_smoke.py.
Formel (@dpa wörtlich): ratio = freq/baseFreq, gain = ratio^(-tilt/100).
  · tilt=0 → gain 1, unabhängig vom Verhältnis.
  · tilt=100 → gain = 1/ratio (exakt @dpas Beispiel: ratio=34.56 → 1/34.56).
  · tilt=200 → gain = 1/ratio² (kleiner, „kommt der Null immer näher, erreicht sie nie").
  · Live-Update: oscTilt während gehaltener Note verstellen → debugDampGain(note) zieht
    SOFORT nach (nach kurzer Wartezeit wegen pitchSmooth-Glide), ohne neuen Anschlag.
"""
import subprocess, sys, time, os, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8145
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
        pg = b.new_page(viewport={"width": 1400, "height": 900})
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.goto(f"http://localhost:{PORT}/overcord/", wait_until="networkidle", timeout=15000)

        check(pg.evaluate("() => !!window.__polysynth && !!window.__polysynth.engine"),
              "window.__polysynth.engine fehlt")

        # Deterministische BaseFreq: baseHz=baseBand=110 → foldToBand lässt 110 unverändert.
        r = pg.evaluate("""() => {
            const eng = window.__polysynth.engine;
            const st = window.__polysynth.state;
            st.set('baseSrc', 'Freq');
            st.set('baseHz', 110);
            st.set('baseBand', 110);
            const freq = 110 * 34.56;   // ratio = 34.56, @dpas eigenes Beispiel
            st.set('oscTilt', 0);
            const g0 = eng.debugTiltGain(freq);
            st.set('oscTilt', 100);
            const g100 = eng.debugTiltGain(freq);
            st.set('oscTilt', 200);
            const g200 = eng.debugTiltGain(freq);
            st.set('oscTilt', 0);
            return { bf: eng.baseFreq(), g0, g100, g200 };
        }""")
        check(abs(r["bf"] - 110) < 1e-6, f"baseFreq() sollte 110 sein, war {r['bf']}")
        check(abs(r["g0"] - 1) < 1e-6, f"tilt=0 sollte Gain 1 sein, war {r['g0']}")
        check(abs(r["g100"] - 1 / 34.56) < 1e-6, f"tilt=100 sollte Gain 1/34.56 sein, war {r['g100']}")
        check(abs(r["g200"] - 1 / (34.56 ** 2)) < 1e-6, f"tilt=200 sollte Gain 1/34.56² sein, war {r['g200']}")
        check(r["g200"] < r["g100"] < r["g0"], f"Gain sollte mit steigendem tilt monoton fallen: {r}")

        # Note GENAU auf der BaseFreq (ratio=1) bleibt bei JEDEM tilt unangetastet.
        r2 = pg.evaluate("""() => {
            const eng = window.__polysynth.engine;
            const st = window.__polysynth.state;
            st.set('oscTilt', 150);
            const g = eng.debugTiltGain(110);
            st.set('oscTilt', 0);
            return g;
        }""")
        check(abs(r2 - 1) < 1e-6, f"ratio=1 (Note == BaseFreq) sollte immer Gain 1 sein, war {r2}")

        # ── Live-Update auf einer GEHALTENEN Note (kein neuer Anschlag) ──
        pg.evaluate("""() => {
            window.__polysynth.state.set('oscTilt', 0);
            window.__polysynth.state.set('pitchSmooth', 0);   // harter Sprung, kein Warten aufs Glide nötig
            window.__polysynth.state.set('harmonizeMix', 0);  // rohe Note, keine BaseFreq-Rasterung
            window.__polysynth.engine.noteOn(108, 100);        // hohe Note, klar über BaseFreq=110
        }""")
        time.sleep(0.05)
        d0 = pg.evaluate("() => window.__polysynth.engine.debugDampGain(108)")
        check(d0 is not None and abs(d0[0]["gain"] - 1) < 1e-6, f"frisch angeschlagen bei oscTilt=0 sollte Damp-Gain 1 sein, war {d0}")

        pg.evaluate("() => window.__polysynth.state.set('oscTilt', 100)")
        time.sleep(0.05)
        d100 = pg.evaluate("""() => {
            const eng = window.__polysynth.engine;
            const d = eng.debugDampGain(108);
            return d ? d.map((x) => ({ ...x, expected: eng.debugTiltGain(x.freq) })) : null;
        }""")
        check(d100 is not None, f"debugDampGain(108) nach oscTilt=100 lieferte null: {d100}")
        if d100 is not None:
            for x in d100:
                check(abs(x["gain"] - x["expected"]) < 1e-6,
                      f"nach Live-Umstellen auf oscTilt=100 sollte Damp-Gain der Formel folgen (gehaltene Note, kein Neuanschlag): {x}")
            check(d100[0]["gain"] < d0[0]["gain"], f"Damp-Gain sollte bei oscTilt=100 kleiner sein als bei 0: {d0} vs {d100}")

        pg.evaluate("() => window.__polysynth.engine.noteOff(108)")
        time.sleep(0.05)

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
print("SMOKE OK: oscTilt (Ratio-zur-BaseFreq-Formel) — 0/100/200 korrekt, ratio=1 unangetastet, Live-Update auf gehaltener Note.")
