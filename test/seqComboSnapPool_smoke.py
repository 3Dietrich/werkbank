#!/usr/bin/env python3
"""Headless-Smoke für den Sq-Klon-Pool (ddw.md @dpa 20260724, zentrale Anforderung: "die
Gruppen haben jeder die 2 Speicher, aber alle 'Clone' haben gemeinsam den Pool an
Speichern. So kann man z.B. die 3. Gruppe speichern, danach in die erste Gruppe gehen und
diese Speicherung der 3. Gruppe laden."). Lauf: python3 test/seqComboSnapPool_smoke.py

Hart begrenzt (Watchdog killt nach 40s), kein Pollen. Baut per addSq() zwei weitere
Sequenzer (Sq0="Stepsequenzer", Sq1="Sequenzer 2", Sq2="Sequenzer 3"), dann:
  · Snapshot in Sq2 ("Sequenzer 3") speichern (seqMult-Wert), Wert in Sq2 ändern.
  · Snapshot-Pool ist über groupKindOf('Sequenzer') geteilt: in Sq0 ("Stepsequenzer")
    erscheint der in Sq2 gespeicherte Snapshot in listGroupSnaps() UND kann dort geladen
    werden — Sq0 übernimmt dann den in Sq2 gespeicherten Wert (Pool-Beweis).
  · Combo analog (eine ctrlStyles-Farbe an Sq2 speichern, in Sq0 laden).
  · Löschen einer Sq (Sq2) lässt den Pool-Inhalt unverändert (kein Verwaisen, s. @dpas
    Antwort 5 — der Pool hängt an der Art, nicht an der Instanz).
"""
import subprocess, sys, time, os, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8152
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

        # ── Zwei weitere Sq bauen: Sq0="Stepsequenzer", Sq1="Sequenzer 2", Sq2="Sequenzer 3" ──
        pg.evaluate("() => { window.__stepseq.mgr.addSq(); window.__stepseq.mgr.addSq(); }")
        n = pg.evaluate("() => window.__stepseq.mgr.count()")
        check(n == 3, f"erwartet 3 Sq nach 2x addSq(), war {n}")
        kinds = pg.evaluate("() => window.__stepseq.host.groupNames()")
        check('Stepsequenzer' in kinds and 'Sequenzer 3' in kinds, f"Sq-Gruppennamen fehlen: {kinds!r}")

        host_js = "window.__stepseq.host"

        # ── Snapshot-Pool: in Sq2 speichern, Wert ändern, in Sq0 laden ──
        pg.evaluate("() => window.__stepseq.state.set('seqMult_2', 7)")
        pg.evaluate(f"() => {host_js}.saveGroupSnap('Sequenzer 3', 'Pool-Snap')")
        pg.evaluate("() => window.__stepseq.state.set('seqMult_2', 1)")  # Sq2 wieder auf Default

        list_in_sq0 = pg.evaluate(f"() => {host_js}.listGroupSnaps('Stepsequenzer').map(s => s.name)")
        check('Pool-Snap' in list_in_sq0, f"'Pool-Snap' sollte auch in Sq0's Pool sichtbar sein: {list_in_sq0!r}")

        ok = pg.evaluate(f"() => {host_js}.recallGroupSnap('Stepsequenzer', 0)")
        check(ok is True, "recallGroupSnap in Sq0 sollte true liefern")
        mult0 = pg.evaluate("() => window.__stepseq.state.get('seqMult_0')")
        check(mult0 == 7, f"Sq0 sollte nach Pool-Recall seqMult_0=7 haben (aus Sq2 gespeichert), war {mult0}")
        # Sq2 selbst bleibt unangetastet vom Recall auf Sq0 (nur die adressierte Instanz ändert sich).
        mult2 = pg.evaluate("() => window.__stepseq.state.get('seqMult_2')")
        check(mult2 == 1, f"Sq2 sollte vom Sq0-Recall unangetastet bleiben, war {mult2}")

        # ── Combo-Pool: Farbe in Sq2 speichern, in Sq0 laden ──
        # k:seqMult statt u:seqGrid (@dpa ddw.md 20260724_153349, seqOutputTailComboExclude_
        # smoke.py): das Step-GRID ist bewusst vom Combo ausgeschlossen, ein normaler Knob wie
        # seqMult ist der richtige Beweis dafür, dass der Pool-Mechanismus selbst funktioniert.
        pg.evaluate("""() => {
            const s = window.__stepseq.state;
            const cur = { ...(s.get('ctrlStyles') || {}) };
            cur['k:seqMult_2'] = { ...(cur['k:seqMult_2']||{}), fg: '#00ffaa' };
            s.set('ctrlStyles', cur);
        }""")
        pg.evaluate(f"() => {host_js}.saveGroupCombo('Sequenzer 3', 'Pool-Combo')")
        combo_ok = pg.evaluate(f"() => {host_js}.recallGroupCombo('Stepsequenzer', 0)")
        check(combo_ok is True, "recallGroupCombo in Sq0 sollte true liefern")
        fg0 = pg.evaluate("() => (window.__stepseq.state.get('ctrlStyles')||{})['k:seqMult_0'].fg")
        check(fg0 == '#00ffaa', f"Sq0 sollte die in Sq2 gespeicherte Farbe übernehmen, war {fg0!r}")

        # ── Sq2 löschen: Pool-Inhalt bleibt (kein Verwaisen), nur ihr eigener Sel-Zeiger weg ──
        sel_before = pg.evaluate("() => (window.__stepseq.state.get('groupSnapSel')||{})['Sequenzer 3']")
        check(sel_before == 'Pool-Snap', f"Sq2 sollte 'Pool-Snap' als Sel-Zeiger haben, war {sel_before!r}")
        pg.evaluate("() => window.__stepseq.mgr.removeSq()")
        n2 = pg.evaluate("() => window.__stepseq.mgr.count()")
        check(n2 == 2, f"erwartet 2 Sq nach removeSq(), war {n2}")
        list_after = pg.evaluate(f"() => {host_js}.listGroupSnaps('Stepsequenzer').map(s => s.name)")
        check('Pool-Snap' in list_after, f"Pool-Snap sollte nach Löschen von Sq2 weiter existieren: {list_after!r}")
        sel_after = pg.evaluate("() => (window.__stepseq.state.get('groupSnapSel')||{})['Sequenzer 3']")
        check(sel_after is None, f"Sq2's eigener Sel-Zeiger sollte nach removeSq() weg sein, war {sel_after!r}")

        # ── Aufräumen: zurück auf 1 Sq, Testeinträge aus dem Pool entfernen ──
        pg.evaluate("() => window.__stepseq.mgr.removeSq()")
        pg.evaluate(f"() => {host_js}.deleteGroupSnap('Stepsequenzer', 0)")
        pg.evaluate(f"() => {host_js}.deleteGroupCombo('Stepsequenzer', 0)")

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
print("SMOKE OK: Sq-Klon-Pool — Combo/Snapshot in Sq3 gespeichert, in Sq1 geladen, Löschen verwaist nichts.")
