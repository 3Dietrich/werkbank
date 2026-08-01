#!/usr/bin/env python3
"""Headless-Smoke für den „Panel?"-Schalter jedes Controls (@dpa dd.md 20260801).

Jedes Control kann zwischen zwei Heimaten umschalten:
  A) auf dem Panel - frei designbar, wie bisher;
  B) NICHT auf dem Panel, sondern nur in den Gruppen-Settings, dort einheitlich
     platzsparend als „Label, Value".

Das ist ausdrücklich NICHT das bestehende „Gestalt: Ohne" (viewSize:'none') des
Reglers - das ist Paneldesign (Knob ohne Dial, aber weiterhin AUF dem Panel).
@dpa: „Es braucht einen völlig neuen toggle für 'Panel?' … dabei das Panel updaten
(Control weg/sichtbar), die settings dabei nicht schließen, erst durch escape."

Nagelt fest:
  1. Seite lädt fehlerfrei.
  2. Rechtsklick auf einen Regler öffnet den KnobMetaEditor MIT „Panel?"-Knopf.
  3. Klick darauf blendet das Control sofort aus dem Panel aus (.ctrl-offpanel) und
     lässt das Settings-Fenster OFFEN - genau @dpas Kernforderung.
  4. Der Knopf zeigt den Zustand (.on) und graut die rein grafischen Felder ab
     (.kme-dim-graphics) - Tontechnik bleibt bedienbar.
  5. ESC schließt (und nur ESC/✕).
  6. Der State-Key `ctrlOffPanel` trägt die ID und überlebt einen Reload.
  7. Die Gruppen-Settings listen das Control als Label+Value-Zeile, der Wert wirkt
     in beide Richtungen (Zeile -> State und State -> Zeile).
  8. Dasselbe für ein Nicht-Knob-Control (Toggle, ElementSettings).
  9. Zurückschalten holt das Control wieder aufs Panel.
 10. Ein aus der Liste geöffnetes Control-Settings-Fenster reißt die Gruppen-Settings
     nicht weg (Außenklick-Ausnahme).
 11. UNIKAT-Sonderfenster-Opener (z.B. „⚙ Tab") bekommen off-panel eine „Kleindarstellung":
     ein gleich großer Knopf, der die echte Aktion auslöst (@dpa dd.md 20260801_2).

Lauf: python3 test/offPanelToggle_smoke.py
Hart begrenzt (Watchdog killt nach 45s), kein Pollen.
"""
import subprocess, sys, time, os, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8236
HARD_LIMIT_S = 45

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
        pg = b.new_page(viewport={"width": 1500, "height": 1000})
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.goto(f"http://localhost:{PORT}/werkbank-leer.html", wait_until="networkidle", timeout=15000)
        # Sauberer Ausgangszustand: ein früherer Lauf könnte ctrlOffPanel hinterlassen haben.
        pg.evaluate("() => window.__takt.state.set('ctrlOffPanel', {})")
        # presets/default-config.json gibt dem BPM-Regler demo-halber das Label "." (echter
        # Bestand, kein Test-Bug) - für die Label-Prüfung unten das Factory-Label 'BPM' wieder
        # freilegen, ohne den Rest der demo-Optik anzutasten.
        pg.evaluate("""() => {
            const km = { ...(window.__takt.state.get('knobMeta') || {}) };
            if (km.bpm) { km.bpm = { ...km.bpm }; delete km.bpm.label; window.__takt.state.set('knobMeta', km); }
        }""")
        time.sleep(0.15)

        bpm = pg.locator('#bench-taktgeber [data-ctrl="k:bpm"]')
        check(bpm.count() == 1, 'Regler k:bpm fehlt')
        check(bpm.first.is_visible(), 'k:bpm sollte zu Beginn auf dem Panel sichtbar sein')

        # ── 2. Rechtsklick öffnet den Regler-Editor mit „Panel?"-Knopf ──
        bpm.first.dispatch_event('contextmenu')
        time.sleep(0.2)
        kme = pg.locator('.knob-meta-editor:not(.elem-settings):visible')
        check(kme.is_visible(), 'KnobMetaEditor öffnet nicht per Rechtsklick')
        pbtn = kme.locator('.kme-panelbtn')
        check(pbtn.count() == 1, '„Panel?"-Knopf fehlt in der Kopfzeile des Regler-Editors')
        check(not pbtn.evaluate("el => el.classList.contains('on')"),
              'Knopf sollte anfangs AUS sein (Control sitzt auf dem Panel)')

        # ── 3./4. Klick: Control verschwindet, Fenster bleibt offen ──
        pbtn.click()
        time.sleep(0.25)
        check(kme.is_visible(), '@dpa-Kernforderung verletzt: das Settings-Fenster darf beim Umschalten NICHT schließen')
        check(pbtn.evaluate("el => el.classList.contains('on')"), 'Knopf sollte nach dem Umschalten .on tragen')
        check(bpm.first.evaluate("el => el.classList.contains('ctrl-offpanel')"),
              'k:bpm sollte die Klasse .ctrl-offpanel tragen')
        check(not bpm.first.is_visible(), 'k:bpm sollte nach dem Umschalten NICHT mehr auf dem Panel sichtbar sein')
        check(kme.evaluate("el => el.classList.contains('kme-dim-graphics')"),
              'Grafik-Felder sollten off-panel abgegraut sein (.kme-dim-graphics)')
        check(kme.locator('.kme-row[data-graphic]').count() > 0,
              'Es sollten Zeilen als rein grafisch markiert sein (data-graphic)')
        # Das Control bleibt GEBAUT im Gruppen-DOM stehen (Combos/Snapshots sammeln über
        # [data-ctrl] innerhalb der Gruppe) - nur unsichtbar, nicht entfernt.
        check(pg.locator('#bench-taktgeber [data-ctrl="k:bpm"]').count() == 1,
              'k:bpm darf NICHT aus dem Gruppen-DOM entfernt werden (sonst fällt es aus Combos/Snapshots)')

        # ── 5. ESC schließt ──
        pg.keyboard.press("Escape")
        time.sleep(0.2)
        check(not kme.is_visible(), 'ESC sollte den Regler-Editor schließen')

        # ── 6. State-Key ──
        off = pg.evaluate("() => window.__takt.state.get('ctrlOffPanel') || {}")
        check(off.get('k:bpm') is True, f"ctrlOffPanel sollte 'k:bpm' tragen, war {off!r}")

        # ── 7. Gruppen-Settings listen das Control als Label+Value ──
        grp = pg.locator('#bench-taktgeber .group[data-group="Transport / Tempo"]')
        check(grp.count() == 1, 'Gruppe „Transport / Tempo" fehlt')
        grp.locator('.group-title').dispatch_event('contextmenu')
        time.sleep(0.25)
        gs = pg.locator('.group-settings')
        check(gs.is_visible(), 'Gruppen-Settings öffnen nicht per Rechtsklick')
        oplist = gs.locator('.gs-offpanel')
        check(oplist.count() == 1, 'Die Off-Panel-Liste (.gs-offpanel) fehlt in den Gruppen-Settings')
        rows = gs.locator('.gs-op-row')
        check(rows.count() == 1, f'Genau eine Off-Panel-Zeile erwartet, waren {rows.count()}')
        lab = rows.first.locator('.gs-op-lab').inner_text().strip()
        check('BPM' in lab, f"Zeilen-Label sollte den Regler-Namen 'BPM' zeigen, war {lab!r}")
        num = rows.first.locator('.gs-op-val input[type="number"]')
        check(num.count() == 1, 'Off-Panel-Zeile eines Reglers braucht ein Zahlenfeld')

        # Zeile -> State
        num.fill('123')
        num.dispatch_event('input')
        num.dispatch_event('change')
        time.sleep(0.2)
        check(pg.evaluate("() => window.__takt.state.get('bpm')") == 123,
              'Wert aus der Off-Panel-Zeile sollte im State ankommen')
        # State -> Zeile (Engine/Taste/MIDI ändern den Wert von außen). Erst blur() – der
        # Sync-Handler lässt ein FOKUSSIERTES Feld bewusst in Ruhe (sonst würde er laufendes
        # Tippen überschreiben), genau wie ein echter Nutzer das Feld nach dem Eintippen verlässt.
        num.blur()
        pg.evaluate("() => window.__takt.state.set('bpm', 96)")
        time.sleep(0.2)
        check(num.input_value() == '96',
              f'Off-Panel-Zeile sollte einer Wertänderung von außen folgen, war {num.input_value()!r}')

        # ── 10. Rechtsklick auf die Zeile öffnet die Control-Settings, ohne die Gruppen-
        #        Settings wegzureißen (Außenklick-Ausnahme für .knob-meta-editor).
        rows.first.dispatch_event('contextmenu')
        time.sleep(0.25)
        check(kme.is_visible(), 'Rechtsklick auf die Off-Panel-Zeile sollte den Regler-Editor öffnen')
        kme.locator('.kme-min').click()
        time.sleep(0.2)
        check(gs.is_visible(), 'Klick in die Control-Settings darf die Gruppen-Settings nicht schließen')

        # ── 9. Zurück aufs Panel ──
        kme.locator('.kme-panelbtn').click()
        time.sleep(0.25)
        check(bpm.first.is_visible(), 'Zurückschalten sollte k:bpm wieder aufs Panel holen')
        # Der Container bleibt im DOM (fester Platzhalter, s. openGroupSettings) - leer wird er
        # per CSS `:empty` ausgeblendet, statt bei jedem Umschalten neu angehängt zu werden.
        check(gs.locator('.gs-offpanel .gs-op-row').count() == 0,
              'Ist nichts mehr off-panel, soll die Liste keine Zeilen mehr zeigen')
        check(not gs.locator('.gs-offpanel').is_visible(),
              'Der leere Off-Panel-Container soll unsichtbar sein (kein leerer Kasten, CSS :empty)')
        pg.keyboard.press("Escape")
        time.sleep(0.15)
        pg.keyboard.press("Escape")
        time.sleep(0.15)

        # ── 8. Nicht-Knob: Toggle über die ElementSettings ──
        tog = pg.locator('#bench-taktgeber [data-ctrl="t:metroOn"]')
        check(tog.count() == 1, 'Toggle t:metroOn fehlt')
        tog.first.dispatch_event('contextmenu')
        time.sleep(0.25)
        es = pg.locator('.elem-settings:visible')
        check(es.is_visible(), 'ElementSettings öffnen nicht per Rechtsklick auf den Toggle')
        espb = es.locator('.kme-panelbtn')
        check(espb.count() == 1, '„Panel?"-Knopf fehlt in den ElementSettings')
        espb.click()
        time.sleep(0.25)
        check(es.is_visible(), 'ElementSettings dürfen beim Umschalten nicht schließen')
        check(not tog.first.is_visible(), 't:metroOn sollte nach dem Umschalten vom Panel verschwinden')
        pg.keyboard.press("Escape")
        time.sleep(0.2)

        # ── 11. UNIKAT-Opener (⚙ Tab): Kleindarstellung statt bloßem Strich ──
        pg.evaluate("() => window.__takt.state.set('ctrlOffPanel', { ...(window.__takt.state.get('ctrlOffPanel')||{}), 'u:tabSettings': true })")
        time.sleep(0.2)
        grp.locator('.group-title').dispatch_event('contextmenu')
        time.sleep(0.25)
        openerRow = gs.locator('.gs-op-row', has=pg.locator('.gs-op-lab', has_text='Tab'))
        check(openerRow.count() == 1, 'Off-Panel-Zeile für u:tabSettings fehlt')
        openerBtn = openerRow.locator('.pb-btn')
        check(openerBtn.count() == 1, 'Der Opener sollte einen Knopf statt eines bloßen Strichs zeigen')
        openerBtn.click()
        time.sleep(0.25)
        check(pg.locator('.special-pop').is_visible(),
              'Klick auf die Kleindarstellung sollte das Tab/Tempo-Sonderfenster öffnen')
        pg.locator('.special-pop .kme-x').click()
        time.sleep(0.15)
        pg.keyboard.press("Escape")
        time.sleep(0.15)

        # ── 6b. Reload: der Zustand überlebt ──
        pg.reload(wait_until="networkidle", timeout=15000)
        time.sleep(0.4)
        off2 = pg.evaluate("() => window.__takt.state.get('ctrlOffPanel') || {}")
        check(off2.get('t:metroOn') is True, f"ctrlOffPanel sollte den Reload überleben, war {off2!r}")
        check(not pg.locator('#bench-taktgeber [data-ctrl="t:metroOn"]').first.is_visible(),
              't:metroOn sollte auch nach dem Reload off-panel sein')
        check(pg.locator('#bench-taktgeber [data-ctrl="k:bpm"]').first.is_visible(),
              'k:bpm sollte nach dem Reload wieder normal auf dem Panel stehen')

        # Aufräumen, damit ein späterer Lauf/Handbetrieb sauber startet.
        pg.evaluate("() => window.__takt.state.set('ctrlOffPanel', {})")

        errs = [e for e in errors if "favicon" not in e.lower()]
        check(len(errs) == 0, f"Console-/Page-Errors: {errs}")

        b.close()
except Exception as e:
    fails.append(f"Exception: {e}")
finally:
    srv.terminate()

if fails:
    print("SMOKE FAIL:")
    for f in fails:
        print(" -", f)
    sys.exit(1)
print('SMOKE OK: „Panel?"-Schalter — Control wandert live zwischen Panel und Gruppen-Settings, Fenster bleibt offen.')
