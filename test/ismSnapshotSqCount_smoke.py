#!/usr/bin/env python3
"""Headless-Smoke: ISM-Snapshot stellt die ANZAHL der Sequenzer-Gruppen wieder her
(@dpa 20260725 Bugreport: "6 Stepsequencer, Snapshot gespeichert, 3 weglöschen, Snapshot
wieder aufrufen → sollten wieder 6 sein, waren aber nur 3").

Lauf: python3 test/ismSnapshotSqCount_smoke.py — Watchdog killt nach 40s, kein Pollen.

Nagelt die Kette fest:
  · sqManager.reconcile() baut fehlende Sq-Gruppen nach bzw. baut zu viele ab (multiSq.js).
  · saveIsmSnap() legt sqCount über opts.snapExtra mit ab (InstrumentSettings.js);
    allSoundValues() allein erfasst es NICHT (gehört zu keiner Gruppe).
  · recallIsmSnap() ruft opts.onSnapRecalled() → reconcile NACH dem Setzen aller Werte.
Zusätzlich: der Wert-Recall pro Sq greift (seqMult_4 kommt mit zurück).
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

try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": 1600, "height": 1100})
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        pg.on("pageerror", lambda e: errors.append(str(e)))
        # Sauberer State: sonst schleppt ein alter localStorage einen sqCount mit rein.
        pg.goto(f"http://localhost:{PORT}/", wait_until="domcontentloaded", timeout=15000)
        pg.evaluate("() => { localStorage.clear(); }")
        pg.reload(wait_until="networkidle", timeout=15000)

        # ── 1) Auf 6 Sequenzer hochbauen (Start ist 1) ──
        pg.evaluate("() => { for (let i = 0; i < 5; i++) window.__stepseq.mgr.addSq(); }")
        n = pg.evaluate("() => window.__stepseq.mgr.count()")
        check(n == 6, f"erwartet 6 Sq nach 5x addSq(), war {n}")
        groups6 = pg.evaluate("() => window.__stepseq.host.groupNames().length")
        check(groups6 == 6, f"erwartet 6 Sq-Gruppen im DOM/Host, war {groups6}")

        # Einen Marker-Wert in Sq 4 setzen (soll den Recall überleben).
        pg.evaluate("() => window.__stepseq.state.set('seqMult_4', 5)")

        # ── 2) ISM-Snapshot speichern ──
        list_len = pg.evaluate("() => window.__stepseq.instr.saveIsmSnap('sechser').length")
        check(list_len == 1, f"saveIsmSnap sollte 1 Eintrag liefern, war {list_len}")
        # sqCount MUSS im Snapshot stecken (sonst kann der Recall die Anzahl nicht kennen).
        snap_has_count = pg.evaluate(
            "() => 'sqCount' in (window.__stepseq.state.get('ismSnaps')[0].values)")
        check(snap_has_count, "Snapshot enthält kein sqCount (snapExtra greift nicht)")
        snap_count_val = pg.evaluate(
            "() => window.__stepseq.state.get('ismSnaps')[0].values.sqCount")
        check(snap_count_val == 6, f"Snapshot-sqCount sollte 6 sein, war {snap_count_val}")

        # ── 3) Drei Sequenzer entfernen (wie ISM-Header '-') ──
        pg.evaluate("() => { for (let i = 0; i < 3; i++) window.__stepseq.mgr.removeSq(); }")
        n3 = pg.evaluate("() => window.__stepseq.mgr.count()")
        check(n3 == 3, f"erwartet 3 Sq nach 3x removeSq(), war {n3}")
        groups3 = pg.evaluate("() => window.__stepseq.host.groupNames().length")
        check(groups3 == 3, f"erwartet 3 Sq-Gruppen nach Löschen, war {groups3}")

        # ── 4) Snapshot wieder aufrufen → 6 Sqs zurück, ready to run ──
        ok = pg.evaluate("() => window.__stepseq.instr.recallIsmSnap(0)")
        check(ok is True, "recallIsmSnap sollte true liefern")
        n_back = pg.evaluate("() => window.__stepseq.mgr.count()")
        check(n_back == 6, f"nach Recall erwartet 6 Sq (der Bug!), war {n_back}")
        groups_back = pg.evaluate("() => window.__stepseq.host.groupNames().length")
        check(groups_back == 6, f"nach Recall erwartet 6 Sq-Gruppen im DOM, war {groups_back}")
        # Engines wirklich gebaut (nicht nur Zähler) → "ready to run".
        eng5 = pg.evaluate("() => !!window.__stepseq.mgr.engineAt(5)")
        check(eng5, "Engine der Sq 6 (Index 5) fehlt nach Recall — nicht ready to run")
        # Marker-Wert aus Sq 4 überlebte den Recall.
        mult4 = pg.evaluate("() => window.__stepseq.state.get('seqMult_4')")
        check(mult4 == 5, f"seqMult_4 sollte nach Recall 5 sein, war {mult4}")

        # ── 5) Gegenrichtung: aktuell 6, Snapshot mit 3 → Recall baut AB auf 3 ──
        pg.evaluate("() => window.__stepseq.instr.saveIsmSnap('dreier')")  # noch bei 6? nein, wir sind bei 6
        # erst auf 3 bringen, DANN als 'dreier' sichern, dann wieder auf 6, dann recall 'dreier'
        pg.evaluate("() => { for (let i = 0; i < 3; i++) window.__stepseq.mgr.removeSq(); }")
        pg.evaluate("() => window.__stepseq.instr.saveIsmSnap('dreier')")  # jetzt sqCount=3
        pg.evaluate("() => { for (let i = 0; i < 3; i++) window.__stepseq.mgr.addSq(); }")  # zurück auf 6
        idx_dreier = pg.evaluate(
            "() => window.__stepseq.state.get('ismSnaps').findIndex(s => s.name === 'dreier')")
        pg.evaluate(f"() => window.__stepseq.instr.recallIsmSnap({idx_dreier})")
        n_down = pg.evaluate("() => window.__stepseq.mgr.count()")
        check(n_down == 3, f"Recall eines 3er-Snapshots bei 6 gebauten sollte auf 3 abbauen, war {n_down}")
        groups_down = pg.evaluate("() => window.__stepseq.host.groupNames().length")
        check(groups_down == 3, f"nach Abbau-Recall erwartet 3 Gruppen, war {groups_down}")
        # Kein verwaister seqMult_5 mehr im State (teardownLast räumt die Wert-Keys weg).
        has_orphan = pg.evaluate("() => window.__stepseq.state.get('seqMult_5') !== undefined")
        check(not has_orphan, "verwaister seqMult_5 nach Abbau-Recall geblieben")

        b.close()
except Exception as e:
    fails.append(f"EXCEPTION: {e}")
finally:
    srv.terminate()

# Konsolen-/Page-Errors nur melden, wenn nicht ohnehin schon ein fachlicher Fail vorliegt.
if errors:
    fails.append("Konsolen-/Page-Errors: " + " | ".join(errors[:5]))

if fails:
    print("SMOKE FAIL:")
    for f in fails:
        print("  -", f)
    sys.exit(1)
print("SMOKE OK: ISM-Snapshot stellt Sq-Anzahl korrekt wieder her (hoch UND runter).")
