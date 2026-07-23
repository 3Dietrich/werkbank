#!/usr/bin/env python3
"""Headless-Smoke für Punkt 4 (ddw.md Z.855-856): OSZ-Höhen-Dämpfung (oscTilt).
Lauf: python3 test/oscTilt_smoke.py

Hart begrenzt (Watchdog killt nach 40s), kein Pollen — wie test/phase4a_seqsync_smoke.py.
Prüft die Damp-Gain-Formel + Live-Update (engine.debugTiltGain/debugDampGain):

  · oscTilt=0 → Gain 1 (flach), auch auf sehr hoher Note.
  · oscTilt=100 auf einer Note nah SR/2 → Gain nah 0.
  · oscTilt=200 → Gain 0 (geklemmt, k=2 überschreitet die Nullstelle schon bei SR/4).
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
        pg.goto(f"http://localhost:{PORT}/", wait_until="networkidle", timeout=15000)

        check(pg.evaluate("() => !!window.__polysynth && !!window.__polysynth.engine"),
              "window.__polysynth.engine fehlt")

        # ── 1) Formel isoliert: oscTilt=0/100/200 auf hoher Note (nah SR/2) ──
        r = pg.evaluate("""() => {
            const eng = window.__polysynth.engine;
            const st = window.__polysynth.state;
            const sr = eng.context.sampleRate;
            const highFreq = sr / 2 - 50;   // knapp unter Nyquist
            st.set('oscTilt', 0);
            const g0 = eng.debugTiltGain(highFreq);
            st.set('oscTilt', 100);
            const g100 = eng.debugTiltGain(highFreq);
            st.set('oscTilt', 200);
            const g200 = eng.debugTiltGain(highFreq);
            st.set('oscTilt', 0);
            return { g0, g100, g200 };
        }""")
        check(abs(r["g0"] - 1) < 1e-6, f"oscTilt=0 sollte Gain 1 sein, war {r['g0']}")
        check(r["g100"] < 0.05, f"oscTilt=100 auf ~SR/2 sollte Gain ~0 sein, war {r['g100']}")
        check(r["g200"] == 0, f"oscTilt=200 sollte auf 0 geklemmt sein, war {r['g200']}")

        # ── 2) Live-Update auf einer GEHALTENEN Note (kein neuer Anschlag) ──
        pg.evaluate("""() => {
            window.__polysynth.state.set('oscTilt', 0);
            window.__polysynth.state.set('pitchSmooth', 0);   // harter Sprung, kein Warten aufs Glide nötig
            window.__polysynth.engine.noteOn(108, 100);        // hohe Note, nah SR/2
        }""")
        time.sleep(0.05)
        d0 = pg.evaluate("() => window.__polysynth.engine.debugDampGain(108)")
        check(d0 is not None and abs(d0[0]["gain"] - 1) < 1e-6, f"frisch angeschlagen bei oscTilt=0 sollte Damp-Gain 1 sein, war {d0}")

        pg.evaluate("() => window.__polysynth.state.set('oscTilt', 200)")
        time.sleep(0.05)
        d200 = pg.evaluate("""() => {
            const eng = window.__polysynth.engine;
            const d = eng.debugDampGain(108);
            return d ? d.map((x) => ({ ...x, expected: eng.debugTiltGain(x.freq) })) : null;
        }""")
        check(d200 is not None, f"debugDampGain(108) nach oscTilt=200 lieferte null: {d200}")
        if d200 is not None:
            for x in d200:
                check(abs(x["gain"] - x["expected"]) < 1e-6,
                      f"nach Live-Umstellen auf oscTilt=200 sollte Damp-Gain der Formel folgen (gehaltene Note, kein Neuanschlag): {x}")
            check(d200[0]["gain"] < d0[0]["gain"], f"Damp-Gain sollte bei oscTilt=200 kleiner sein als bei 0: {d0} vs {d200}")

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
print("SMOKE OK: oscTilt (Punkt 4) — Formel korrekt (0/100/200), Live-Update auf gehaltener Note bestätigt.")
