#!/usr/bin/env python3
"""Headless-Selbsttest Poly-Synth-Scope-Outputs (ddw.md 20260802_234615, "Outs (für scope):
viel zu wenig, bitte diverse Outputs hinzufügen (controls nicht, aber Ausgänge aller Art
(envelopes, OSZ, ..)") — Wave 2 nach dem Master-Bus-Tap-Muster (f17dbe8, Wave 1).

Der Poly-Synth (lib/polysynth/engine.js) meldet ZWEI neue lesbare Output-Ports am Routing-
Modul 'polysynth' an:
  - 'ampEnv': lautester GERADE klingender Voice-Gain (frame-genauer Peak, kein eigener
    AudioNode — polyphon, s. engine.js ampEnvPeak()-Kommentar). hasNode MUSS false/undefined
    sein (bewusste Design-Entscheidung, keine Drift-Gefahr durch doppelt gepflegte Hüllkurven-
    Planung).
  - 'osc': roher Oszillator-Signalwert VOR Damp/ADSR-Gain, über einen stillen Sammel-Node ALLER
    Voice-Oszillatoren (engine.js oscMonitorNode()) — hasNode/node liefern hier einen echten
    GainNode für die "sample"-genaue Kurve am Scope, dasselbe Muster wie master.out.

NUR overcord/ (werkbank-leer hat KEINEN Poly-Synth, s. CLAUDE.md „neutrale Basis ohne Poly-
Synth/Stepsequenzer" — dort gibt es weder das Modul 'polysynth' noch diese Ports).

Test spielt eine Note (noteOn), damit oscMonitorNode() tatsächlich existiert (lazy, erst nach
dem ersten Voice-Spawn) und peak/gain-Werte messbar von 0 verschieden sind.

Lauf: python3 test/polysynthOutputsScope_smoke.py
Hart begrenzt (40s Watchdog), kein Pollen.
"""
import subprocess, sys, time, os, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8272
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
        page.on("pageerror", lambda e: errors.append(f"overcord/: {e}"))
        page.goto(f"http://localhost:{PORT}/overcord/", wait_until="domcontentloaded")
        page.wait_for_function("window.__routing && window.__polysynth", timeout=15000)

        # ── 1) 'polysynth.ampEnv' + 'polysynth.osc' sind als Output-Ports angemeldet ──
        sources = page.evaluate("window.__routing.reg.outputSources().map(s => s.module + '.' + s.port)")
        check('polysynth.ampEnv' in sources, f"polysynth.ampEnv nicht in outputSources(): {sources}")
        check('polysynth.osc' in sources, f"polysynth.osc nicht in outputSources(): {sources}")

        # ── 2) read() liefert VOR dem ersten Ton eine gültige Zahl (0), kein NaN/Crash ──
        v0 = page.evaluate("window.__routing.reg.getValue({ module: 'polysynth', port: 'ampEnv' })")
        check(isinstance(v0, (int, float)) and v0 == v0, f"ampEnv read() vor Ton keine gültige Zahl: {v0}")
        o0 = page.evaluate("window.__routing.reg.getValue({ module: 'polysynth', port: 'osc' })")
        check(isinstance(o0, (int, float)) and o0 == o0, f"osc read() vor Ton keine gültige Zahl: {o0}")

        # ── 3) hasNode-Vertrag: ampEnv OHNE Node (polyphon, bewusst kein Node), osc MIT Node ──
        srcAmp = page.evaluate("window.__routing.reg.outputSources().find(s => s.module === 'polysynth' && s.port === 'ampEnv')")
        check(not srcAmp.get('hasNode'), f"ampEnv sollte hasNode=false/undefined sein (Design-Entscheidung): {srcAmp}")
        srcOsc = page.evaluate("window.__routing.reg.outputSources().find(s => s.module === 'polysynth' && s.port === 'osc')")
        check(bool(srcOsc.get('hasNode')), f"osc sollte hasNode=true sein: {srcOsc}")

        # ── 4) Eine Note spielen (ensureAudio + Voice) → oscMonitorNode() existiert jetzt
        #      wirklich, node() liefert einen echten AudioNode, read() zeigt Bewegung ──
        result = page.evaluate("""() => {
            const eng = window.__polysynth.engine;
            eng.ensureAudio();
            eng.noteOn(60, 100);   // Middle C, volle Velocity
            const src = window.__routing.reg.outputSources().find(s => s.module === 'polysynth' && s.port === 'osc');
            const node = src && typeof src.node === 'function' ? src.node() : null;
            return {
                hasNode: !!node,
                hasGetFloat: !!(node && typeof node.connect === 'function'),
                ampAfter: window.__routing.reg.getValue({ module: 'polysynth', port: 'ampEnv' }),
                heldCount: eng.heldCount(),
            };
        }""")
        check(result['heldCount'] == 1, f"noteOn hat keine Voice gehalten: {result}")
        check(result['hasNode'], f"osc node() liefert nach noteOn() keinen Node: {result}")
        check(result['hasGetFloat'], f"osc node() liefert keinen echten connect()-fähigen AudioNode: {result}")
        check(isinstance(result['ampAfter'], (int, float)) and result['ampAfter'] == result['ampAfter'],
              f"ampEnv read() nach noteOn() keine gültige Zahl: {result}")
        check(result['ampAfter'] > 0, f"ampEnv read() nach noteOn() sollte > 0 sein (Attack läuft): {result}")

        # Aufräumen (kein Panik-Reset nötig, Prozess endet gleich) — allNotesOff aus Hygiene.
        page.evaluate("window.__polysynth.engine.allNotesOff()")

        ctx.close()
        browser.close()
finally:
    srv.terminate()

for e in errors: print("PAGEERROR:", e)
if fails:
    for f in fails: print("FAIL:", f)
    sys.exit(1)
print("SMOKE: Poly-Synth-Scope-Outputs OK — 'polysynth.ampEnv' (frame-Peak, kein Node) + "
      "'polysynth.osc' (roh, mit sample-fähigem Monitor-Node) sind in overcord/ tappbar.")
