#!/usr/bin/env python3
"""Headless-Smoke: ein per [+] neu gebauter Sequenzer erbt den Default aus Sequenzer 0
(@dpa 20260725: „den ersten Sequenzer aus der json als default ('+') nehmen", Wahl
„Optik + Speed/Länge"). Lauf: python3 test/sqAddDefault_smoke.py

Hart begrenzt (Watchdog killt nach 40s), kein Pollen.
  · Frischer State (localStorage geleert) → auch der ERSTE Sq bekommt die Default-Optik/Werte.
  · Werte-Default: seqDiv=8, seqLen=13, seqOutput='' (kein Ziel) — NICHT das alte 1/8/'trig'.
  · Optik-Default: ctrlStyles['u:seqGrid_i'] = grün (bg #244f4b, boxSize 315, boxH 50) +
    Skala seqMin 1 / seqMax 15.
  · seqSteps bleibt leer (nur Step 0 an) — KEIN festes Muster als Default.
  · addSq() baut einen zweiten Sq, der denselben Default erbt.
"""
import subprocess, sys, time, os, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8171
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

def assert_sq(pg, i, tag):
    st = pg.evaluate("""(i) => {
        const s = window.__stepseq.state;
        const cs = (s.get('ctrlStyles')||{})['u:seqGrid_'+i] || {};
        const steps = s.get('seqSteps_'+i) || [];
        return {
            div: s.get('seqDiv_'+i), len: s.get('seqLen_'+i), out: s.get('seqOutput_'+i),
            bg: cs.bg, box: cs.boxSize, boxH: cs.boxH, smin: cs.seqMin, smax: cs.seqMax,
            step0: steps[0], step1: steps[1],
        };
    }""", i)
    check(st["div"] == 8, f"[{tag}] seqDiv_{i} sollte 8 sein, war {st['div']}")
    check(st["len"] == 13, f"[{tag}] seqLen_{i} sollte 13 sein, war {st['len']}")
    check(st["out"] == "", f"[{tag}] seqOutput_{i} sollte '' (kein Ziel) sein, war {st['out']!r}")
    check(st["bg"] == "#244f4b", f"[{tag}] Grid-bg sollte #244f4b sein, war {st['bg']!r}")
    check(st["box"] == 315, f"[{tag}] Grid-boxSize sollte 315 sein, war {st['box']}")
    check(st["boxH"] == 50, f"[{tag}] Grid-boxH sollte 50 sein, war {st['boxH']}")
    check(st["smin"] == 1 and st["smax"] == 15, f"[{tag}] Skala sollte 1..15 sein, war {st['smin']}..{st['smax']}")
    check(st["step0"] == 1 and st["step1"] in (None, 0) or st["step1"] is None,
          f"[{tag}] seqSteps sollte leer (nur Step0=1) sein, war [0]={st['step0']} [1]={st['step1']}")

try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": 1600, "height": 1100})
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.goto(f"http://localhost:{PORT}/", wait_until="networkidle", timeout=15000)
        # Frischer State: gespeicherte Config würde die Defaults überdecken (Recall gewinnt).
        pg.evaluate("() => localStorage.clear()")
        pg.reload(wait_until="networkidle", timeout=15000)

        # 1) Der erste Sq (immer da) erbt bei frischem Start den Seq-0-Default.
        assert_sq(pg, 0, "Sq0-frisch")

        # 2) [+] hängt einen zweiten Sq an, der denselben Default erbt.
        pg.evaluate("() => window.__stepseq.mgr.addSq()")
        cnt = pg.evaluate("() => window.__stepseq.mgr.count()")
        check(cnt == 2, f"count() sollte nach addSq() 2 sein, war {cnt}")
        assert_sq(pg, 1, "Sq1-plus")

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
print("SMOKE OK: [+]-Sequenzer erbt den Seq-0-Default (Optik #244f4b/315x50, Skala 1..15, Teiler 8, Step-Zahl 13, kein Ziel, leeres Muster).")
