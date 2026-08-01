#!/usr/bin/env python3
"""Headless-Smoke für werkbank-leer.html/.js — den ZWEITEN, schlankeren Pool-Einstieg
neben index.html/werkbank.js (@dpa 20260801, mit @dpa vorab durchgeplant).

werkbank-leer ist ein NEUTRALES leeres Basis-Scaffold: nur die vier "immer dabei"-ISMs
(Takt/Metronom, Rec, LevelMeter, Signal-Scopes) + alle Header-Funktionen — KEIN Poly-Synth,
KEIN Stepsequenzer. index.html/werkbank.js bleiben dabei unangetastet (eigener Einstieg).

Prüft:
  1. Seite lädt fehlerfrei, keine Console-/Page-Errors.
  2. #bench-taktgeber, #bench-rec, #bench-levelmeter, #bench-scope vorhanden + sichtbar.
  3. Kein #bench-polysynth, kein #bench-stepseq im DOM.
  4. Header-Buttons vorhanden + reagieren: Config öffnet, keyedit/midiedit setzen .active,
     Struktur-Ansicht zeigt NUR takt+rec als registrierte Module (LevelMeter/Scope
     registrieren sich bewusst nicht bei der Routing-Registry, s. multiScope.js).
  5. Rec-Format-Menü öffnet.
  6. Ensemble-Menü öffnet, "+ Neu" legt einen Snapshot mit allen 4 ISM-Werten an.
  7. Scope +/− Header-Buttons legen/entfernen eine Scope-Gruppe an.
  8. Reset-Button klickbar ohne Fehler (kein Play-Klick-Test — Headless-Audio-Falle, s.
     CLAUDE.md — nur DOM-/Klassen-Reaktion).

Lauf: python3 test/werkbankLeerEntry_smoke.py
Hart begrenzt (Watchdog killt nach 40s), kein Pollen.
"""
import subprocess, sys, time, os, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8233
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
        pg = b.new_page(viewport={"width": 1500, "height": 1000})
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.goto(f"http://localhost:{PORT}/werkbank-leer.html", wait_until="networkidle", timeout=15000)

        # ── 2. Die vier ISM-Sektionen vorhanden + sichtbar ──
        for sec in ["#bench-taktgeber", "#bench-rec", "#bench-levelmeter", "#bench-scope"]:
            loc = pg.locator(sec)
            check(loc.count() == 1, f"{sec} fehlt im DOM")
            check(loc.first.is_visible(), f"{sec} ist nicht sichtbar")

        # ── 3. Kein Poly-Synth/Stepseq ──
        check(pg.locator("#bench-polysynth").count() == 0, "#bench-polysynth sollte NICHT existieren")
        check(pg.locator("#bench-stepseq").count() == 0, "#bench-stepseq sollte NICHT existieren")

        # ── 4a. Config öffnet ──
        pg.locator('#cfgmenu').click()
        time.sleep(0.15)
        check(pg.locator('.mini-settings:visible').count() == 1, "⚙ Config öffnet kein Panel")
        pg.locator('.mini-settings .kme-close').click()
        time.sleep(0.1)

        # ── 4b. keyedit/midiedit setzen .active ──
        pg.locator('#keyedit').click()
        time.sleep(0.1)
        check(pg.evaluate("() => document.querySelector('#keyedit').classList.contains('active')"),
              "⌨ Tasten sollte nach Klick .active tragen")
        check(pg.evaluate("() => window.__takt.host.keyMidi.isKeyEdit() === true"),
              "keyedit sollte auf takt.keyMidi durchschlagen")
        check(pg.evaluate("() => window.__rec.host.keyMidi.isKeyEdit() === true"),
              "keyedit sollte auch auf rec.keyMidi durchschlagen")
        check(pg.evaluate("() => window.__levelMeter.host.keyMidi.isKeyEdit() === true"),
              "keyedit sollte auch auf levelMeterHost.keyMidi durchschlagen (im Original fehlend, hier bewusst ergänzt)")
        check(pg.evaluate("() => window.__scope.host.keyMidi.isKeyEdit() === true"),
              "keyedit sollte auch auf scopeHost.keyMidi durchschlagen (im Original fehlend, hier bewusst ergänzt)")
        pg.locator('#keyedit').click()   # wieder aus
        time.sleep(0.1)

        pg.locator('#midiedit').click()
        time.sleep(0.1)
        check(pg.evaluate("() => document.querySelector('#midiedit').classList.contains('active')"),
              "🎹 MIDI sollte nach Klick .active tragen")
        pg.locator('#midiedit').click()   # wieder aus
        time.sleep(0.1)

        # ── 4c. Struktur-Ansicht zeigt NUR takt+rec ──
        mods = pg.evaluate("() => window.__routing.reg.modules().map(m => m.id).sort()")
        check(mods == ['rec', 'takt'], f"Registry sollte nur ['rec','takt'] registriert haben, war {mods!r}")
        pg.locator('#structurebtn').click()
        time.sleep(0.15)
        boxes = pg.locator('.structure-box').all_inner_texts()
        check(pg.locator('.structure-pop').count() == 1, "⧉ Struktur öffnet kein Fenster")
        check(len(boxes) == 2, f"Struktur-Ansicht sollte genau 2 Kästen zeigen (takt+rec), war {len(boxes)}")
        pg.keyboard.press("Escape")
        time.sleep(0.1)

        # ── 5. Rec-Format-Menü öffnet ──
        pg.locator('#recfmtmenu').click()
        time.sleep(0.15)
        check(pg.locator('.cfg-pop').count() == 1, "⚙ Rec-Format öffnet kein Popup")
        pg.locator('#recfmtmenu').click()
        time.sleep(0.1)

        # ── 6. Ensemble-Menü + "+ Neu" legt Snapshot mit allen 4 ISMs an ──
        # 'werkbank_ensemble' ist ABSICHTLICH derselbe localStorage-Key wie in index.html
        # (State teilt sich zwischen den Pool-Einstiegen) — presets/default-config.json
        # befüllt ihn beim Erstbesuch schon mit Demo-Snapshots aus dem VOLLEN Instrument-Satz
        # (werkbank_polysynth/werkbank_stepseq etc.), darum hier gezielt den NEU gespeicherten
        # Eintrag am Namen suchen statt Index 0 anzunehmen.
        check(pg.evaluate("() => !!window.__ensemble && !!window.__ensemble.store"), "window.__ensemble.store fehlt")
        ensemble_btn = pg.locator('.topbar [data-ctrl="hdr:ensemble"] .pm-btn')
        check(ensemble_btn.count() >= 1, "Ensemble-Knopf fehlt im Header")
        ensemble_btn.click()
        time.sleep(0.15)
        check(pg.locator('.pm-pop').count() == 1, "Ensemble-Menü (⭐) öffnet kein .pm-pop")
        pg.keyboard.press("Escape")
        time.sleep(0.1)
        before_n = pg.evaluate("() => window.__ensemble.store.list().length")
        n = pg.evaluate("() => window.__ensemble.store.save('Test-Snapshot').length")
        check(n == before_n + 1, f"Ensemble save() sollte die Liste um 1 verlängern, war {before_n} -> {n}")
        entry = pg.evaluate("() => window.__ensemble.store.list().find(e => e.name === 'Test-Snapshot')")
        check(entry is not None, "Neu gespeicherter Ensemble-Snapshot 'Test-Snapshot' fehlt in der Liste")
        ls_keys = sorted((entry or {}).get('ls', {}).keys())
        expected = sorted(['werkbank_taktmetro', 'werkbank_rec', 'werkbank_levelmeter', 'werkbank_scope'])
        check(ls_keys == expected, f"Ensemble-Snapshot sollte GENAU die 4 ISM-lsKeys tragen (kein Poly-Synth/Stepseq), war {ls_keys!r}")
        del_idx = pg.evaluate("() => window.__ensemble.store.list().findIndex(e => e.name === 'Test-Snapshot')")
        pg.evaluate(f"() => window.__ensemble.store.del({del_idx})")   # aufräumen

        # ── 7. Scope +/− Header-Buttons ──
        before_count = pg.evaluate("() => window.__scope.mgr.count()")
        check(before_count == 1, f"Scope sollte mit 1 Gruppe starten, war {before_count}")
        pg.locator('#bench-scope .sq-edit-btn').click()   # Editier-Modus an (blendet +/- ein)
        time.sleep(0.1)
        pg.locator('#bench-scope .sq-pm', has_text='+').click()
        time.sleep(0.15)
        after_add = pg.evaluate("() => window.__scope.mgr.count()")
        check(after_add == 2, f"Scope + sollte auf 2 Gruppen erhöhen, war {after_add}")
        pg.locator('#bench-scope .sq-pm', has_text='−').click()
        time.sleep(0.15)
        after_rem = pg.evaluate("() => window.__scope.mgr.count()")
        check(after_rem == 1, f"Scope − sollte wieder auf 1 Gruppe senken, war {after_rem}")

        # ── 8. Reset-Button klickbar ohne Fehler (keine Audio-Play-Prüfung) ──
        check(pg.locator('#headerreset').count() == 1, "🔇 Audio-Reset-Button fehlt")
        pg.locator('#headerreset').click()
        time.sleep(0.15)

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
print("SMOKE OK: werkbank-leer.html/.js — 4 ISMs (Takt/Rec/LevelMeter/Scope) + Header-Funktionen laufen entkoppelt.")
