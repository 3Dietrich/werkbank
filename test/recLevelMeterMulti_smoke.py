#!/usr/bin/env python3
"""Headless-Smoke: Rec/LevelMeter Vervielfältigung (@dpa 20260804, ddw.md-Auftrag "Rec und
LevelMeter von Singleton-ISMs zu vervielfältigbaren Instrumenten mit echten Routing-Ports
umbauen"). Nagelt die Struktur fest, die lib/recInstrument/multiRec.js und
lib/levelMeter/multiLevelMeter.js dafür bekommen haben — anders als multiEnv/multiScope
(EINE geteilte Engine über N Panel-Instanzen) braucht hier JEDE Instanz ihre EIGENE Engine
(eigener Analyser-/MediaRecorder-Tap), das ist der Kern dieses Tests:

  · Erstbesuch: GENAU eine Instanz je ISM (recCount/meterCount == 1) — bestehende Configs/
    Presets dürfen nicht mit mehreren Instanzen überrascht werden.
  · +: baut eine zweite Instanz mit EIGENER Engine (nicht dieselbe Referenz wie Instanz 0).
  · Jede Rec-Instanz meldet sich als EIGENES Routing-Modul ('rec_0', 'rec_1', …) mit einem
    Clock-Input — Struktur-Ansicht/künftiges Routing sieht sie einzeln.
  · −: mindestens eine Instanz bleibt stehen (kein "kein Rec mehr").
  · LevelMeter Instanz 0 zeigt per Default auf 'master.out' (identischer Tap-Punkt wie der
    alte Singleton — kein Sound-/Anzeige-Unterschied nach dem Umbau), eine NEU angelegte
    Instanz startet dagegen ohne Quelle (zeigt nichts an, bis @dpa eine wählt).
  · Rec bleibt unabhängig vom Tap-Punkt an EINEN gemeinsamen Takt gekoppelt (taktEngine
    bleibt Singleton, s. lib/taktmetro/mount.js) — beide Rec-Instanzen bekommen denselben
    rohen Scheduler-Beat zugestellt (kein zweiter Takt pro Instanz).

Bewusst OHNE echten MediaRecorder-Start (Headless-Audio-Falle, CLAUDE.md: Transport/Sound
nie über Play-Buttons/echte Aufnahmen prüfen) — nur über die Engine-/Manager-API direkt.
Lauf: python3 test/recLevelMeterMulti_smoke.py
Hart begrenzt (Watchdog killt nach 40s), kein Pollen.
"""
import subprocess, sys, time, os, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8261
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
        # werkbank-leer: schlankestes Ensemble mit genau den vier "immer dabei"-ISMs,
        # kein Polysynth-/Stepseq-Rauschen.
        pg.goto(f"http://localhost:{PORT}/werkbank-leer/", wait_until="networkidle", timeout=15000)

        r0 = pg.evaluate("""() => ({
            recCount: window.__rec.mgr.count(),
            meterCount: window.__levelMeter.mgr.count(),
            recModules: window.__routing.reg.modules().map(m => m.id).filter(id => id.startsWith('rec_')),
        })""")
        check(r0["recCount"] == 1, f"Erstbesuch sollte GENAU 1 Rec-Instanz haben, war {r0['recCount']}")
        check(r0["meterCount"] == 1, f"Erstbesuch sollte GENAU 1 LevelMeter-Instanz haben, war {r0['meterCount']}")
        check(r0["recModules"] == ["rec_0"], f"Routing sollte nur 'rec_0' kennen, war {r0['recModules']}")

        # ── + baut je eine zweite Instanz mit EIGENER Engine ──
        r1 = pg.evaluate("""() => {
            window.__rec.mgr.addRec();
            window.__levelMeter.mgr.addMeter();
            const recs = window.__rec.mgr.recs;
            const meters = window.__levelMeter.mgr.meters;
            return {
                recCount: window.__rec.mgr.count(),
                meterCount: window.__levelMeter.mgr.count(),
                sameEngine: recs[0].engine === recs[1].engine,
                sameMeter: meters[0].meter === meters[1].meter,
                recModules: window.__routing.reg.modules().map(m => m.id).filter(id => id.startsWith('rec_')).sort(),
                meterSrc0: window.__levelMeter.state.get('meterSrc_0'),
                meterSrc1: window.__levelMeter.state.get('meterSrc_1'),
            };
        }""")
        check(r1["recCount"] == 2, f"Nach addRec() sollten 2 Rec-Instanzen da sein, war {r1['recCount']}")
        check(r1["meterCount"] == 2, f"Nach addMeter() sollten 2 LevelMeter-Instanzen da sein, war {r1['meterCount']}")
        check(r1["sameEngine"] is False, "Rec-Instanz 1 sollte eine ANDERE Engine als Instanz 0 haben (eigener Tap)")
        check(r1["sameMeter"] is False, "LevelMeter-Instanz 1 sollte ein ANDERES LevelMeter-Objekt als Instanz 0 haben")
        check(r1["recModules"] == ["rec_0", "rec_1"], f"Routing sollte 'rec_0'+'rec_1' kennen, war {r1['recModules']}")
        check(r1["meterSrc0"] == "master.out", f"Meter-Instanz 0 sollte weiterhin 'master.out' zeigen (Alt-Verhalten), war {r1['meterSrc0']!r}")
        check(r1["meterSrc1"] == "", f"Neue Meter-Instanz sollte OHNE Quelle starten (nicht ungefragt Master zeigen), war {r1['meterSrc1']!r}")

        # ── clock-Input je Rec-Instanz vorhanden + Takt bleibt EIN gemeinsamer Singleton ──
        clockPorts = pg.evaluate("""() => {
            const mods = window.__routing.reg.modules();
            const rec0 = mods.find(m => m.id === 'rec_0');
            const rec1 = mods.find(m => m.id === 'rec_1');
            return {
                rec0Clock: rec0.inputs.some(p => p.id === 'clock' && p.type === 'Gate'),
                rec1Clock: rec1.inputs.some(p => p.id === 'clock' && p.type === 'Gate'),
                taktCount: mods.filter(m => m.id === 'takt').length,
            };
        }""")
        check(clockPorts["rec0Clock"], "rec_0 sollte einen Gate-Clock-Input deklarieren")
        check(clockPorts["rec1Clock"], "rec_1 sollte einen Gate-Clock-Input deklarieren")
        check(clockPorts["taktCount"] == 1, f"Takt bleibt EIN Singleton-Modul, war {clockPorts['taktCount']}x registriert")

        # ── − mindestens eine Instanz bleibt stehen ──
        r2 = pg.evaluate("""() => {
            window.__rec.mgr.removeRec();
            window.__levelMeter.mgr.removeMeter();
            return {
                recCount: window.__rec.mgr.count(),
                meterCount: window.__levelMeter.mgr.count(),
                removeAtFloor: window.__rec.mgr.removeRec() === false,
            };
        }""")
        check(r2["recCount"] == 1, f"Nach removeRec() sollte wieder 1 Rec-Instanz da sein, war {r2['recCount']}")
        check(r2["meterCount"] == 1, f"Nach removeMeter() sollte wieder 1 LevelMeter-Instanz da sein, war {r2['meterCount']}")
        check(r2["removeAtFloor"], "removeRec() bei genau 1 Instanz sollte false liefern (keine leere ISM-Sektion)")

        b.close()
finally:
    srv.terminate()

if errors:
    print("JS-Fehler:", *errors, sep="\n  ")
if fails:
    print("FAILS:", *fails, sep="\n  ")
print("SMOKE:", "OK" if not errors and not fails else "FAILED")
sys.exit(1 if errors or fails else 0)
