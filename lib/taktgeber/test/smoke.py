#!/usr/bin/env python3
"""Headless-Smoke des Taktgebers. Lauf: python3 test/smoke.py

Hart begrenzt, kein Pollen. Was hier festgenagelt ist, sind die Zusagen aus
ddtakt.md (@dpa 20260717) – jede davon ist schon mal kaputtgegangen:

  · Die Seite lädt ohne JS-Fehler.
  · ! und !! sind gestoppt ausgegraut (keine Phase zum Syncen) und im Lauf frei.
  · Doppelklick auf die BPM-Anzeige setzt das Tempo, inkl. Faltung + Hinweis
    („2216 → 277 BpM (*8)" bei max 400).
  · Shortcuts kommen aus dem State und lassen sich neu belegen.
  · KEINE Gruppe ist bildschirmfüllend („Platzsparen/d ist mir wichtig!").
"""
import subprocess, sys, time, os, signal
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8137
srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT)],
                       cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
errors, fails = [], []
check = lambda ok, msg: None if ok else fails.append(msg)

try:
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        pg = b.new_page(viewport={"width": 1200, "height": 700})
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.goto(f"http://localhost:{PORT}/", wait_until="networkidle", timeout=15000)

        # ── Gestoppt: kein Sync möglich ──
        bangs = pg.locator(".bang")
        check(bangs.count() == 2, f"! und !! erwartet, gefunden: {bangs.count()}")
        check(bangs.nth(0).is_disabled() and bangs.nth(1).is_disabled(),
              "! / !! sind bei Stop NICHT ausgegraut")

        # ── Tap-Kern (reine Logik, ohne die UI zu fahren) ──
        bpm = pg.evaluate("""async () => {
            const { TapTempo } = await import('./tapTempo.js');
            const tt = new TapTempo({ mode: 1 });
            let t = 0, r; tt.tap(t);
            for (let i=0;i<5;i++){ t+=500; r=tt.tap(t); }
            return r.bpm;
        }""")
        check(116 < bpm < 124, f"Tap→BPM erwartet ~120, ist {bpm:.1f}")

        # ── Start → läuft, Sync frei ──
        pg.click(".startbtn")
        time.sleep(0.3)
        check(not bangs.nth(0).is_disabled(), "! nach Start noch ausgegraut")
        check("Stop" in pg.inner_text(".startbtn"), "Start-Knopf zeigt nach Start kein 'Stop'")

        # ── Beat-Anzeige läuft mit ──
        time.sleep(0.7)
        check(pg.locator("#beatsView .beat.hit").count() == 1, "kein laufender Schlag in der Anzeige")

        # ── Shortcut: Start/Stop aus dem State (Default = Leertaste) ──
        pg.keyboard.press("Space")
        time.sleep(0.2)
        check("Start" in pg.inner_text(".startbtn"), "Leertaste stoppt den Transport nicht")

        # ── Tempo eintippen + Faltung (@dpa: „277 BpM (*8)") ──
        pg.dblclick("#bpmView")
        pg.fill("#bpmView input", "2216")
        pg.keyboard.press("Enter")
        time.sleep(0.15)
        shown, hint = pg.inner_text("#bpmView"), pg.inner_text("#tHint")
        check("277" in shown, f"2216 BPM bei max 400 → 277 erwartet, Anzeige: {shown!r}")
        check(hint.strip() == "277 BpM (*8)", f"Falt-Hinweis erwartet '277 BpM (*8)', ist {hint!r}")

        # ── Beats/Takt per Präfix-Taste (b3) ──
        pg.keyboard.press("b"); pg.keyboard.press("3")
        time.sleep(0.15)
        check(pg.locator("#beatsView .beat").count() == 3, "b3 setzt Beats/Takt nicht auf 3")

        # ── Settings: Rechtsklick am Titel, Ansicht zuerst, Technik hinter dem Strich ──
        pg.locator(".group[data-group=transport] .g-head").click(button="right")
        time.sleep(0.15)
        subs = [s.inner_text() for s in pg.locator(".panel .p-sub").all()]
        check(subs and subs[0] == "ANSICHT", f"Erster Settings-Abschnitt erwartet 'ANSICHT', sind {subs}")
        # „Technik" ist kein Titel mehr, sondern ein sanfter Strich (@dpa 20260717).
        check(pg.locator(".panel .p-div").count() >= 1, "sanfter Strich vor der Technik fehlt")
        # max. BPM ist jetzt ein gezogener Wert („Knob ohne Knob"), kein Fader mehr.
        check(pg.locator(".panel .p-grid .dragnum").count() >= 3,
              "draggable Werte (max. BPM / Anschieben / Anlauf) fehlen")
        # MIDI-Learn für alle Controls: jede Technik-Zeile trägt ein 🎹-Icon; ein Klick
        # öffnet das Lern-Banner (@dpa 20260717).
        check(pg.locator(".panel .p-grid .midi-ic").count() >= 3, "MIDI-Learn-Icons fehlen in den Settings")
        pg.locator(".panel .mwrap:has([data-key=keyStart]) .midi-ic").click()
        time.sleep(0.1)
        check(pg.locator(".midi-learn").count() == 1, "MIDI-Banner öffnet nicht")
        pg.keyboard.press("Escape")
        time.sleep(0.1)
        check(pg.locator(".midi-learn").count() == 0, "ESC schließt das MIDI-Banner nicht")
        # Die Shortcuts sind belegbar, nicht fest verdrahtet: neu belegen und benutzen.
        pg.locator(".panel .ctrl[data-key=keyStart] .kb").click()
        pg.keyboard.press("g")
        time.sleep(0.1)
        # Anzeige exakt wie gespeichert (klein), kein vorgetäuschter Groß-/Shift-Unterschied.
        check(pg.inner_text(".panel .ctrl[data-key=keyStart] .kb") == "g",
              "neu belegter Start-Shortcut wird nicht angezeigt")
        # Groß/klein sind VERSCHIEDENE Belegungen: Shift+S → „S", nicht „s" (@dpa 20260717_180719).
        pg.locator(".panel .ctrl[data-key=keyStart] .kb").click()
        pg.keyboard.press("Shift+S")
        time.sleep(0.1)
        check(pg.inner_text(".panel .ctrl[data-key=keyStart] .kb") == "S",
              "Shift+S wird nicht als grosses S uebernommen")
        # Löschen (×) → leer, NICHT „—" (das las sich wie die Taste „–", @dpa 20260717).
        pg.locator(".panel .ctrl[data-key=keyStart] .kb-x").click()
        time.sleep(0.1)
        kb = pg.locator(".panel .ctrl[data-key=keyStart] .kb")
        check(kb.inner_text().strip() == "", "gelöschte Belegung ist nicht leer")
        # Zeilenhöhe bleibt trotz leerer Belegung (@dpa 20260717).
        check(kb.bounding_box()["height"] >= 20, "leere Belegung fällt in der Höhe zusammen")
        pg.keyboard.press("Escape")
        time.sleep(0.1)
        check(pg.locator(".panel").count() == 0, "ESC schließt das Settings-Fenster nicht")

        # ── Körper-Control ist auch MIDI-lernbar (🎹 am Control, kein Popover-Untermenü mehr) ──
        check(pg.locator(".group[data-group=metro] .mwrap:has([data-key=metroLevel]) .midi-ic").count() == 1,
              "MIDI-Icon fehlt am Körper-Control")
        pg.locator(".group[data-group=metro] .ctrl[data-key=metroLevel]").click(button="right")
        time.sleep(0.1)
        check(pg.locator(".popover .pmidi").count() == 0, "MIDI-Untermenü im Popover ist NICHT entfernt")
        pg.locator("h1").click()
        time.sleep(0.1)
        check(pg.locator(".popover").count() == 0, "Klick daneben schließt das Control-Menü nicht")

        # ── Platzsparend: keine Gruppe füllt den Bildschirm ──
        vw, vh = 1200, 700
        for g in pg.locator(".group").all():
            box, name = g.bounding_box(), g.locator(".g-title").inner_text()
            check(box["width"] <= vw * 0.5, f"Gruppe {name!r} ist {box['width']:.0f}px breit (>50% des Fensters)")
            check(box["height"] <= vh * 0.5, f"Gruppe {name!r} ist {box['height']:.0f}px hoch (>50% des Fensters)")

        b.close()
finally:
    srv.send_signal(signal.SIGINT)

if errors:
    print("JS-Fehler:", *errors, sep="\n  ")
if fails:
    print("FAILS:", *fails, sep="\n  ")
print("SMOKE:", "OK" if not errors and not fails else "FAILED")
sys.exit(1 if errors or fails else 0)
