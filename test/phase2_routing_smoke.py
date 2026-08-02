#!/usr/bin/env python3
"""Headless-Smoke für Phase 2 (Port-/Routing-Fundament, PLAN_OPERA.md/PHASE2_SPEC.md).
Lauf: python3 test/phase2_routing_smoke.py

Hart begrenzt (Watchdog killt nach 40s), kein Pollen — wie lib/taktgeber/test/smoke.py.
Prüft NUR das, was Phase 2 zusagt, nicht die ganze Werkbank-UI (die haben andere Smokes):

  · Seite lädt ohne JS-Fehler, alle vier ISMs mounten (window.__takt/__polysynth/
    __stepseq/__rec existieren weiterhin — Phase 2 darf Phase-0/1-Zusagen nicht brechen).
  · window.__routing.reg kennt alle vier Module mit ihren deklarierten Ports.
  · Die drei Verbindungen sind eingetragen: Stepseq.amp→Poly.trig, Takt.beat→Rec.clock.
  · Stepseq.amp→Poly.trig ist die ECHTE Zustellung (Paket C): reg.emit() dort löst
    tatsächlich noteOn auf der Poly-Synth-Engine aus (heldCount()/voiceCount() > 0),
    identisch zum Verhalten VOR der Migration (@dpa darf sich weiter drauf verlassen).
  · Poly.baseFreq/baseTone sind lesbare VALUE-Ports (reg.getValue == engine.baseFreq()).
"""
import subprocess, sys, time, os, signal, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8143
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
        pg = b.new_page(viewport={"width": 1400, "height": 900})
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.goto(f"http://localhost:{PORT}/overcord/", wait_until="networkidle", timeout=15000)

        # ── Phase-0/1-Zusagen bleiben stehen (Phase 2 ist additiv) ──
        hooks = pg.evaluate("""() => ({
            takt: !!window.__takt, polysynth: !!window.__polysynth,
            stepseq: !!window.__stepseq, rec: !!window.__rec, routing: !!window.__routing,
        })""")
        for k, v in hooks.items():
            check(v, f"window.__{k} fehlt")

        # ── Registry kennt alle vier Module ──
        mods = pg.evaluate("() => window.__routing.reg.modules()")
        ids = {m["id"] for m in mods}
        # Phase 2 sagt NUR zu, dass diese vier weiterhin da sind (additiv) — seit dem
        # Multi-ADSR-Feature (ddw.md 20260725) registriert sich zusätzlich JEDE ADSR-Instanz
        # als eigenes Modul ('polysynth.env_0', …), das ist kein Bruch der Phase-2-Zusage.
        check({"takt", "polysynth", "stepseq", "rec"} <= ids,
              f"erwartet mindestens takt/polysynth/stepseq/rec, gefunden: {ids}")

        by_id = {m["id"]: m for m in mods}
        poly_out = {p["id"]: p["type"] for p in by_id["polysynth"]["outputs"]}
        poly_in = {p["id"]: p["type"] for p in by_id["polysynth"]["inputs"]}
        check(poly_out.get("baseFreq") == "OSZ-F", f"polysynth.baseFreq-Typ falsch: {poly_out}")
        check(poly_out.get("baseTone") == "BaseFreq-Ton", f"polysynth.baseTone-Typ falsch: {poly_out}")
        check(poly_in.get("trig") == "AmpEnv", f"polysynth.trig-Typ falsch: {poly_in}")
        step_out = {p["id"]: p["type"] for p in by_id["stepseq"]["outputs"]}
        check(step_out.get("amp") == "AmpEnv", f"stepseq.amp-Typ falsch: {step_out}")
        takt_out = {p["id"]: p["type"] for p in by_id["takt"]["outputs"]}
        check(takt_out.get("beat") == "Gate", f"takt.beat-Typ falsch: {takt_out}")
        rec_in = {p["id"]: p["type"] for p in by_id["rec"]["inputs"]}
        check(rec_in.get("clock") == "Gate", f"rec.clock-Typ falsch: {rec_in}")

        # ── Die drei bestehenden Verbindungen sind eingetragen (Paket B) ──
        conns = pg.evaluate("() => window.__routing.reg.connections()")
        conn_pairs = {(c["src"]["module"], c["src"]["port"], c["dst"]["module"], c["dst"]["port"]) for c in conns}
        check(("stepseq", "amp", "polysynth", "trig") in conn_pairs,
              f"Stepseq.amp→Poly.trig fehlt in connections(): {conn_pairs}")
        check(("takt", "beat", "rec", "clock") in conn_pairs,
              f"Takt.beat→Rec.clock fehlt in connections(): {conn_pairs}")

        # ── Latenz-Vertrag: alle vier liefern eine Zahl (Bus-Anteil, Context evtl. noch stumm) ──
        for mid in ("takt", "polysynth", "stepseq", "rec"):
            lat = by_id[mid]["latency"]
            check(isinstance(lat, (int, float)), f"{mid}.latency() liefert keine Zahl: {lat!r}")

        # ── Paket C: reg.emit() auf Stepseq.amp löst WIRKLICH noteOn auf der Poly-Engine
        #    aus — die migrierte Zustellung muss sich exakt wie die alte harte Verdrahtung
        #    verhalten (@dpa darf sich weiter aufs Ohr verlassen). ──
        before = pg.evaluate("() => window.__polysynth.engine.heldCount()")
        check(before == 0, f"vor dem Trigger schon gehaltene Noten: {before}")
        pg.evaluate("() => window.__routing.reg.emit({module:'stepseq', port:'amp'}, 0.8)")
        time.sleep(0.1)
        held = pg.evaluate("() => window.__polysynth.engine.heldCount()")
        voices = pg.evaluate("() => window.__polysynth.engine.voiceCount()")
        check(held == 1, f"reg.emit() auf Stepseq.amp löst keinen noteOn aus (heldCount={held})")
        check(voices >= 1, f"keine klingende Voice nach reg.emit() (voiceCount={voices})")
        # Panik, damit die Voice nicht den Rest des Tests durchklingt.
        pg.evaluate("() => window.__polysynth.engine.allNotesOff()")

        # ── Poly.baseFreq/baseTone sind über die Registry lesbar (VALUE-Ports, Paket B) ──
        bf_reg = pg.evaluate("() => window.__routing.reg.getValue({module:'polysynth', port:'baseFreq'})")
        bf_eng = pg.evaluate("() => window.__polysynth.engine.baseFreq()")
        check(abs(bf_reg - bf_eng) < 1e-6, f"getValue(baseFreq) {bf_reg} != engine.baseFreq() {bf_eng}")
        bt_reg = pg.evaluate("() => window.__routing.reg.getValue({module:'polysynth', port:'baseTone'})")
        check(1 <= bt_reg <= 12, f"getValue(baseTone) außerhalb 1..12: {bt_reg}")

        b.close()
finally:
    srv.send_signal(signal.SIGINT)

if errors:
    print("JS-Fehler:", *errors, sep="\n  ")
if fails:
    print("FAILS:", *fails, sep="\n  ")
print("SMOKE:", "OK" if not errors and not fails else "FAILED")
sys.exit(1 if errors or fails else 0)
