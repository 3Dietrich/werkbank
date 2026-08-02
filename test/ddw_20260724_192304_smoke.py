#!/usr/bin/env python3
"""Headless-Smoke: ddw.md @dpa 20260724_192304 (3 neue Punkte nach dem Combo/Steps-Fix
vom selben Tag, s. seqOutputTailComboExclude_smoke.py für den vorherigen Teil).

Prüft:
  1. StepSeq/StepSeq/`Steps` (u:seqGrid): Hover übers Canvas zeigt Step-Nummer + Wert
     (.seq-drag-val), OHNE dass die normale Hilfe-Blase (HintBubble, .hint-bubble)
     erscheint — @dpa: "mouseover hier ohne hilfe, sondern stattdessen (auch bei
     Hint=off) die Step nummer und sein Value anzeigen".
  2. Metronom: Beat-Anzeige pulsiert auf der 1 (d-Env-Gefühl: hart an, dann fadet sie).
     GroupHost.setBeat('u:beatView', 0) muss dem ersten Punkt SOFORT 'beat-pulse'
     geben, das nach ~16ms zu 'beat-pulse-fade' wechselt (Trigger-Flash-Pattern wie
     bei makeButton()/.btn-fade).
  3. Bugfix "lautes Getöse": 2 (simulierte) Sq-Quellen, die BEIDE PolySynth → "Note
     (KB)" als Ziel wählen, dürfen sich nicht gegenseitig die Note abreißen (vorher:
     eine einzige geteilte _seqNote-Variable in PlayKeyboard.js riss dem jeweils
     anderen Klon die Note weg, sobald er selbst feuerte — Wippe zwischen zwei Tönen,
     klang als Getöse). Jetzt: srcId-Gedächtnis pro Quelle (Registry.js deliver(),
     PlayKeyboard.js _seqNotes, engine.js _trigHeldNotes).

Lauf: python3 test/ddw_20260724_192304_smoke.py
Hart begrenzt (Watchdog killt nach 40s), kein Pollen.
"""
import subprocess, sys, time, os, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8220
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
        pg = b.new_page(viewport={"width": 1600, "height": 1100})
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.goto(f"http://localhost:{PORT}/overcord/", wait_until="networkidle", timeout=15000)

        # ── 1) Steps-Hover: Nummer+Wert statt Hilfe-Blase ──
        pg.evaluate("""() => {
            window.__stepseq.state.set('seqSteps_0', [0.5, null, 0.75, 0, 0.25, null, 1, 0]);
        }""")
        cv = pg.locator('.group[data-group="Stepsequenzer"] .seq-canvas').first
        box = cv.bounding_box()
        # Step 0 liegt in den ersten 1/8 der Canvas-Breite (8 Steps default seqLen).
        cv.hover(position={"x": box["width"] * 0.05, "y": box["height"] * 0.5})
        time.sleep(0.6)   # länger als HintBubble._delay (450ms) — Blase MUSS trotzdem ausbleiben
        hover_info = pg.evaluate("""() => {
            const dv = document.querySelector('.group[data-group="Stepsequenzer"] .seq-drag-val');
            const bubble = document.querySelector('.hint-bubble');
            return { text: dv ? dv.textContent : null, hidden: dv ? dv.hidden : null, bubblePresent: !!bubble };
        }""")
        check(hover_info['hidden'] is False, f".seq-drag-val sollte beim Hover sichtbar sein, war hidden={hover_info['hidden']}")
        check(hover_info['text'] is not None and hover_info['text'].startswith('#1'),
              f".seq-drag-val sollte mit Step-Nummer '#1' beginnen, war {hover_info['text']!r}")
        check('0.5' in (hover_info['text'] or ''), f".seq-drag-val sollte den Step-Wert (0.5) zeigen, war {hover_info['text']!r}")
        check(hover_info['bubblePresent'] is False, "Hilfe-Blase (.hint-bubble) sollte beim Steps-Hover NICHT erscheinen")

        # Maus weg → Label verschwindet wieder.
        pg.mouse.move(5, 5)
        time.sleep(0.1)
        after_leave = pg.evaluate("""() => {
            const dv = document.querySelector('.group[data-group="Stepsequenzer"] .seq-drag-val');
            return dv ? dv.hidden : null;
        }""")
        check(after_leave is True, f".seq-drag-val sollte nach mouseleave wieder hidden sein, war {after_leave}")

        # ── 2) Metronom-Puls auf der 1 ──
        pg.evaluate("() => window.__takt.host.setBeat('u:beatView', 0)")
        pulse_now = pg.evaluate("""() => {
            const dot = document.querySelector('.group[data-group="Takt / Metronom"] .beat-view .beat-dot');
            return dot ? [...dot.classList] : null;
        }""")
        check(pulse_now is not None and 'beat-pulse' in pulse_now, f"Hauptbeat-Punkt sollte sofort 'beat-pulse' tragen, war {pulse_now}")
        time.sleep(0.08)
        pulse_faded = pg.evaluate("""() => {
            const dot = document.querySelector('.group[data-group="Takt / Metronom"] .beat-view .beat-dot');
            return dot ? [...dot.classList] : null;
        }""")
        check(pulse_faded is not None and 'beat-pulse-fade' in pulse_faded and 'beat-pulse' not in pulse_faded,
              f"Hauptbeat-Punkt sollte nach ~16ms zu 'beat-pulse-fade' wechseln (und 'beat-pulse' verlieren), war {pulse_faded}")

        # Nicht-Hauptbeat (i!==0) pulst NICHT (Regression).
        pg.evaluate("() => window.__takt.host.setBeat('u:beatView', 1)")
        other = pg.evaluate("""() => {
            const dots = [...document.querySelectorAll('.group[data-group="Takt / Metronom"] .beat-view .beat-dot')];
            return dots[1] ? [...dots[1].classList] : null;
        }""")
        check(other is not None and 'beat-pulse' not in other, f"Nebenbeat sollte NIE 'beat-pulse' tragen, war {other}")

        # ── 3) Bugfix "lautes Getöse": 2 Sq-Quellen auf PolySynth → Note (KB) klauen sich nicht die Note ──
        state = pg.evaluate("""() => {
            const routing = window.__routing.reg;
            const engine = window.__polysynth.engine;
            engine.allNotesOff();
            const dst = { module: 'polysynth', port: 'note' };
            routing.deliver({ module: 'stepseq', port: 'amp', instance: '_A' }, dst, 60);
            const afterA = { held: engine.heldCount(), n60: !!engine.debugDampGain(60) };
            routing.deliver({ module: 'stepseq', port: 'amp', instance: '_B' }, dst, 64);
            const afterB = { held: engine.heldCount(), n60: !!engine.debugDampGain(60), n64: !!engine.debugDampGain(64) };
            // Quelle A feuert erneut mit neuer Note: löst NUR ihre EIGENE alte Note ab (60), B (64) bleibt unberührt.
            routing.deliver({ module: 'stepseq', port: 'amp', instance: '_A' }, dst, 67);
            const afterA2 = { held: engine.heldCount(), n60: !!engine.debugDampGain(60), n64: !!engine.debugDampGain(64), n67: !!engine.debugDampGain(67) };
            engine.allNotesOff();
            return { afterA, afterB, afterA2 };
        }""")
        check(state['afterA']['held'] == 1 and state['afterA']['n60'], f"Nach Quelle A (Note 60) sollte genau 1 Note gehalten sein: {state['afterA']}")
        check(state['afterB']['held'] == 2, f"Nach Quelle B (Note 64) sollten BEIDE Noten gehalten sein (kein gegenseitiges Stehlen), war {state['afterB']}")
        check(state['afterB']['n60'], f"Quelle A's Note 60 sollte von Quelle B's Trigger UNBERÜHRT bleiben: {state['afterB']}")
        check(state['afterB']['n64'], f"Quelle B's Note 64 sollte gehalten sein: {state['afterB']}")
        check(state['afterA2']['held'] == 2, f"Nach Quelle A's Retrigger (67) sollten weiter genau 2 Noten gehalten sein (A:67, B:64), war {state['afterA2']}")
        check(not state['afterA2']['n60'], f"Quelle A's ALTE Note (60) sollte durch ihren eigenen Retrigger abgelöst sein: {state['afterA2']}")
        check(state['afterA2']['n67'], f"Quelle A's NEUE Note (67) sollte gehalten sein: {state['afterA2']}")
        check(state['afterA2']['n64'], f"Quelle B's Note (64) sollte vom Retrigger der Quelle A UNBERÜHRT bleiben: {state['afterA2']}")

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
print("SMOKE OK: Steps-Hover zeigt Nummer+Wert ohne Hilfe-Blase; Metronom pulst auf der 1; 2 Sq-Quellen auf PolySynth-Note (KB) stehlen sich nicht mehr die Note.")
