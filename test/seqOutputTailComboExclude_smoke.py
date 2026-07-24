#!/usr/bin/env python3
"""Headless-Smoke: ddw.md @dpa 20260724 (Zeile 1082-1087):
'StepSeq/StepSeq/output: soll ... den Namen "rechts aligned" anzeigen ... (Das ist etwas
besonderes nur für Output..)' + 'Combo: soll nicht den Steps inhalt speichern/recallen!'

Prüft:
  1. Sq-Output-PickMenu (collapsed .pm-name) hat die neue 'pm-name-tail'-Klasse und damit
     computed direction:rtl (Kürzung/Alignment am ANFANG statt am Ende) — NUR dieses eine
     PickMenu, nicht z.B. das Gruppen-Combo-PickMenu (Regressionscheck: bleibt unverändert).
  2. Combo (Gruppen-Optik-Speicher) speichert/recallt den 'seqLen'-Knob ('Steps') NICHT mehr:
     knobMeta/ctrlStyles für seqLen bleiben nach einem Combo-Recall unangetastet, während ein
     anderer Control (u:seqGrid, Farbe) ganz normal weiter recallt (Regressionscheck, wie
     seqComboSnapPool_smoke.py).

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
        pg.goto(f"http://localhost:{PORT}/", wait_until="networkidle", timeout=15000)

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
        pg.get_by_text("Poly-Synth → Höhen-Dämpf", exact=True).click()
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
        check(geo['text'] == 'Poly-Synth → Höhen-Dämpf', f"Sq-Output sollte den vollen Namen im DOM tragen (nur visuell gekürzt), war {geo['text']!r}")
        check(geo['rightGap'] < 2, f"Sq-Output-Text sollte rechtsbündig in seiner eigenen Box sitzen (Gap<2px), war {geo['rightGap']}px")
        check(geo['clipped'], "Sq-Output-Text sollte bei 90px tatsächlich sichtbar beschnitten sein (scrollWidth > clientWidth)")

        # ── 2) Combo exkludiert 'seqLen' ──
        pg.evaluate("""() => {
            const s = window.__stepseq.state;
            const km = { ...(s.get('knobMeta') || {}) };
            km['seqLen_0'] = { ...(km['seqLen_0']||{}), max: 99 };
            s.set('knobMeta', km);
            const cs = { ...(s.get('ctrlStyles') || {}) };
            cs['k:seqLen_0'] = { ...(cs['k:seqLen_0']||{}), bg: '#ff00ff' };
            cs['u:seqGrid_0'] = { ...(cs['u:seqGrid_0']||{}), fg: '#00ffaa' };   // Kontroll-Control
            s.set('ctrlStyles', cs);
        }""")
        host_js = "window.__stepseq.host"
        pg.evaluate(f"() => {host_js}.saveGroupCombo('Stepsequenzer', 'ExcludeStepsTest')")

        # Gespeichertes Combo-Payload direkt inspizieren: 'seqLen' darf NICHT drin sein.
        payload = pg.evaluate("""() => {
            const list = (window.__stepseq.state.get('groupCombos')||{})['Sequenzer'] || [];
            const e = list.find(c => c.name === 'ExcludeStepsTest');
            return e ? { ctrlStyles: e.ctrlStyles, knobMeta: e.knobMeta } : null;
        }""")
        check(payload is not None, "Combo 'ExcludeStepsTest' sollte gespeichert sein")
        if payload:
            check('seqLen' not in (payload.get('knobMeta') or {}), f"knobMeta sollte 'seqLen' NICHT enthalten: {payload.get('knobMeta')}")
            check('k:seqLen' not in (payload.get('ctrlStyles') or {}), f"ctrlStyles sollte 'k:seqLen' NICHT enthalten: {payload.get('ctrlStyles')}")
            check('u:seqGrid' in (payload.get('ctrlStyles') or {}), "ctrlStyles sollte den Kontroll-Control 'u:seqGrid' weiter enthalten")

        # Werte ändern, recallen, prüfen: seqLen bleibt unangetastet, seqGrid-Farbe wird wiederhergestellt.
        pg.evaluate("""() => {
            const s = window.__stepseq.state;
            const km = { ...(s.get('knobMeta') || {}) };
            km['seqLen_0'] = { ...(km['seqLen_0']||{}), max: 7 };
            s.set('knobMeta', km);
            const cs = { ...(s.get('ctrlStyles') || {}) };
            cs['k:seqLen_0'] = { ...(cs['k:seqLen_0']||{}), bg: '#000000' };
            cs['u:seqGrid_0'] = { ...(cs['u:seqGrid_0']||{}), fg: '#111111' };
            s.set('ctrlStyles', cs);
        }""")
        combo_ok = pg.evaluate(f"() => {host_js}.recallGroupCombo('Stepsequenzer', 0)")
        check(combo_ok is True, "recallGroupCombo sollte true liefern")

        after = pg.evaluate("""() => {
            const s = window.__stepseq.state;
            return {
                seqLenMax: (s.get('knobMeta')||{})['seqLen_0'].max,
                seqLenBg: (s.get('ctrlStyles')||{})['k:seqLen_0'].bg,
                gridFg: (s.get('ctrlStyles')||{})['u:seqGrid_0'].fg,
            };
        }""")
        check(after['seqLenMax'] == 7, f"seqLen-knobMeta.max sollte vom Combo-Recall UNANGETASTET bleiben (7), war {after['seqLenMax']}")
        check(after['seqLenBg'] == '#000000', f"seqLen-ctrlStyles.bg sollte vom Combo-Recall UNANGETASTET bleiben, war {after['seqLenBg']!r}")
        check(after['gridFg'] == '#00ffaa', f"seqGrid-Farbe sollte vom Combo-Recall wiederhergestellt werden, war {after['gridFg']!r}")

        # ── Aufräumen ──
        pg.evaluate(f"() => {host_js}.deleteGroupCombo('Stepsequenzer', 0)")
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
print("SMOKE OK: Sq-Output rechtsbündig/Kürzung-am-Anfang (nur dort), Combo exkludiert 'Steps' (seqLen).")
