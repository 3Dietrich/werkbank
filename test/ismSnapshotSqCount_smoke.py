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
Zusätzlich: der Wert-Recall pro Sq greift (Marker-Wert kommt mit zurück).

Arbeitet RELATIV zur tatsächlichen Start-Anzahl/Snapshot-Liste statt fest "1"/Index 0
anzunehmen (@dpa dd.md 20260802: die Demo-Config bringt inzwischen mehrere Sq + eigene
ismSnaps von Haus aus mit — ein hartes "erwartet 6 nach 5x addSq()" bricht dann, ohne
dass der eigentliche Mechanismus kaputt wäre).
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
        pg.goto(f"http://localhost:{PORT}/overcord/", wait_until="domcontentloaded", timeout=15000)
        pg.evaluate("() => { localStorage.clear(); }")
        pg.reload(wait_until="networkidle", timeout=15000)

        # ── 0) Start-Anzahl feststellen (die Demo-Config bringt evtl. schon mehrere mit) ──
        n0 = pg.evaluate("() => window.__stepseq.mgr.count()")
        check(n0 >= 1, f"erwartet mindestens 1 Sq zu Beginn, war {n0}")

        # ── 1) Um 5 hochbauen ──
        pg.evaluate("() => { for (let i = 0; i < 5; i++) window.__stepseq.mgr.addSq(); }")
        n_hi = n0 + 5
        n = pg.evaluate("() => window.__stepseq.mgr.count()")
        check(n == n_hi, f"erwartet {n_hi} Sq nach 5x addSq() (Start war {n0}), war {n}")
        groups_hi = pg.evaluate("() => window.__stepseq.host.groupNames().length")
        check(groups_hi == n_hi, f"erwartet {n_hi} Sq-Gruppen im DOM/Host, war {groups_hi}")

        i_mark, i_view = n_hi - 2, n_hi - 1   # zwei oberste neu gebaute Sqs als Marker

        # Marker-WERT (Sound, soll den Recall überleben).
        pg.evaluate(f"() => window.__stepseq.state.set('seqMult_{i_mark}', 5)")
        # Marker-ANSICHT (Optik) — zwei Wege, beide sollen den Abbau-dann-Recall überleben und
        # am NEU gebauten Sq wieder wirken:
        #  · ctrlStyles am Fill-Button (u:seqFill_i): fg wird direkt als btn.style.color angewandt
        #    (wireModeButton) → im DOM prüfbar.
        #  · knobMeta am seqMult-Knob (k:seqMult_i): eigener Optik-Map, State-Roundtrip prüfbar.
        pg.evaluate(f"""() => {{
            const s = window.__stepseq.state;
            const cs = {{ ...(s.get('ctrlStyles') || {{}}) }};
            cs['u:seqFill_{i_view}'] = {{ ...(cs['u:seqFill_{i_view}'] || {{}}), fg: 'rgb(1, 2, 3)' }};
            s.set('ctrlStyles', cs);
            const km = {{ ...(s.get('knobMeta') || {{}}) }};
            km['seqMult_{i_view}'] = {{ ...(km['seqMult_{i_view}'] || {{}}), viewSize: 42 }};
            s.set('knobMeta', km);
        }}""")

        # ── 2) ISM-Snapshot speichern ──
        prev_len = pg.evaluate("() => (window.__stepseq.state.get('ismSnaps')||[]).length")
        list_len = pg.evaluate("() => window.__stepseq.instr.saveIsmSnap('sq-count-test-hoch').length")
        check(list_len == prev_len + 1, f"saveIsmSnap sollte die Liste um 1 verlängern, war {prev_len}->{list_len}")
        idx_hi = pg.evaluate("() => window.__stepseq.state.get('ismSnaps').findIndex(s => s.name === 'sq-count-test-hoch')")
        check(idx_hi >= 0, "gespeicherter Snapshot 'sq-count-test-hoch' nicht in ismSnaps gefunden")
        # sqCount + sqViews MÜSSEN im Snapshot-extra stecken (sonst kennt der Recall weder
        # Anzahl noch Ansicht).
        snap_count_val = pg.evaluate(
            f"() => (window.__stepseq.state.get('ismSnaps')[{idx_hi}].extra || {{}}).sqCount")
        check(snap_count_val == n_hi, f"Snapshot-extra.sqCount sollte {n_hi} sein, war {snap_count_val}")
        snap_view_fg = pg.evaluate(
            f"() => (((window.__stepseq.state.get('ismSnaps')[{idx_hi}].extra||{{}}).sqViews||{{}}).ctrlStyles||{{}})['u:seqFill_{i_view}']?.fg")
        check(snap_view_fg == 'rgb(1, 2, 3)', f"Snapshot-extra.sqViews trägt die ctrlStyles-Ansicht nicht, fg={snap_view_fg}")
        snap_view_meta = pg.evaluate(
            f"() => (((window.__stepseq.state.get('ismSnaps')[{idx_hi}].extra||{{}}).sqViews||{{}}).knobMeta||{{}})['seqMult_{i_view}']?.viewSize")
        check(snap_view_meta == 42, f"Snapshot-extra.sqViews trägt die knobMeta-Ansicht nicht, viewSize={snap_view_meta}")

        # ── 3) Drei Sequenzer entfernen (wie ISM-Header '-') ──
        pg.evaluate("() => { for (let i = 0; i < 3; i++) window.__stepseq.mgr.removeSq(); }")
        n_lo = n_hi - 3
        n3 = pg.evaluate("() => window.__stepseq.mgr.count()")
        check(n3 == n_lo, f"erwartet {n_lo} Sq nach 3x removeSq(), war {n3}")
        groups3 = pg.evaluate("() => window.__stepseq.host.groupNames().length")
        check(groups3 == n_lo, f"erwartet {n_lo} Sq-Gruppen nach Löschen, war {groups3}")

        # ── 4) Snapshot wieder aufrufen → n_hi Sqs zurück, ready to run ──
        ok = pg.evaluate(f"() => window.__stepseq.instr.recallIsmSnap({idx_hi})")
        check(ok is True, "recallIsmSnap sollte true liefern")
        n_back = pg.evaluate("() => window.__stepseq.mgr.count()")
        check(n_back == n_hi, f"nach Recall erwartet {n_hi} Sq (der Bug!), war {n_back}")
        groups_back = pg.evaluate("() => window.__stepseq.host.groupNames().length")
        check(groups_back == n_hi, f"nach Recall erwartet {n_hi} Sq-Gruppen im DOM, war {groups_back}")
        # Engine wirklich gebaut (nicht nur Zähler) → "ready to run".
        eng_top = pg.evaluate(f"() => !!window.__stepseq.mgr.engineAt({i_view})")
        check(eng_top, f"Engine der obersten Sq (Index {i_view}) fehlt nach Recall — nicht ready to run")
        # Marker-Wert überlebte den Recall.
        mult_mark = pg.evaluate(f"() => window.__stepseq.state.get('seqMult_{i_mark}')")
        check(mult_mark == 5, f"seqMult_{i_mark} sollte nach Recall 5 sein, war {mult_mark}")
        # Marker-ANSICHT (der Kern dieses zweiten Bugreports): im State zurück …
        fg_state = pg.evaluate(
            f"() => (window.__stepseq.state.get('ctrlStyles')||{{}})['u:seqFill_{i_view}']?.fg")
        check(fg_state == 'rgb(1, 2, 3)', f"ctrlStyles u:seqFill_{i_view} im State nicht wiederhergestellt, war {fg_state}")
        meta_state = pg.evaluate(
            f"() => (window.__stepseq.state.get('knobMeta')||{{}})['seqMult_{i_view}']?.viewSize")
        check(meta_state == 42, f"knobMeta seqMult_{i_view} im State nicht wiederhergestellt, war {meta_state}")
        # … UND tatsächlich am neu gebauten DOM-Element angewendet (nicht nur im State): der
        # Fill-Button hängt in [data-ctrl="u:seqFill_i"], applyStyle setzt btn.style.color = fg.
        fg_dom = pg.evaluate(f"""() => {{
            const el = document.querySelector('[data-ctrl="u:seqFill_{i_view}"]');
            if (!el) return 'KEIN-ELEMENT';
            const btn = el.matches('button') ? el : el.querySelector('button');
            return btn ? btn.style.color : 'KEIN-BUTTON';
        }}""")
        check(fg_dom == 'rgb(1, 2, 3)', f"Ansicht am neu gebauten Sq-Fill-Button nicht sichtbar angewendet, war {fg_dom}")

        # ── 5) Gegenrichtung: aktuell n_hi, Snapshot mit n_lo → Recall baut AB auf n_lo ──
        pg.evaluate("() => { for (let i = 0; i < 3; i++) window.__stepseq.mgr.removeSq(); }")   # runter auf n_lo
        pg.evaluate("() => window.__stepseq.instr.saveIsmSnap('sq-count-test-runter')")          # jetzt sqCount=n_lo
        pg.evaluate("() => { for (let i = 0; i < 3; i++) window.__stepseq.mgr.addSq(); }")       # zurück auf n_hi
        idx_lo = pg.evaluate(
            "() => window.__stepseq.state.get('ismSnaps').findIndex(s => s.name === 'sq-count-test-runter')")
        pg.evaluate(f"() => window.__stepseq.instr.recallIsmSnap({idx_lo})")
        n_down = pg.evaluate("() => window.__stepseq.mgr.count()")
        check(n_down == n_lo, f"Recall eines {n_lo}er-Snapshots bei {n_hi} gebauten sollte auf {n_lo} abbauen, war {n_down}")
        groups_down = pg.evaluate("() => window.__stepseq.host.groupNames().length")
        check(groups_down == n_lo, f"nach Abbau-Recall erwartet {n_lo} Gruppen, war {groups_down}")
        # Kein verwaister Wert-Key des obersten, abgebauten Index mehr im State (teardownLast
        # räumt die Wert-Keys weg).
        has_orphan = pg.evaluate(f"() => window.__stepseq.state.get('seqMult_{n_hi - 1}') !== undefined")
        check(not has_orphan, f"verwaister seqMult_{n_hi - 1} nach Abbau-Recall geblieben")

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
