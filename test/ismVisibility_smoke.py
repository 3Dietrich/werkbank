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

ERWEITERT (dd.md 20260803, @dpa-Meldung "Ausblenden funktioniert nicht — auch nach Reload
nicht", am Tempo/MM-ISM in werkbank-leer beobachtet): ausführliche manuelle + Playwright-
Nachstellung (echter Rechtsklick auf den Header, echter Klick auf den Sichtbar-Knopf, mit
Screenshots, in Chromium UND WebKit, mit/ohne vorherige Umbenennung, mit/ohne gezogene
Position, sofort/nach Wartezeit bis 11s, nach Reload) konnte den Bug auf dem aktuellen Stand
NICHT reproduzieren — die Kette funktionierte in jeder Variante. Sektionen 5+6 unten nageln
genau DIESEN Fall (echter Rechtsklick, nicht programmatisch) fest — als Regressionsschutz,
falls die Ursache doch wiederkehrt, UND ensemble-übergreifend (werkbank-leer UND overcord,
@dpa: "ISM verstecken soll für alle werkbank übergreifend sein"), an mehreren ISM-Typen
(Tempo&MM/Scope/Debug), nicht nur an Rec. Sektion 7 prüft den ECHTEN, bestätigten Fund dieses
Durchgangs: LevelMeter hatte GAR KEINEN Weg, sich selbst auszublenden (kein `h2`, also kein
Rechtsklick möglich) UND tauchte in der ISMs-Unterrubrik nur auf, wenn es SCHON versteckt war
— ein Henne-Ei-Problem, das es faktisch unerreichbar machte. Fix: `noHeader`-Flag in
lib/mainSettings.js, LevelMeter-Zeile steht jetzt IMMER dort mit einfachem Ein/Aus.

Lauf: python3 test/ismVisibility_smoke.py — Watchdog killt nach 60s, kein Pollen (länger als
die ursprünglichen 40s, weil jetzt zwei Ensembles + mehr ISM-Typen durchlaufen).
"""
import subprocess, sys, time, os, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8177
HARD_LIMIT_S = 60

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

        # ── Helfer für 5+6: ECHTER Rechtsklick auf den ISM-Header + ECHTER Klick auf den
        # Sichtbar-Knopf im Instrument-Panel (kein setHidden()-Aufruf!) — genau der Weg, den
        # @dpa laut Meldung gegangen ist. Prüft display+Klasse (NICHT offsetParent — das ist
        # bei position:fixed-Elementen wie #bench-levelmeter laut Spec immer null, s. Sektion 7,
        # darum hier gleich einheitlich per getComputedStyle) sowie Reload-Festigkeit.
        def real_click_hide_show(sel, label):
            get_state = lambda: pg.evaluate(
                "(sel) => { const el = document.querySelector(sel); const cs = getComputedStyle(el); "
                "return { display: cs.display, hasClass: el.classList.contains('ism-hidden') }; }", sel)
            s0 = get_state()
            check(s0['display'] != 'none' and not s0['hasClass'], f"{label}: sollte zu Beginn sichtbar sein, war {s0}")

            h2 = pg.locator(f'{sel} > h2')
            h2.click(button="right")
            time.sleep(0.2)
            btn = pg.locator('.mini-settings').locator('button.kme-panelbtn')
            check(btn.count() == 1, f"{label}: Sichtbar-Knopf im Rechtsklick-Panel nicht eindeutig gefunden ({btn.count()}x)")
            btn.first.click()
            time.sleep(0.2)
            s1 = get_state()
            check(s1['display'] == 'none' and s1['hasClass'], f"{label}: sollte nach echtem Klick auf Sichtbar ausgeblendet sein, war {s1}")
            pg.keyboard.press('Escape')
            time.sleep(0.1)

            # Reload-Fest.
            pg.reload(wait_until="networkidle", timeout=15000)
            s2 = get_state()
            check(s2['display'] == 'none' and s2['hasClass'], f"{label}: sollte einen Reload versteckt überstehen, war {s2}")

            # Wieder einblenden über die Haupt-Settings-Unterrubrik (echter Klick, kein setHidden()).
            pg.locator('#cfgmenu').click()
            time.sleep(0.15)
            panel2 = pg.locator('.sw-window:visible')
            rows2 = panel2.locator('.sw-row')
            idx = -1
            for i in range(rows2.count()):
                lab = rows2.nth(i).locator('label')
                if lab.count() and lab.first.text_content().strip() == label:
                    idx = i; break
            check(idx >= 0, f"{label}: keine Zeile in der ISMs-Unterrubrik gefunden, obwohl ausgeblendet")
            if idx >= 0:
                rows2.nth(idx).locator('button.kme-panelbtn').click()
                time.sleep(0.15)
            pg.keyboard.press('Escape')
            time.sleep(0.1)
            s3 = get_state()
            check(s3['display'] != 'none' and not s3['hasClass'], f"{label}: sollte nach Wieder-Einblenden sichtbar sein, war {s3}")

        # ── 5) Ensemble-übergreifend + weitere ISM-Typen, ECHTE Klicks (@dpa: "ISM verstecken
        # soll für alle werkbank übergreifend sein") — overcord: Scope + Debug zusätzlich zu Rec ──
        real_click_hide_show('#bench-scope', 'Signal-Scopes')
        real_click_hide_show('#bench-debug', 'Debug')

        # ── 6) werkbank-leer: derselbe Weg, ECHT wie @dpas Meldung — Rechtsklick auf den
        # Tempo/MM-Header (#bench-taktgeber, per Default-Demo-Config bereits auf "Tempo, MM"
        # umbenannt) + Rec + Scope + Debug. Frisches localStorage.clear() NICHT nötig (eigener
        # Präfix werkbank-leer_* vs. werkbank_*, s. lib/appId.js) — beide Ensembles teilen sich
        # denselben Origin/Port, aber nicht denselben Datentopf.
        pg.goto(f"http://localhost:{PORT}/werkbank-leer/", wait_until="networkidle", timeout=15000)
        pg.evaluate("() => { localStorage.clear(); }")
        pg.reload(wait_until="networkidle", timeout=15000)
        real_click_hide_show('#bench-taktgeber', 'Tempo, MM')
        real_click_hide_show('#bench-rec', 'Rec')
        real_click_hide_show('#bench-scope', 'Signal-Scopes')
        real_click_hide_show('#bench-debug', 'Debug')

        # ── 7) LevelMeter-Erreichbarkeit (ddw.md 20260803, @dpa: "beim 'Außenseiter' Label ist
        # es zu sehen, dieses weg-Icon soll das LevelMeter in die main Settings wandern") —
        # LevelMeter hat KEIN h2 (kein Rechtsklick-Weg), darum MUSS die Zeile in der ISMs-
        # Unterrubrik IMMER stehen (auch wenn NICHT versteckt), mit simplem Ein/Aus statt
        # "wieder einblenden". #bench-levelmeter ist `position:fixed` (css/werkbank.css) —
        # offsetParent ist dafür laut Spec IMMER null, selbst wenn sichtbar; darum hier bewusst
        # NICHT offsetParent, sondern getComputedStyle(display) prüfen (Stolperfalle beim
        # ersten Testentwurf dieses Durchgangs, gleich mit dokumentiert).
        def levelmeter_state():
            return pg.evaluate(
                "() => { const el = document.querySelector('#bench-levelmeter'); const cs = getComputedStyle(el); "
                "return { display: cs.display, hasClass: el.classList.contains('ism-hidden') }; }")

        lm0 = levelmeter_state()
        check(lm0['display'] != 'none' and not lm0['hasClass'], f"LevelMeter sollte zu Beginn sichtbar sein, war {lm0}")

        pg.locator('#cfgmenu').click()
        time.sleep(0.15)
        panel3 = pg.locator('.sw-window:visible')
        rows3 = panel3.locator('.sw-row')
        idxM = -1
        for i in range(rows3.count()):
            lab = rows3.nth(i).locator('label')
            if lab.count() and lab.first.text_content().strip() == 'Meter':
                idxM = i; break
        check(idxM >= 0, "Meter-Zeile fehlt in der ISMs-Unterrubrik, obwohl NICHT versteckt (noHeader-Fall muss IMMER stehen)")
        if idxM >= 0:
            meter_btn = rows3.nth(idxM).locator('button.kme-panelbtn')
            meter_btn.click()
            time.sleep(0.2)
            lm1 = levelmeter_state()
            check(lm1['display'] == 'none' and lm1['hasClass'], f"LevelMeter sollte nach dem Ein/Aus-Klick ausgeblendet sein, war {lm1}")
            # Zeile bleibt stehen (kein r.remove() bei noHeader-ISMs) — derselbe Knopf schaltet zurück.
            still_there = rows3.nth(idxM).locator('label').first.text_content().strip() == 'Meter'
            check(still_there, "Meter-Zeile sollte nach dem Ausblenden STEHEN BLEIBEN (nicht wie bei geheaderten ISMs entfernt werden)")
            meter_btn.click()
            time.sleep(0.2)
            lm2 = levelmeter_state()
            check(lm2['display'] != 'none' and not lm2['hasClass'], f"LevelMeter sollte nach erneutem Klick wieder sichtbar sein, war {lm2}")
        pg.keyboard.press('Escape')

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
