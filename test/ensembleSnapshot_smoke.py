#!/usr/bin/env python3
"""Headless-Smoke für den Header-Ensemble-Snapshot (ddw.md @dpa 20260724, vierte Ebene:
"header Ensemble Snapshots"). Lauf: python3 test/ensembleSnapshot_smoke.py

Hart begrenzt (Watchdog killt nach 40s), kein Pollen.
  · Header zeigt das Ensemble-PickMenu (⭐-Knopf).
  · Save/Recall wirkt über MEHRERE Instrumente hinweg (Takt-BPM + Poly-Synth-adsrA).
  · Master-Volume bleibt vom Snapshot unberührt (@dpa Antwort 3: "Master Fader bleibt extra").
  · 'werkbank_ensemble' liegt in LS_KEYS (Config-Export nimmt Ensemble-Snapshots mit).
"""
import subprocess, sys, time, os, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8155
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
        pg.goto(f"http://localhost:{PORT}/overcord/", wait_until="networkidle", timeout=15000)

        check(pg.evaluate("() => !!window.__ensemble && !!window.__ensemble.store"), "window.__ensemble.store fehlt")

        # ── Header-PickMenu ist da ──
        menu_btn = pg.locator('.topbar [data-ctrl="hdr:ensemble"] .pm-btn')
        check(menu_btn.count() >= 1, f"Ensemble-PickMenu-Knopf fehlt im Header, count={menu_btn.count()}")

        # ── 'werkbank_ensemble' in LS_KEYS (buildConfig greift es mit, sobald was drinsteht) ──
        pg.evaluate("() => window.__ensemble.state.set('_touch', 1)")
        cfg = pg.evaluate("() => window.__cfg.build()")
        check('werkbank_ensemble' in cfg['ls'], f"werkbank_ensemble fehlt im Config-Export: {list(cfg['ls'].keys())!r}")

        # ── Werte über zwei Instrumente hinweg merken ──
        before = pg.evaluate("() => ({ bpm: window.__takt.state.get('bpm'), attack: window.__polysynth.state.get('adsrA'), master: window.__master.state.get('masterDb') })")
        n = pg.evaluate("() => window.__ensemble.store.save('Mein Ensemble').length")
        check(n == 1, f"save() sollte 1 Eintrag liefern, war {n}")

        pg.evaluate("""() => {
            window.__takt.state.set('bpm', Math.min(900, (window.__takt.state.get('bpm')||120) + 10));
            window.__polysynth.state.set('adsrA', (window.__polysynth.state.get('adsrA')||0) + 0.3);
            window.__master.state.set('masterDb', -9);
        }""")
        changed = pg.evaluate("() => ({ bpm: window.__takt.state.get('bpm'), attack: window.__polysynth.state.get('adsrA') })")
        check(changed['bpm'] != before['bpm'] and changed['attack'] != before['attack'], f"Werte sollten geändert sein: {changed!r}")

        ok = pg.evaluate("() => window.__ensemble.store.recall(0)")
        check(ok is True, "recall() sollte true liefern")
        after = pg.evaluate("() => ({ bpm: window.__takt.state.get('bpm'), attack: window.__polysynth.state.get('adsrA'), master: window.__master.state.get('masterDb') })")
        check(after['bpm'] == before['bpm'] and after['attack'] == before['attack'], f"Recall sollte Takt+Poly-Synth zurückholen: {after!r} != {before!r}")
        check(after['master'] == -9, f"Master-Fader sollte VOM Recall unberührt bleiben (blieb bei -9), war {after['master']!r}")

        # ── Aufräumen ──
        pg.evaluate("() => window.__ensemble.store.del(0)")
        pg.evaluate("() => window.__master.state.set('masterDb', 0)")

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
print("SMOKE OK: Header-Ensemble-Snapshot über mehrere Instrumente, Master bleibt außen vor.")
