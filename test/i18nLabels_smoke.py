#!/usr/bin/env python3
"""Headless-Smoke: Sprachumschaltung übersetzt echte Control-Labels/Gruppennamen live
(ddw.md @dpa 20260724, main Config: "Alle deutschen Worte auf der gesamten Oberfläche
sollen (automatisch) übersetzt werden ... bei zukünftigen englischen Veränderungen: beide
Sprachen getrennt halten").

Prüft:
  - Umschalten auf English übersetzt sofort: Gruppennamen (GroupHost.js group-title),
    Knob-Labels (Knob.js, über polysynth 'Oktaven'/'Höhen-Dämpf'), OHNE Reload.
  - Zurück auf Deutsch stellt die Original-Texte wieder her.
  - Ein selbst umbenannter Knob-Name wird von einem Sprachwechsel NICHT überschrieben
    (i18n.js stopText() — "selbst ernannte Labels bleiben unangetastet").

Lauf: python3 test/i18nLabels_smoke.py
Hart begrenzt (Watchdog killt nach 40s), kein Pollen.
"""
import subprocess, sys, time, os, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8195
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

        # Custom-Namen abräumen + neu laden (Smoke-Test-Altlast, todos.md 20260802_131434):
        # presets/werkbank-config.json (@dpas gewachsene Werkseinstellungen) hat inzwischen
        # ausgerechnet GENAU die hier geprüften Gruppen/den Oktaven-Knob selbst umbenannt
        # (groupStyles.name: "Transport / Tempo"→"Tempo", "Takt / Metronom"→"Click",
        # "Audio-Osz"→"OSZ", "ADSR"→"DSR", knobMeta.kbOctaves.label→"Okt."). Per Design
        # (i18n.js stopText(), s. Knob.js) bleiben solche selbst vergebenen Namen ÜBER JEDEN
        # Sprachwechsel hinweg unangetastet — GENAU das Verhalten, das dieser Test weiter
        # unten für "MeineOktaven" selbst beweisen will. Ein bereits per Custom-Label
        # gesetzter Knob lässt sich nicht live zurück in den i18n-Kreislauf holen (stopText()
        # ist einseitig) — darum: Overrides aus dem State entfernen und NEU LADEN, damit
        # GroupHost/Knob.js diese Controls frisch aus den Code-Defaults aufbauen, statt den
        # bereits personalisierten Live-Zustand umzubiegen. Ändert NICHTS an der echten
        # Werkseinstellungen-Datei (rein In-Memory/localStorage dieser Browser-Instanz).
        pg.evaluate("""() => {
            const stripName = (state, groupNames) => {
                const styles = { ...(state.get('groupStyles') || {}) };
                for (const g of groupNames) {
                    if (styles[g] && styles[g].name != null) {
                        const { name, ...rest } = styles[g];
                        styles[g] = rest;
                    }
                }
                state.set('groupStyles', styles);
            };
            stripName(window.__takt.state, ['Transport / Tempo', 'Takt / Metronom']);
            stripName(window.__polysynth.state, ['Audio-Osz', 'ADSR']);
            const km = { ...(window.__polysynth.state.get('knobMeta') || {}) };
            if (km.kbOctaves) { delete km.kbOctaves; window.__polysynth.state.set('knobMeta', km); }
        }""")
        pg.reload(wait_until="networkidle")
        pg.wait_for_timeout(300)

        titles_de_before = pg.evaluate("() => [...document.querySelectorAll('.group-title')].map(g => g.textContent)")
        check('Takt / Metronom' in titles_de_before, f"Default sollte Deutsch sein, war {titles_de_before!r}")

        # ── EN umschalten (über das main-Config-Panel, echter Bedienweg) ──
        # .first: seit der Backups-Sektion (ddw.md 20260802 Punkt 4) gibt es ein zweites
        # .sw-select (Backup-Auswahl) — Sprache steht zuerst im Fenster, bleibt also das erste.
        pg.locator('#cfgmenu').click()
        panel = pg.locator('.sw-window:visible')
        panel.locator('.sw-select').first.select_option('en')
        time.sleep(0.1)
        panel.locator('.sw-close').click()

        titles_en = pg.evaluate("() => [...document.querySelectorAll('.group-title')].map(g => g.textContent)")
        check('Beat / metronome' in titles_en and 'Transport / tempo' in titles_en,
              f"Gruppennamen sollten sofort übersetzt sein, war {titles_en!r}")

        knob_en = pg.evaluate("""() => {
            const l = [...document.querySelectorAll('.knob-label')].find(l => l.textContent === 'Octaves' || l.textContent === 'Oktaven');
            return l ? l.textContent : 'NOTFOUND';
        }""")
        check(knob_en == 'Octaves', f"Knob-Label 'Oktaven' sollte zu 'Octaves' übersetzt sein, war {knob_en!r}")

        # ── zurück auf Deutsch: Originaltexte wieder da ──
        pg.locator('#cfgmenu').click()
        panel2 = pg.locator('.sw-window:visible')
        panel2.locator('.sw-select').first.select_option('de')
        time.sleep(0.1)
        panel2.locator('.sw-close').click()

        titles_de_after = pg.evaluate("() => [...document.querySelectorAll('.group-title')].map(g => g.textContent)")
        check(titles_de_after == titles_de_before, f"Zurück auf Deutsch sollte die Original-Titel wiederherstellen, war {titles_de_after!r} vs. {titles_de_before!r}")

        # ── Selbst umbenannter Knob-Name übersteht einen Sprachwechsel unverändert ──
        oktaven_knob = pg.locator('.knob-container').filter(has=pg.locator('.knob-label', has_text='Oktaven')).first
        check(oktaven_knob.count() >= 1, "Oktaven-Knob nicht gefunden")
        oktaven_knob.click(button="right")
        kme = pg.locator('.knob-meta-editor:visible').first
        name_in = kme.locator('input.kme-label, input[placeholder], .kme-row input[type="text"]').first
        name_in.fill("MeineOktaven")
        name_in.dispatch_event("change")
        time.sleep(0.1)
        kme.locator('.kme-close').click()
        time.sleep(0.1)

        renamed_label = pg.evaluate("""() => {
            const l = [...document.querySelectorAll('.knob-label')].find(l => l.textContent === 'MeineOktaven');
            return l ? l.textContent : 'NOTFOUND';
        }""")
        check(renamed_label == 'MeineOktaven', f"Umbenennung sollte sofort greifen, war {renamed_label!r}")

        # Sprache hin und zurück — der custom Name darf NIE zu 'Octaves'/'Oktaven' zurückspringen.
        pg.locator('#cfgmenu').click()
        panel3 = pg.locator('.sw-window:visible')
        panel3.locator('.sw-select').first.select_option('en')
        time.sleep(0.1)
        after_en = pg.evaluate("""() => {
            const l = [...document.querySelectorAll('.knob-label')].find(l => l.textContent === 'MeineOktaven');
            return l ? l.textContent : 'NOTFOUND';
        }""")
        check(after_en == 'MeineOktaven', f"Custom-Name sollte Sprachwechsel überstehen (nicht übersetzt werden), war {after_en!r}")
        panel3.locator('.sw-select').first.select_option('de')
        time.sleep(0.1)
        panel3.locator('.sw-close').click()

        # ── Aufräumen: Custom-Name wieder entfernen ──
        oktaven_knob2 = pg.locator('.knob-container').filter(has=pg.locator('.knob-label', has_text='MeineOktaven')).first
        oktaven_knob2.click(button="right")
        kme2 = pg.locator('.knob-meta-editor:visible').first
        name_in2 = kme2.locator('input.kme-label, input[placeholder], .kme-row input[type="text"]').first
        name_in2.fill("Oktaven")
        name_in2.dispatch_event("change")
        time.sleep(0.1)
        kme2.locator('.kme-close').click()

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
print("SMOKE OK: Sprachumschaltung übersetzt Gruppennamen/Knob-Labels live, selbst vergebene Namen bleiben unangetastet.")
