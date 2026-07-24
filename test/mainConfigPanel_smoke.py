#!/usr/bin/env python3
"""Headless-Smoke: main Config als eigenes Themen-Fenster (ddw.md @dpa 20260724, Zeilen
1089-1094: "main Config ... mach daraus ein Fenster, ähnlich den Settings, aufgeräumt nach
Themen ... Label Farben bestimmbar ... Gruppen header Schriftgröße und Höhe einstellbar ...
Deutsch/Englisch").

Prüft:
  - ⚙ Config öffnet ein MiniSettings-Panel mit 4 Themen-Abschnitten (Beschriftung/
    Gruppen-Kopf/Sprache/Daten), nicht mehr das alte schmale Export/Import/Reset-Popup.
  - Label-Farbe wirkt sofort auf ein echtes Knob-Label (CSS-Var --lab-col).
  - Gruppen-Kopf-Größe wirkt sofort auf .group-title (CSS-Var --grp-head-size).
  - Sprache EN übersetzt einen bestehenden, aus i18n.js übernommenen Hint sofort im
    offenen Panel (Beweis: setLang() erreicht bereits gerenderte Elemente).
  - Export/Import/Reset (Daten-Sektion) sind weiter vorhanden.
  - "Vorgabe entfernen" setzt Label-Farbe/-Größe/Wert-BG zurück (CSS-Var verschwindet).

Lauf: python3 test/mainConfigPanel_smoke.py
Hart begrenzt (Watchdog killt nach 40s), kein Pollen.
"""
import subprocess, sys, time, os, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8193
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
        pg = b.new_page(viewport={"width": 1400, "height": 1000})
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.goto(f"http://localhost:{PORT}/", wait_until="networkidle", timeout=15000)

        pg.locator('#cfgmenu').click()
        panel = pg.locator('.mini-settings:visible')
        check(panel.count() == 1, f"Config-Panel öffnet nicht, count={panel.count()}")
        check(pg.locator('.cfg-pop').count() == 0, "Altes .cfg-pop sollte nicht mehr existieren")

        # (.cfg-section-title steht per CSS in Großbuchstaben, all_inner_texts() liefert
        # den GERENDERTEN Text — daher hier gegen die Großschreibung prüfen.)
        sections = panel.locator('.cfg-section-title').all_inner_texts()
        check(sections == ['BESCHRIFTUNG', 'GRUPPEN-KOPF', 'SPRACHE', 'DATEN'],
              f"Erwartet 4 Themen-Abschnitte in Reihenfolge, war {sections!r}")

        # ── Label-Farbe wirkt sofort ──
        color_input = panel.locator('input[type="color"]').first
        color_input.evaluate("el => { el.value = '#ff00ff'; el.dispatchEvent(new Event('input', {bubbles:true})); }")
        time.sleep(0.1)
        lab_col = pg.evaluate("() => getComputedStyle(document.documentElement).getPropertyValue('--lab-col').trim()")
        check(lab_col == '#ff00ff', f"--lab-col sollte '#ff00ff' sein, war {lab_col!r}")
        knob_label_color = pg.evaluate("""() => {
            const l = document.querySelector('.knob-label');
            return l ? getComputedStyle(l).color : null;
        }""")
        check(knob_label_color == 'rgb(255, 0, 255)', f"Ein echtes Knob-Label sollte die neue Farbe zeigen, war {knob_label_color!r}")

        # ── Gruppen-Kopf-Größe wirkt sofort ──
        number_inputs = panel.locator('.kme-row input[type="number"]')
        check(number_inputs.count() == 3, f"Erwartet 3 Zahlenfelder (Beschr.-Größe, Kopf-Größe, Kopf-Höhe), war {number_inputs.count()}")
        number_inputs.nth(1).fill("14")   # Gruppen-Kopf > Größe erlaubt 8-16, s. main.css/werkbank.js
        number_inputs.nth(1).dispatch_event("input")
        time.sleep(0.1)
        grp_title_size = pg.evaluate("""() => {
            const t = document.querySelector('.group-title');
            return t ? getComputedStyle(t).fontSize : null;
        }""")
        check(grp_title_size == '14px', f"Gruppen-Titel sollte 14px zeigen, war {grp_title_size!r}")

        # ── Sprache EN übersetzt einen bestehenden Hint sofort ──
        panel.locator('button:has-text("English")').click()
        time.sleep(0.1)
        translated = pg.evaluate("""() => {
            const rows = [...document.querySelectorAll('.mini-settings .kme-row')];
            const r = rows.find(r => r.dataset.hint && r.dataset.hint.startsWith('Applies to ALL'));
            return r ? r.dataset.hint : null;
        }""")
        check(translated is not None, "Beschriftung-Hint sollte nach EN-Umschaltung übersetzt sein")
        panel.locator('button:has-text("Deutsch")').click()   # zurück auf Default für den Rest
        time.sleep(0.1)

        # ── Daten-Sektion: Export/Import/Reset weiter vorhanden ──
        data_btns = panel.locator('.cfg-btn-row').last.locator('button').all_inner_texts()
        check(any('Export' in t for t in data_btns) and any('Import' in t for t in data_btns) and any('Reset' in t for t in data_btns),
              f"Export/Import/Reset sollten in der Daten-Sektion stehen, war {data_btns!r}")

        # ── Vorgabe entfernen setzt zurück ──
        panel.locator('button:has-text("✕ Vorgabe entfernen")').click()
        time.sleep(0.1)
        lab_col_after = pg.evaluate("() => getComputedStyle(document.documentElement).getPropertyValue('--lab-col').trim()")
        check(lab_col_after == '', f"--lab-col sollte nach 'Vorgabe entfernen' leer sein, war {lab_col_after!r}")

        # ── Aufräumen: Gruppen-Kopf-Größe zurück, Panel schließen ──
        number_inputs.nth(1).fill("10")
        number_inputs.nth(1).dispatch_event("input")
        panel.locator('.kme-close').click()
        time.sleep(0.1)
        cfg_active = pg.evaluate("() => document.querySelector('#cfgmenu').classList.contains('active')")
        check(cfg_active is False, "⚙ Config sollte nach Schließen des Panels 'active' verlieren")

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
print("SMOKE OK: main Config als Themen-Fenster (Beschriftung/Gruppen-Kopf/Sprache/Daten) funktioniert.")
