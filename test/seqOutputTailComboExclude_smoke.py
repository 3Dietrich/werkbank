#!/usr/bin/env python3
"""Headless-Smoke: ddw.md @dpa 20260724 (Zeile 1082-1087, klargestellt 20260724_153349
und nochmal 20260724_192304): 'StepSeq/StepSeq/output: soll ... den Namen "rechts
aligned" anzeigen ... (Das ist etwas besonderes nur für Output..)' + 'Combo: soll nicht
den Steps inhalt speichern/recallen!'
— gemeint ist die DATA-SEKTION des Step-GRIDs (u:seqGrid: seqOff/seqMin/seqMax/seqStep),
NICHT der Step-Zahl-Knob (seqLen) UND NICHT die ANSICHT des Grids selbst. @dpa-Klarstellung
20260724_192304 (image-17: Combo gespeichert, in anderem Sq recalled — Farben/Größe blieben
unverändert): "die ANSICHT der Steps soll übernommen werden, also Farben, Breite und Höhe.
Der Inhalt und min,max,stepsize bleibt." — Fein-Ausschluss statt ganzem Control
(comboExcludeFields, GroupHost.js): bg/fg/boxSize/boxH gehen normal ins Combo, nur
seqOff/seqMin/seqMax/seqStep bleiben draußen. seqLen heißt seither 'Step-Zahl' (defs.js),
um Knob und Grid-Ansicht (beide hießen vorher 'Steps') auseinanderzuhalten.

Prüft:
  1. Sq-Output-PickMenu (collapsed .pm-name) hat die neue 'pm-name-tail'-Klasse und damit
     computed direction:rtl (Kürzung/Alignment am ANFANG statt am Ende) — NUR dieses eine
     PickMenu, nicht z.B. das Gruppen-Combo-PickMenu (Regressionscheck: bleibt unverändert).
  2. Combo (Gruppen-Optik-Speicher) speichert/recallt den 'seqLen'-Knob ('Step-Zahl') GANZ
     NORMAL wie jeden anderen Knob. Vom Step-Grid (u:seqGrid) geht die ANSICHT (fg) mit ins
     Combo, die Data-Sektion (seqMin) bleibt beim Recall unangetastet stehen.

Lauf: python3 test/seqOutputTailComboExclude_smoke.py
Hart begrenzt (Watchdog killt nach 40s), kein Pollen.
"""
import subprocess, sys, time, os, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8172
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

        # ── 1) tailAlign nur am Sq-Output-PickMenu ──
        out_info = pg.evaluate("""() => {
            const name = document.querySelector('.group[data-group="Stepsequenzer"] [data-ctrl="s:seqOutput_0"] .pm-name');
            return { hasClass: name.classList.contains('pm-name-tail'), dir: getComputedStyle(name).direction };
        }""")
        check(out_info['hasClass'], "Sq-Output .pm-name sollte 'pm-name-tail' tragen")
        check(out_info['dir'] == 'rtl', f"Sq-Output .pm-name sollte computed direction 'rtl' haben, war {out_info['dir']!r}")

        # Regression: Gruppen-Combo-PickMenu (Transport/Tempo) bleibt normal (kein tailAlign).
        group = pg.locator('.group[data-group="Transport / Tempo"]').first
        group.locator('.group-title-bar').click(button="right")
        gset = pg.locator('.group-settings:visible')
        combo_info = gset.locator('.pickmenu .pm-name').first.evaluate(
            "el => ({ hasClass: el.classList.contains('pm-name-tail'), dir: getComputedStyle(el).direction })"
        )
        check(not combo_info['hasClass'], "Combo-PickMenu sollte KEIN 'pm-name-tail' tragen (Regression)")
        check(combo_info['dir'] == 'ltr', f"Combo-PickMenu sollte weiter direction 'ltr' haben, war {combo_info['dir']!r}")
        gset.locator('.kme-close').click()

        # ── 1b) GEOMETRISCHER Beweis (@dpa 20260724: erster Fix zeigte trotz 'direction:rtl'
        # noch "Poly-Synt..." — unicode-bidi:plaintext hatte die rtl-Richtung stillschweigend
        # wieder auf ltr zurückgedreht. Ein reiner computed-style-Check auf direction:rtl hätte
        # DAS nicht gefangen, weil unicode-bidi separat war — hier daher der ECHTE Rendering-
        # Beweis über Range.getBoundingClientRect(): Text muss rechtsbündig sitzen UND
        # tatsächlich (sichtbar) beschnitten sein, nicht nur "irgendwie rtl".
        pm_btn = pg.locator('.group[data-group="Stepsequenzer"] [data-ctrl="s:seqOutput_0"] .pm-btn')
        pm_btn.click()
        pg.get_by_text("Poly-Synth / Audio-Osz → Höhen-Dämpf", exact=True).click()
        wrap = pg.locator('.group[data-group="Stepsequenzer"] [data-ctrl="s:seqOutput_0"]')
        wrap.click(button="right")
        panel2 = pg.locator('.elem-settings:visible')
        boxsize = panel2.locator('.kme-row[data-f="boxSize"] .es-boxsize')
        boxsize.fill("90")
        boxsize.dispatch_event("change")
        time.sleep(0.15)
        panel2.locator('.kme-close').click()
        time.sleep(0.1)

        geo = pg.evaluate("""() => {
            const name = document.querySelector('.group[data-group="Stepsequenzer"] [data-ctrl="s:seqOutput_0"] .pm-name');
            const nameBox = name.getBoundingClientRect();   // eigene Box (flex-Kind, OHNE Caret)
            const r = document.createRange(); r.selectNodeContents(name);
            const textBox = r.getBoundingClientRect();
            return {
                text: name.textContent,
                rightGap: Math.abs(nameBox.right - textBox.right),   // ~0 = rechtsbündig INNERHALB der eigenen Box
                clipped: name.scrollWidth > name.clientWidth,
            };
        }""")
        check(geo['text'] == 'Poly-Synth / Audio-Osz → Höhen-Dämpf', f"Sq-Output sollte den vollen Namen im DOM tragen (nur visuell gekürzt), war {geo['text']!r}")
        check(geo['rightGap'] < 2, f"Sq-Output-Text sollte rechtsbündig in seiner eigenen Box sitzen (Gap<2px), war {geo['rightGap']}px")
        check(geo['clipped'], "Sq-Output-Text sollte bei 90px tatsächlich sichtbar beschnitten sein (scrollWidth > clientWidth)")

        # ── 2) Combo: seqLen-Knob normal drin, vom Grid nur die ANSICHT (fg), nicht seqMin ──
        pg.evaluate("""() => {
            const s = window.__stepseq.state;
            const km = { ...(s.get('knobMeta') || {}) };
            km['seqLen_0'] = { ...(km['seqLen_0']||{}), max: 99 };
            s.set('knobMeta', km);
            const cs = { ...(s.get('ctrlStyles') || {}) };
            cs['k:seqLen_0'] = { ...(cs['k:seqLen_0']||{}), bg: '#ff00ff' };   // soll INS Combo
            cs['u:seqGrid_0'] = { ...(cs['u:seqGrid_0']||{}), fg: '#00ffaa', seqMin: 3 };   // fg INS Combo, seqMin NICHT
            s.set('ctrlStyles', cs);
        }""")
        host_js = "window.__stepseq.host"
        pg.evaluate(f"() => {host_js}.saveGroupCombo('Stepsequenzer', 'ExcludeStepsTest')")

        # Gespeichertes Combo-Payload direkt inspizieren: seqGrid.fg drin, seqGrid.seqMin NICHT, seqLen schon.
        payload = pg.evaluate("""() => {
            const list = (window.__stepseq.state.get('groupCombos')||{})['Sequenzer'] || [];
            const e = list.find(c => c.name === 'ExcludeStepsTest');
            return e ? { ctrlStyles: e.ctrlStyles, knobMeta: e.knobMeta } : null;
        }""")
        check(payload is not None, "Combo 'ExcludeStepsTest' sollte gespeichert sein")
        if payload:
            check('seqLen' in (payload.get('knobMeta') or {}), f"knobMeta sollte 'seqLen' enthalten (Knob gehört ins Combo): {payload.get('knobMeta')}")
            check('k:seqLen' in (payload.get('ctrlStyles') or {}), f"ctrlStyles sollte 'k:seqLen' enthalten: {payload.get('ctrlStyles')}")
            grid_style = (payload.get('ctrlStyles') or {}).get('u:seqGrid')
            check(grid_style is not None and grid_style.get('fg') == '#00ffaa', f"ctrlStyles 'u:seqGrid' sollte die Ansicht (fg) enthalten: {grid_style!r}")
            check(grid_style is not None and 'seqMin' not in grid_style, f"ctrlStyles 'u:seqGrid' sollte 'seqMin' (Data-Sektion) NICHT enthalten: {grid_style!r}")

        # Werte ändern, recallen: seqLen + Grid-Farbe werden wiederhergestellt, Grid-seqMin bleibt unangetastet.
        pg.evaluate("""() => {
            const s = window.__stepseq.state;
            const km = { ...(s.get('knobMeta') || {}) };
            km['seqLen_0'] = { ...(km['seqLen_0']||{}), max: 7 };
            s.set('knobMeta', km);
            const cs = { ...(s.get('ctrlStyles') || {}) };
            cs['k:seqLen_0'] = { ...(cs['k:seqLen_0']||{}), bg: '#000000' };
            cs['u:seqGrid_0'] = { ...(cs['u:seqGrid_0']||{}), fg: '#111111', seqMin: 9 };
            s.set('ctrlStyles', cs);
        }""")
        # Per Name statt Index 0 finden — der geteilte Pool kann schon eigene Demo-Einträge
        # haben (@dpa dd.md 20260802), 'ExcludeStepsTest' muss also nicht an Position 0 landen.
        idx_combo = pg.evaluate(f"() => {host_js}.listGroupCombos('Stepsequenzer').findIndex(c => c.name === 'ExcludeStepsTest')")
        check(idx_combo >= 0, "'ExcludeStepsTest' nicht im Combo-Pool von Stepsequenzer gefunden")
        combo_ok = pg.evaluate(f"() => {host_js}.recallGroupCombo('Stepsequenzer', {idx_combo})")
        check(combo_ok is True, "recallGroupCombo sollte true liefern")

        after = pg.evaluate("""() => {
            const s = window.__stepseq.state;
            return {
                seqLenMax: (s.get('knobMeta')||{})['seqLen_0'].max,
                seqLenBg: (s.get('ctrlStyles')||{})['k:seqLen_0'].bg,
                gridFg: (s.get('ctrlStyles')||{})['u:seqGrid_0'].fg,
                gridSeqMin: (s.get('ctrlStyles')||{})['u:seqGrid_0'].seqMin,
            };
        }""")
        check(after['seqLenMax'] == 99, f"seqLen-knobMeta.max sollte vom Combo-Recall wiederhergestellt werden (99), war {after['seqLenMax']}")
        check(after['seqLenBg'] == '#ff00ff', f"seqLen-ctrlStyles.bg sollte vom Combo-Recall wiederhergestellt werden, war {after['seqLenBg']!r}")
        check(after['gridFg'] == '#00ffaa', f"seqGrid-Ansicht (fg) sollte vom Combo-Recall wiederhergestellt werden, war {after['gridFg']!r}")
        check(after['gridSeqMin'] == 9, f"seqGrid-Data (seqMin) sollte vom Combo-Recall UNANGETASTET bleiben (9), war {after['gridSeqMin']}")

        # ── Aufräumen ──
        pg.evaluate(f"() => {host_js}.deleteGroupCombo('Stepsequenzer', {idx_combo})")
        pg.evaluate("""() => {
            const s = window.__stepseq.state;
            const km = { ...(s.get('knobMeta') || {}) }; delete km['seqLen_0']; s.set('knobMeta', km);
            const cs = { ...(s.get('ctrlStyles') || {}) }; delete cs['k:seqLen_0']; delete cs['u:seqGrid_0']; delete cs['s:seqOutput_0']; s.set('ctrlStyles', cs);
            s.set('seqOutput_0', undefined);
        }""")

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
print("SMOKE OK: Sq-Output rechtsbündig/Kürzung-am-Anfang (nur dort); Combo: seqGrid-Ansicht (fg) drin, Data (seqMin) draußen, seqLen-Knob ('Step-Zahl') ganz normal dabei.")
