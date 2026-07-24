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

    # ── '>' continue triggert NICHT sofort (ddw.md 20260725_003258, Beat-Phasen-Modulo) ──
    # seqDiv=8 => 8 Beats pro Step. Mitten im Intervall stoppen, dann '>': der naechste Trigger
    # darf erst am phasenrichtigen Rasterpunkt kommen (Rest-Beats abwarten), NICHT sofort.
    # Alter Bug (akkumulierte Zeit): '>' setzte nextAt=jetzt -> Step sprang sofort um frozen+1.
    if pg.evaluate("()=>window.__takt.engine.running()"): click('b:startCont')  # aus Sektion 2 noch an? stoppen
    pg.wait_for_timeout(120)
    pg.evaluate("""()=>{const s=window.__stepseq.state,t=window.__takt.state;
      s.set('seqLen_0',16); s.set('seqSteps_0',Array.from({length:16},(_,i)=>i+1));
      s.set('seqMult_0',1); s.set('seqDiv_0',8); s.set('seqEnabled_0',true); t.set('bpm',240);}""")
    # bpm=240 -> beatDur=250ms, div=8 -> Intervall = 2000ms.
    click('b:startCont')             # '|>' avv: Step 0 faellt sofort
    p0 = -1
    for _ in range(30):
        pg.wait_for_timeout(50)
        p0 = pos()
        if p0 == 0: break
    assert p0 == 0, f"avv setzte Step 0 nicht (pos={p0})"
    pg.wait_for_timeout(500)         # ~2 Beats ins 8-Beat-Intervall hinein (Step steht noch auf 0)
    frozen8 = pos()
    click('b:startCont')             # stop (Position friert ein)
    pg.wait_for_timeout(120)
    click('b:start')                 # '>' continue
    pg.wait_for_timeout(300)         # << 1500ms Rest bis zum naechsten Rasterpunkt
    cont8 = pos()
    assert frozen8 == 0, f"Setup: Step haette noch 0 sein muessen (frozen8={frozen8})"
    assert cont8 == frozen8, f"'>' continue triggerte SOFORT statt phasenrichtig zu warten (frozen8={frozen8}, cont8={cont8})"
    click('b:start')                 # stop

    print(f"SMOKE OK: '>' continue (frozen={frozen}->{cont}), '|>' avv (->{av}); "
          f"div=8-continue wartet phasenrichtig (frozen8={frozen8}->{cont8}); Transport-Reihenfolge korrekt.")
    sys.stdout.flush()
    b.close(); os._exit(0)
