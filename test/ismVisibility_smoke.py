#!/usr/bin/env python3
"""Headless-Smoke: ISM-Sichtbarkeits-Toggle (ddw.md 20260803_135251, @dpa: "es gibt für das
Ensemble ja kein extra Setting … um ISM auch wegschalten zu können, so wie in den Gruppen die
Controls"). Nagelt die Kette fest, die lib/InstrumentSettings.js + lib/mainSettings.js dafür
bekommen haben:

  - setHidden(true) versteckt die GANZE .wb-bench-Sektion (CSS-Klasse .ism-hidden, css/main.css)
    — sie bleibt im DOM (wie .ctrl-offpanel bei Controls), nur unsichtbar.
  - Ein verstecktes Standard-ISM taucht in der neuen "ISMs"-Unterrubrik der Haupt-Settings
    (⚙, lib/mainSettings.js) auf — sonst wäre es nirgends mehr auffindbar (genau das von @dpa
    benannte Problem).
  - Von DORT aus (echter Button-Klick im Settings-Fenster) wieder einblendbar, ohne dass man
    dafür den (jetzt unsichtbaren) Instrument-Header braucht.
  - Der Zustand übersteht einen Reload (State-Key `ismHidden` lebt im ISM-eigenen State, wie
    `instrPos`).

Getestet am Rec-ISM (`window.__rec.instr`, s. overcord/werkbank.js) — programmatisch über
window.__rec.instr.setHidden()/isHidden() statt echtem Rechtsklick (robuster/schneller, wie
test/ismSnapshotSqCount_smoke.py es für ISM-Snapshots vormacht); der Weg über die Haupt-
Settings-Unterrubrik läuft dagegen über echte UI-Klicks, weil GENAU DAS der neue, zu prüfende
Teil ist.

Lauf: python3 test/ismVisibility_smoke.py — Watchdog killt nach 40s, kein Pollen.
"""
import subprocess, sys, time, os, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8177
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

        # ── 0) Ausgangslage: Rec-ISM sichtbar, nicht als versteckt markiert ──
        hidden0 = pg.evaluate("() => window.__rec.instr.isHidden()")
        check(hidden0 is False, f"Rec sollte zu Beginn NICHT ausgeblendet sein, war {hidden0}")
        vis0 = pg.evaluate("() => document.querySelector('#bench-rec').offsetParent !== null")
        check(vis0, "Rec-Sektion sollte zu Beginn sichtbar sein")

        # ── 1) Ausblenden (programmatisch, wie ismSnapshotSqCount_smoke.py) — verschwindet
        # aus dem Panel, bleibt aber im DOM (.ism-hidden, s. css/main.css) ──
        pg.evaluate("() => window.__rec.instr.setHidden(true)")
        hidden1 = pg.evaluate("() => window.__rec.instr.isHidden()")
        check(hidden1 is True, "isHidden() sollte nach setHidden(true) true liefern")
        has_class = pg.evaluate("() => document.querySelector('#bench-rec').classList.contains('ism-hidden')")
        check(has_class, "#bench-rec sollte die Klasse .ism-hidden tragen")
        vis1 = pg.evaluate("() => document.querySelector('#bench-rec').offsetParent !== null")
        check(not vis1, "Rec-Sektion sollte nach setHidden(true) unsichtbar sein (offsetParent null)")
        still_in_dom = pg.evaluate("() => !!document.querySelector('#bench-rec #rec')")
        check(still_in_dom, "Rec-Instrument sollte weiter im DOM stehen (nicht abgebaut, nur versteckt)")
        state_key = pg.evaluate("() => !!window.__rec.state.get('ismHidden')")
        check(state_key, "State-Key 'ismHidden' sollte im Rec-eigenen State gesetzt sein (wie instrPos)")

        # ── 2) Haupt-Settings (⚙) öffnen: Rec muss in der neuen "ISMs"-Unterrubrik auftauchen ──
        pg.locator('#cfgmenu').click()
        panel = pg.locator('.sw-window:visible')
        check(panel.count() >= 1, "Haupt-Settings-Fenster nicht offen")
        # Exakter Label-Textvergleich statt has_text (der matcht auch Teilstrings/Substrings
        # wie ein künftiges "Rec-Format" — hier soll wirklich NUR die Zeile "Rec" treffen).
        rows = panel.locator('.sw-row')
        row_count = rows.count()
        found_idx = -1
        for i in range(row_count):
            lab = rows.nth(i).locator('label')
            if lab.count() and lab.first.text_content().strip() == 'Rec':
                found_idx = i
                break
        check(found_idx >= 0, "Kein Settings-Zeile mit Label 'Rec' in der ISMs-Unterrubrik gefunden")

        if found_idx >= 0:
            rec_row = rows.nth(found_idx)
            toggle_btn = rec_row.locator('button.kme-panelbtn')
            check(toggle_btn.count() == 1, "Sichtbar-Umschalt-Knopf in der Rec-Zeile nicht gefunden")

            # ── 3) Von dort wieder einblendbar (echter Klick im Settings-Fenster) ──
            toggle_btn.click()
            time.sleep(0.15)
            hidden2 = pg.evaluate("() => window.__rec.instr.isHidden()")
            check(hidden2 is False, "isHidden() sollte nach Klick auf den Unterrubrik-Knopf wieder false sein")
            vis2 = pg.evaluate("() => document.querySelector('#bench-rec').offsetParent !== null")
            check(vis2, "Rec-Sektion sollte nach dem Wieder-Einblenden sichtbar sein")
            # Zeile verschwindet sofort aus der Liste (r.remove() in mainSettings.js) — NEU
            # scannen statt die alte Locator-Position wiederzuverwenden (die zeigt nach dem
            # Entfernen einfach auf die nächste Zeile an derselben Stelle, false positive).
            labels_after = panel.locator('.sw-row label').all_text_contents()
            check('Rec' not in [t.strip() for t in labels_after],
                  f"Rec-Zeile sollte nach dem Wieder-Einblenden weg sein, Labels waren {labels_after!r}")

        # Settings-Fenster schließen (ESC) vor dem nächsten Schritt.
        pg.keyboard.press('Escape')
        time.sleep(0.1)

        # ── 4) State übersteht Reload — erneut ausblenden, neu laden, Zustand muss bleiben ──
        pg.evaluate("() => window.__rec.instr.setHidden(true)")
        pg.reload(wait_until="networkidle", timeout=15000)
        hidden3 = pg.evaluate("() => window.__rec.instr.isHidden()")
        check(hidden3 is True, "isHidden() sollte einen Reload überstehen (State-Key ismHidden)")
        vis3 = pg.evaluate("() => document.querySelector('#bench-rec').offsetParent !== null")
        check(not vis3, "Rec-Sektion sollte nach Reload weiterhin unsichtbar sein")

        # Aufräumen: für den nächsten Testlauf/@dpa nicht versteckt hinterlassen.
        pg.evaluate("() => window.__rec.instr.setHidden(false)")

        b.close()
except Exception as e:
    fails.append(f"EXCEPTION: {e}")
finally:
    srv.terminate()

if errors:
    fails.append("Konsolen-/Page-Errors: " + " | ".join(errors[:5]))

if fails:
    print("SMOKE FAIL:")
    for f in fails:
        print("  -", f)
    sys.exit(1)
print("SMOKE OK: ISM-Sichtbarkeits-Toggle (ausblenden -> Unterrubrik -> wieder einblenden -> Reload-fest).")
