#!/usr/bin/env python3
"""Headless-Smoke für dd.md 20260802 (overcord/Poly-synth/Basefreq/Harmonize):
"bei release (GateOff) werden die Töne nicht mehr geupdatet. sollen sie aber".

Bugfix: retuneHeld() lief nur über `held` (aktuell gedrückte Noten) und übersprang
zusätzlich releasing-Voices. Ein noteOff nimmt die Voice sofort aus `held` -> BaseFrq/
harmonizeMix-Änderungen erreichten eine auslaufende Note danach nie mehr. Jetzt läuft
retuneHeld() über `activeVoices` (hält auch auslaufende Voices) ohne releasing-Skip.

Lauf: python3 test/basefreqReleaseUpdate_smoke.py
Hart begrenzt (Watchdog killt nach 40s), kein Pollen.
"""
import subprocess, sys, time, os, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8146
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

        # Deterministisch: baseHz=baseBand=110, harmonizeMix=1 (volles Snap), pitchSmooth=0
        # (harter Sprung, kein Warten aufs Glide), Note klar über der BaseFreq angeschlagen.
        pg.evaluate("""() => {
            const st = window.__polysynth.state;
            st.set('baseSrc', 'Freq');
            st.set('baseHz', 110);
            st.set('baseBand', 110);
            st.set('harmonizeMix', 1);
            st.set('pitchSmooth', 0);
            window.__polysynth.engine.noteOn(84, 100);   // deutlich über BaseFreq=110
        }""")
        time.sleep(0.05)
        before = pg.evaluate("() => window.__polysynth.engine.debugDampGain(84)")
        check(before is not None, f"debugDampGain(84) direkt nach noteOn sollte etwas liefern, war {before}")

        # noteOff -> Voice geht in Release, verlässt `held`.
        pg.evaluate("() => window.__polysynth.engine.noteOff(84)")
        time.sleep(0.02)
        releasing = pg.evaluate("""() => {
            const eng = window.__polysynth.engine;
            return { held: eng.heldCount(), voices: eng.voiceCount() };
        }""")
        check(releasing["held"] == 0, f"nach noteOff sollte held leer sein, war {releasing['held']}")
        check(releasing["voices"] >= 1, f"Voice sollte noch klingen (Release), voiceCount war {releasing['voices']}")

        # BaseFreq WÄHREND des Release ändern -> muss die auslaufende Voice noch erreichen.
        # setValueAtTime(f, audio.currentTime) landet auf der Audio-Renderthread-Zeitachse —
        # der .value-Getter zieht erst nach, sobald der Renderer diesen Zeitpunkt WIRKLICH
        # verarbeitet hat (nicht synchron im selben JS-Tick, s. oscTilt_smoke.py-Vorbild:
        # eigener pg.evaluate() + time.sleep(0.05) VOR dem Lesen, kein Fire-and-read in einem Call).
        pg.evaluate("""() => {
            const st = window.__polysynth.state;
            st.set('baseHz', 130);   // anderes Harmonie-Raster (kein Vielfaches von 110)
            st.set('baseBand', 130);
        }""")
        time.sleep(0.05)
        r = pg.evaluate("() => window.__polysynth.engine.debugDampGain(84)")
        check(r is not None, f"debugDampGain(84) sollte auch für die auslaufende Voice noch etwas liefern, war {r}")
        if r is not None and before is not None:
            check(abs(r[0]["freq"] - before[0]["freq"]) > 1e-6,
                  f"Osc-Freq der auslaufenden Voice sollte sich nach BaseFreq-Änderung ändern: vorher {before[0]['freq']}, nachher {r[0]['freq']}")

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
print("SMOKE OK: BaseFreq/Harmonize aktualisiert auslaufende (releasing) Voices weiter, statt beim noteOff einzufrieren.")
