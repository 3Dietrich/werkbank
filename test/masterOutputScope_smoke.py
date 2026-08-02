#!/usr/bin/env python3
"""Headless-Selbsttest Master-Bus-Output-Tap (ddw.md 20260802, "Ein-/Ausgänge-Kette",
Wave 1): der Master-Bus (lib/audioBus.js) meldet sich als Routing-Modul 'master' mit
EINEM lesbaren Output-Port 'out' an — Zweck: der Scope kann jetzt in die Master-Kette
reinschauen, um zu entscheiden, was am Limiter clippt (@dpa: "will zunächst das Signal
am Scope sehen können"). Der Port zeigt via hasNode/node() auf GENAU denselben
Analyser, den auch audioBus.js' eigener getAnalyser() nutzt — der hängt dort schon
automatisch um (nach dem Limiter bei [Lim] an, direkt nach dem Fader bei [Lim] aus).
Der Test verifiziert: Port ist da, read() liefert eine Zahl, node() liefert denselben
AnalyserNode wie getAnalyser() — in BEIDEN Ensembles (overcord/ + werkbank-leer/), da
audioBus.js gemeinsamer Code ist, aber jedes Ensemble seine eigene Registry-Instanz hat.

Lauf: python3 test/masterOutputScope_smoke.py
Hart begrenzt (30s Watchdog), kein Pollen.
"""
import subprocess, sys, time, os, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8271
HARD_LIMIT_S = 30

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
        for entry in ("overcord/", "werkbank-leer/"):
            ctx = browser.new_context(bypass_csp=True)
            page = ctx.new_page()
            page.on("pageerror", lambda e: errors.append(f"{entry}: {e}"))
            page.goto(f"http://localhost:{PORT}/{entry}", wait_until="domcontentloaded")
            page.wait_for_function("window.__routing && window.__audioBus", timeout=15000)

            # ── 1) 'master' ist als Routing-Modul mit Output-Port 'out' angemeldet ──
            sources = page.evaluate("window.__routing.reg.outputSources().map(s => s.module + '.' + s.port)")
            check('master.out' in sources, f"{entry}: master.out nicht in outputSources(): {sources}")

            # ── 2) read() liefert eine gültige Zahl (kein NaN/undefined) — auch VOR dem
            #      ersten Ton (Analyser evtl. noch nicht angelegt, read() muss dann 0 liefern
            #      statt zu crashen) ──
            val = page.evaluate("window.__routing.reg.getValue({ module: 'master', port: 'out' })")
            check(isinstance(val, (int, float)) and val == val, f"{entry}: read() liefert keine gültige Zahl: {val}")

            # ── 3) node() zeigt auf GENAU denselben AnalyserNode wie audioBus.getAnalyser()
            #      (erst NACH ensureAudio(), sonst existiert der Analyser noch nicht) — das ist
            #      der Knoten, der bei [Lim] an/aus automatisch umhängt, s. audioBus.js ──
            same = page.evaluate("""() => {
                window.__audioBus.getContext ? null : null;
                if (window.__takt && window.__takt.engine && window.__takt.engine.ensureAudio) {
                    window.__takt.engine.ensureAudio();
                }
                const a1 = window.__audioBus.getAnalyser();
                const src = window.__routing.reg.outputSources().find(s => s.module === 'master' && s.port === 'out');
                const a2 = src && typeof src.node === 'function' ? src.node() : null;
                return { hasA1: !!a1, sameRef: a1 === a2, hasGetFloat: !!(a2 && typeof a2.getFloatTimeDomainData === 'function') };
            }""")
            check(same['hasA1'], f"{entry}: audioBus.getAnalyser() lieferte nichts nach ensureAudio(): {same}")
            check(same['sameRef'], f"{entry}: master.out node() zeigt NICHT auf denselben Analyser wie getAnalyser(): {same}")
            check(same['hasGetFloat'], f"{entry}: node() liefert keinen echten AnalyserNode: {same}")

            ctx.close()
        browser.close()
finally:
    srv.terminate()

for e in errors: print("PAGEERROR:", e)
if fails:
    for f in fails: print("FAIL:", f)
    sys.exit(1)
print("SMOKE: Master-Bus-Output-Tap OK — 'master.out' scope-tappbar in overcord/ + "
      "werkbank-leer/, node() zeigt auf denselben Analyser wie audioBus.getAnalyser().")
