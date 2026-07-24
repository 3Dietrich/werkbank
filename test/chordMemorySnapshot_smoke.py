#!/usr/bin/env python3
"""Headless-Smoke: ChordMemory-Inhalt (akMemory/akMemLabels) landet im Gruppen-Snapshot
der Poly-Synth-Gruppe "Keyboard" (ddw.md @dpa 20260724: "alles dabei ... auch der Inhalt
vom Speicher"). Lauf: python3 test/chordMemorySnapshot_smoke.py

Hart begrenzt (Watchdog killt nach 40s), kein Pollen. Verifiziert den Escape-Hatch
`extraSoundKeys` (lib/polysynth/defs.js, Gruppe "Keyboard") — ohne ihn würde der generische
DOM-Automatismus (data-ctrl → State-Key) akMemory/akMemLabels NICHT finden, weil sie am
Unikat-Control 'u:speicher' hängen, dessen ID zu key='speicher' parst.
"""
import subprocess, sys, time, os, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8153
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
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": 1600, "height": 1100})
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.goto(f"http://localhost:{PORT}/", wait_until="networkidle", timeout=15000)

        # ── Akkord-Speicher-Inhalt setzen (direkt im State, wie ChordMemory.js es täte) ──
        pg.evaluate("""() => {
            const s = window.__polysynth.state;
            s.set('akMemory', [[{note:60, vel:100}], null, null]);
            s.set('akMemLabels', {0: 'Cmaj'});
        }""")

        list_len = pg.evaluate("() => window.__polysynth.host.saveGroupSnap('Keyboard', 'Mit Akkord').length")
        check(list_len == 1, f"saveGroupSnap sollte 1 Eintrag liefern, war {list_len}")
        snap = pg.evaluate("() => (window.__polysynth.state.get('groupSnaps')||{})['Keyboard'][0]")
        check('akMemory' in snap['values'], f"Snapshot sollte akMemory enthalten: {list(snap['values'].keys())!r}")
        check('akMemLabels' in snap['values'], f"Snapshot sollte akMemLabels enthalten: {list(snap['values'].keys())!r}")
        check(snap['values']['akMemLabels'].get('0') == 'Cmaj', f"akMemLabels-Inhalt falsch: {snap['values']['akMemLabels']!r}")

        # ── Speicher leeren, Recall holt ihn zurück ──
        pg.evaluate("() => { window.__polysynth.state.set('akMemory', []); window.__polysynth.state.set('akMemLabels', {}); }")
        ok = pg.evaluate("() => window.__polysynth.host.recallGroupSnap('Keyboard', 0)")
        check(ok is True, "recallGroupSnap sollte true liefern")
        mem_after = pg.evaluate("() => window.__polysynth.state.get('akMemory')")
        check(len(mem_after) == 3 and mem_after[0] is not None, f"akMemory sollte nach Recall wieder den Akkord haben: {mem_after!r}")

        # ── Aufräumen ──
        pg.evaluate("() => window.__polysynth.host.deleteGroupSnap('Keyboard', 0)")
        pg.evaluate("() => { window.__polysynth.state.set('akMemory', []); window.__polysynth.state.set('akMemLabels', {}); }")

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
print("SMOKE OK: ChordMemory-Inhalt (extraSoundKeys) landet im Gruppen-Snapshot 'Keyboard'.")
