#!/usr/bin/env python3
"""Headless-Smoke: die zwei Transport-Starts verhalten sich unterschiedlich
(ddw.md 20260724_233253 + Bugfix 20260725).

  '>'  (b:start)     = continue: der Sequenzer laeuft AB der eingefrorenen Position weiter.
  '|>' (b:startCont) = avv:      der Sequenzer startet VON VORNE (Step 0).

Regression-Schutz fuer den Reihenfolge-Bug: clock.start() feuert den ersten Beat SYNCHRON
(-> sqManager.handleClockBeat), darum MUSS die Transport-Kopplung (sqManager.transport)
VORHER laufen (taktmetro/engine.js start()). Lief sie danach, setzte der Beat-Anker schon
resetPending=true und '>' startete faelschlich immer von vorne ("nein, immernoch starten
beide von vorn", @dpa 20260725).

Lauf: python3 test/tempoStartContinue_smoke.py
Hart begrenzt (Watchdog killt nach 40s), kein Pollen ausser dem BPM-getriebenen Hochzaehlen.
"""
import threading, os, time, sys
from playwright.sync_api import sync_playwright

def watchdog():
    time.sleep(40); print("WATCHDOG: hart beendet", file=sys.stderr); os._exit(1)
threading.Thread(target=watchdog, daemon=True).start()

URL = "http://localhost:8002/"

def setup(pg):
    pg.evaluate("""()=>{const s=window.__stepseq.state,t=window.__takt.state;
      s.set('seqLen_0',16); s.set('seqSteps_0',Array.from({length:16},(_,i)=>i+1));
      s.set('seqMult_0',1); s.set('seqDiv_0',1); s.set('seqEnabled_0',true); t.set('bpm',300);}""")

def run_until_high(pg):
    """Startet laufen lassen bis pos in [4..10] (schnelles Tempo), gibt die Position zurueck."""
    hi = -1
    for _ in range(40):
        pg.wait_for_timeout(60)
        hi = pg.evaluate("()=>window.__stepseq.mgr.seqPos(0)")
        if 4 <= hi <= 10:
            break
    return hi

with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page()
    pg.goto(URL, wait_until="networkidle"); pg.wait_for_timeout(700)
    pos = lambda: pg.evaluate("()=>window.__stepseq.mgr.seqPos(0)")
    click = lambda i: pg.click(f'[data-ctrl="{i}"]')

    # ── '>' = continue: hochlaufen, stoppen (Position friert ein), '>' -> weiter ──
    setup(pg)
    click('b:start')                 # '>' start
    hi = run_until_high(pg)
    pg.evaluate("()=>window.__takt.state.set('bpm',60)")   # langsam: Zeit zum Ablesen
    pg.wait_for_timeout(50); frozen = pos()
    click('b:start')                 # stop (toggle)
    pg.wait_for_timeout(120)
    click('b:start')                 # '>' continue
    pg.wait_for_timeout(350)
    cont = pos()
    assert hi > 0, f"'>' zaehlte nicht hoch (pos={hi})"
    assert frozen <= cont <= frozen + 2, f"'>' continue nicht ab Position (frozen={frozen}, cont={cont})"
    assert cont > 0, f"'>' startete faelschlich von vorne (pos={cont})"
    click('b:start')                 # stop fuer den naechsten Teil

    # ── '|>' = avv: hochlaufen, stoppen, '|>' -> Step 0 ──
    pg.evaluate("()=>window.__takt.state.set('bpm',300)")
    pg.wait_for_timeout(80)
    click('b:startCont')             # '|>' start
    hi2 = run_until_high(pg)
    pg.evaluate("()=>window.__takt.state.set('bpm',60)")
    pg.wait_for_timeout(50)
    click('b:startCont')             # stop
    pg.wait_for_timeout(120)
    click('b:startCont')             # '|>' avv
    pg.wait_for_timeout(350)
    av = pos()
    assert hi2 > 0, f"'|>' zaehlte nicht hoch (pos={hi2})"
    assert av in (0, 1), f"'|>' startete nicht von vorne (pos={av})"

    print(f"SMOKE OK: '>' continue (frozen={frozen}->{cont}), '|>' avv (->{av}); Transport-Reihenfolge korrekt.")
    sys.stdout.flush()
    b.close(); os._exit(0)
