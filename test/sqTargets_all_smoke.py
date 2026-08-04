#!/usr/bin/env python3
"""Headless-Smoke für Punkt 3b (ddw.md 20260724): ALLE Buttons/Knobs/Speicher/Keyboard des
Poly-Synth als Sq-Ziele. Lauf: python3 test/sqTargets_all_smoke.py

Hart begrenzt (Watchdog killt nach 40s), kein Pollen. Prüft:
  · routing.inputTargets('AmpEnv') listet deutlich mehr als nur 'trig' (Knobs+Buttons+
    Speicher+Note), dezentral aus KNOBS/BUTTONS abgeleitet (lib/routing/portGen.js).
  · Knob-Ziel: deliver() schreibt direkt in den Instrument-State (z.B. harmonizeMix).
  · Button-Ziel: deliver() löst dieselbe activate-Closure wie ein echter Klick aus
    (kbHold-Zustand kippt) — über KeyMidi.remoteActivate().
  · Speicher-Ziel: deliver() ruft ChordMemory.triggerSlot() auf, wirft nicht bei leerem Akkord.
  · Keyboard-Ziel: deliver() spielt eine Note (heldCount steigt), Folge-Note löst die vorige
    ab (legato/Retrigger, kein Auto-noteOff nötig).
"""
import subprocess, sys, time, os, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8152
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
        b = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        pg = b.new_page()
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.goto(f"http://localhost:{PORT}/overcord/", wait_until="networkidle", timeout=15000)

        r = pg.evaluate("""() => {
            const reg = window.__routing.reg;
            const deliver = (port, v) => reg.deliver({module:'stepseq',port:'amp'}, {module:'polysynth',port}, v);
            const targets = reg.inputTargets('AmpEnv').map(t => t.name);

            reg.deliver({module:'stepseq',port:'amp'}, {module:'polysynth',port:'harmonizeMix'}, 0.42);
            const knobAfter = window.__polysynth.state.get('harmonizeMix');

            const kbHoldBefore = window.__polysynth.state.get('kbHold');
            deliver('kbHold', 1);
            const kbHoldAfter = window.__polysynth.state.get('kbHold');
            window.__polysynth.state.set('kbHold', kbHoldBefore);   // aufräumen

            let speicherThrew = null;
            try { deliver('speicher', 1); } catch (e) { speicherThrew = String(e); }
            // Slot 1 ist in der gewachsenen Werkseinstellungen-Datei (presets/werkbank-
            // config.json, @dpas Stand für Erstbesucher) NICHT mehr leer, sondern haelt einen
            // echten mehrstimmigen Akkord (Smoke-Test-Altlast, todos.md 20260802_131434) — der
            // obige Trigger spielt ihn also wirklich an. Ohne dieses Aufräumen würde der
            // anschließende Keyboard-Retrigger-Check (unten) auf den Akkord-Noten aufsetzen
            // statt auf einem sauberen Nullstand, und könnte zufällig mit einer der Test-Noten
            // (64/67) kollidieren. allNotesOff() ist hier bewusst neutral zur eigentlichen
            // Speicher-Prüfung (die endet schon oben mit speicherThrew).
            window.__polysynth.engine.allNotesOff();

            const heldBefore = window.__polysynth.engine.heldCount();
            deliver('note', 64);
            const heldAfterFirst = window.__polysynth.engine.heldCount();
            deliver('note', 67);   // andere Note: sollte die erste ablösen (Retrigger), nicht summieren
            const heldAfterSecond = window.__polysynth.engine.heldCount();
            window.__polysynth.engine.allNotesOff();

            return { targets, knobAfter, kbHoldBefore, kbHoldAfter, speicherThrew,
                     heldBefore, heldAfterFirst, heldAfterSecond };
        }""")

        check(len(r["targets"]) >= 20, f"erwartet deutlich mehr als 1 Sq-Ziel (Knobs+Buttons+Speicher+Note), gefunden: {len(r['targets'])}: {r['targets']}")
        check(any('Harmonize' in n for n in r["targets"]), f"Harmonize-Knob sollte als Ziel auftauchen: {r['targets']}")
        check(any('Trigger' in n for n in r["targets"]), f"trig-Port sollte weiter als Ziel auftauchen: {r['targets']}")
        check(abs(r["knobAfter"] - 0.42) < 1e-9, f"Knob-Ziel sollte harmonizeMix auf 0.42 setzen, war {r['knobAfter']}")
        check(r["kbHoldBefore"] != r["kbHoldAfter"], f"Button-Ziel sollte kbHold kippen: {r['kbHoldBefore']} -> {r['kbHoldAfter']}")
        check(r["speicherThrew"] is None, f"Speicher-Ziel sollte bei leerem Akkord NICHT werfen: {r['speicherThrew']}")
        check(r["heldAfterFirst"] == r["heldBefore"] + 1, f"Keyboard-Ziel sollte eine Note anschlagen: {r['heldBefore']} -> {r['heldAfterFirst']}")
        check(r["heldAfterSecond"] == r["heldAfterFirst"], f"zweite Sq-Note sollte die erste ABLÖSEN (Retrigger), nicht summieren: {r['heldAfterFirst']} -> {r['heldAfterSecond']}")

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
print("SMOKE OK: Punkt 3b — Poly-Synth Knobs/Buttons/Speicher/Keyboard als Sq-Ziele end-to-end.")
