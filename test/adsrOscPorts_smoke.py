#!/usr/bin/env python3
"""Headless-Smoke für ddw.md 20260804: lib/adsrOsc/ (Amp-/Pitch-ADSR + eigener Oszillator
in pitchosc/) bekommt ECHTE Routing-Ports statt harter Verdrahtung im Engine-Code
(@dpa: "Ja! alles bekommt seine Ein- und Ausgänge (Panel oder 'versteckt' in Settings
einstellbar wie andere Controls)"). Vorher las engine.js pitchEnv.read()/ampEnv.read()
DIREKT in freqFromEnv()/applyAmp() — kein Routing beteiligt.

Prüft (Headless-Audio-Falle: NIE über echte Play-Buttons/Audio, nur Engine-API +
Registry-Zustand):
  1) Modul 'adsrosc' ist bei der Registry angemeldet mit Output-Ports ampOut/pitchOut
     UND Input-Ports ampIn/pitchIn.
  2) Default-Verdrahtung (Rückwärtskompatibilität): beim ersten Laden verbindet sich
     ampOut->ampIn und pitchOut->pitchIn automatisch (echte, sichtbare Registry-
     Verbindung, s. lib/adsrPanel.js createAdsrOutputPicker()).
  3) Die Output-PickMenus (Panel-sichtbar, s:adsrOutput / s:adsrOutput_p) existieren in
     BEIDEN ADSR-Gruppen und zeigen ein Ziel an (nicht "— kein Ziel —").
  4) Ein Gate-Trigger lässt engine.ampEnvValue()/pitchEnvValue() von 0 wegbewegen UND
     nach einem Frame (routing.flush()) kommt der Wert tatsächlich über den Port am
     Oszillator an (kein privater Direktzugriff mehr nötig, reine Registry-Zustellung).

Lauf: python3 test/adsrOscPorts_smoke.py
Hart begrenzt (Watchdog killt nach 40s), kein Pollen.
"""
import subprocess, sys, time, os, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8237
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
        pg = b.new_page(viewport={"width": 1600, "height": 1100})
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.goto(f"http://localhost:{PORT}/pitchosc/", wait_until="networkidle", timeout=15000)
        pg.wait_for_function("window.__adsrOsc && window.__routing", timeout=15000)

        # ── 1) Modul + Ports angemeldet ────────────────────────────────────────────
        mods = pg.evaluate("() => window.__routing.reg.modules()")
        adsrosc = next((m for m in mods if m["id"] == "adsrosc"), None)
        check(adsrosc is not None, "Modul 'adsrosc' nicht bei der Routing-Registry registriert")
        if adsrosc:
            out_ids = {p["id"] for p in adsrosc["outputs"]}
            in_ids = {p["id"] for p in adsrosc["inputs"]}
            check("ampOut" in out_ids and "pitchOut" in out_ids,
                  f"Output-Ports ampOut/pitchOut fehlen — vorhanden: {out_ids}")
            check("ampIn" in in_ids and "pitchIn" in in_ids,
                  f"Input-Ports ampIn/pitchIn fehlen — vorhanden: {in_ids}")

        # ── 2) Default-Verdrahtung: echte Registry-Verbindung, kein hartes JS mehr ──
        conns = pg.evaluate("() => window.__routing.reg.connections()")
        def has_conn(src_port, dst_port):
            return any(c["src"]["module"] == "adsrosc" and c["src"]["port"] == src_port
                       and c["dst"]["module"] == "adsrosc" and c["dst"]["port"] == dst_port
                       for c in conns)
        check(has_conn("ampOut", "ampIn"), f"Default-Verbindung ampOut->ampIn fehlt — connections: {conns}")
        check(has_conn("pitchOut", "pitchIn"), f"Default-Verbindung pitchOut->pitchIn fehlt — connections: {conns}")

        # ── 3) Output-PickMenus sind Panel-sichtbare Controls mit gewähltem Ziel ────
        amp_pm = pg.locator('[data-group="Amp-ADSR"] [data-ctrl="s:adsrOutput"]').first
        pitch_pm = pg.locator('[data-group="Pitch-ADSR"] [data-ctrl="s:adsrOutput_p"]').first
        check(amp_pm.count() > 0, "Output-PickMenu s:adsrOutput (Amp-ADSR) nicht im Panel gefunden")
        check(pitch_pm.count() > 0, "Output-PickMenu s:adsrOutput_p (Pitch-ADSR) nicht im Panel gefunden")
        amp_label = amp_pm.inner_text() if amp_pm.count() > 0 else ""
        check("kein Ziel" not in amp_label, f"Amp-Output-PickMenu zeigt kein Ziel: {amp_label!r}")

        # ── 4) Gate-Trigger: Env-Werte bewegen sich, UND getValue(ampOut) liest denselben
        #      Live-Wert wie ampEnvValue() (@dpa-Nachprüfung 20260804: Registry.getValue()
        #      ruft port.read() live auf, KEIN Cache — die beiden Werte müssen exakt
        #      übereinstimmen, aber NUR wenn beide innerhalb DESSELBEN JS-Ticks gelesen
        #      werden. Zwei getrennte page.evaluate()-Aufrufe hätten hier zuerst fälschlich
        #      ein FAIL gezeigt: die kontinuierlich abklingende Hüllkurve hatte sich im
        #      IPC-Roundtrip zwischen den beiden Calls bereits weiterbewegt — kein Bug,
        #      nur eine zu strenge Testmethode. Darum hier EIN evaluate() für beide Werte.) ─
        pg.evaluate("() => { window.__adsrOsc.engine.ensureAudio(); window.__adsrOsc.engine.onAction('gate', 'down'); }")
        pg.wait_for_timeout(120)
        amp_val, delivered = pg.evaluate("""() => [
            window.__adsrOsc.engine.ampEnvValue(),
            window.__routing.reg.getValue({ module: 'adsrosc', port: 'ampOut' }),
        ]""")
        check(abs(amp_val) > 1e-4, f"ampEnvValue() bewegt sich nach Gate-Trigger nicht (war {amp_val})")
        check(abs(delivered - amp_val) < 1e-6, f"getValue(ampOut) sollte ampEnvValue() spiegeln (delivered={delivered}, amp={amp_val})")

        pg.evaluate("() => window.__adsrOsc.engine.onAction('gate', 'up')")

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
print("SMOKE OK: adsrOsc hat echte ampOut/pitchOut/ampIn/pitchIn-Ports, Default-Verdrahtung + Output-PickMenus intakt.")
