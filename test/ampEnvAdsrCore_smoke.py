#!/usr/bin/env python3
"""Headless-Smoke für dd.md 20260802 (overcord/Poly-synth/Amp-Env):
"bitte die Env auf die ADSR übermodeln, so dass sie die selben Einstellungen hat".

Amp-Env (lib/polysynth/defs.js Gruppe "Amp-Env") lief bisher hart verdrahtet über
linearRampToValueAtTime/exponentialRampToValueAtTime in engine.js. Jetzt läuft sie PRO
VOICE über eine eigene envCore.js AdsrCore-Instanz (dieselbe Engine wie das Multi-ADSR),
mit VOLLER Knob-/Settings-Parität (dd.md 20260802, 2. Runde: "alles von ADSR einfach
rein!") — identische State-Keys wie eine Multi-ADSR-Instanz (adsrA/adsrD/…), nur
unsuffixed. Defaults bilden das VORHERIGE Klangverhalten 1:1 nach (s. defs.js DEFAULTS-
Kommentar: adsrTrigMode/adsrLenFest bewusst überschrieben) — dieser Smoke prüft die
END-ZU-END-Verdrahtung (Voice→Gain, Settings-Panel→State→Engine).

Lauf: python3 test/ampEnvAdsrCore_smoke.py
Hart begrenzt (Watchdog killt nach 40s), kein Pollen.
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
        pg = b.new_page(viewport={"width": 1600, "height": 1100})
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.goto(f"http://localhost:{PORT}/overcord/", wait_until="networkidle", timeout=15000)

        check(pg.evaluate("() => typeof window.__polysynth.engine.debugAmpGain === 'function'"),
              "engine.debugAmpGain fehlt")

        # ── Deterministische Amp-Env-Werte, Defaults sonst unangetastet ──
        pg.evaluate("""() => {
            const st = window.__polysynth.state;
            st.set('adsrA', 0.05);
            st.set('adsrD', 0.05);
            st.set('adsrS', 0.4);
            st.set('adsrR', 0.05);
            st.set('osc2On', false);
            // adsrLenFest EXPLIZIT false (Smoke-Test-Altlast, todos.md 20260802_131434):
            // presets/werkbank-config.json (@dpas Werkseinstellungen, Commit f18f359) setzt
            // adsrLenFest=true + adsrLenMs~50ms — ein frischer Playwright-Browser lädt diese
            // Erstbesuch-Datei, NICHT die defs.js-DEFAULTS (dort steht adsrLenFest:false).
            // Ohne dieses Set schließt der Amp-Env automatisch ~50ms nach Decay-Ende (Fest-
            // Modus) und rutscht in Release, BEVOR dieser Test seinen Sustain-Wert misst —
            // die Peak*Sustain-Formel selbst ist korrekt (per Hand nachgemessen: exakt 0.12),
            // nur der implizite "frischer Browser = Code-Default" hielt nicht mehr.
            st.set('adsrLenFest', false);
            window.__polysynth.engine.noteOn(60, 127);   // volle Velocity -> peak = AMP_BASE = 0.3
        }""")

        # Nach Attack+Decay (0.1s) auf Sustain-Level (peak*0.4=0.12) eingeschwungen.
        time.sleep(0.15)
        g_sustain = pg.evaluate("() => window.__polysynth.engine.debugAmpGain(60)")
        check(g_sustain is not None, "debugAmpGain(60) sollte während Sustain etwas liefern")
        if g_sustain is not None:
            check(abs(g_sustain - 0.12) < 0.01, f"Sustain-Level sollte ~0.12 sein (peak 0.3 * sustain 0.4), war {g_sustain}")

        # noteOff -> Release (0.05s), Voice bleibt in activeVoices bis Release+Stop-Puffer.
        pg.evaluate("() => window.__polysynth.engine.noteOff(60)")
        time.sleep(0.03)
        g_release = pg.evaluate("() => window.__polysynth.engine.debugAmpGain(60)")
        check(g_release is not None, "debugAmpGain(60) sollte während Release noch etwas liefern")
        if g_release is not None and g_sustain is not None:
            check(g_release < g_sustain, f"Release-Gain sollte unter Sustain liegen: {g_release} vs {g_sustain}")

        # Nach Release+Stop-Puffer (0.05+0.02=0.07s) ist die Voice sauber abgeräumt.
        time.sleep(0.08)
        g_gone = pg.evaluate("() => window.__polysynth.engine.debugAmpGain(60)")
        check(g_gone is None, f"Voice sollte nach Release+Stop abgeräumt sein (debugAmpGain=None), war {g_gone}")

        # ── Settings-Panel: Amp-Env-Gruppe zeigt jetzt dieselben Settings wie ADSR ──
        group = pg.locator('.group[data-group="Amp-Env"]').first
        group.scroll_into_view_if_needed()
        group.locator('.group-title-bar').click(button="right")
        gset = pg.locator('.group-settings:visible')
        checkboxes = gset.locator('input[type="checkbox"]')
        check(checkboxes.count() >= 6, f"erwartet mind. 6 Toggle-Checkboxen (A/D/S/R aktiv, Inv, Verlauf), gefunden {checkboxes.count()}")
        selects = gset.locator('select')
        # Volle ADSR-Parität (dd.md 20260802, 2. Runde): jetzt 5 Selects statt 3 (A/D/R-Kurve
        # PLUS Modus/Len-Einheit, die die alte AMPENV_SETTINGS_SELECTS nicht kannte).
        check(selects.count() >= 5, f"erwartet mind. 5 Selects (A/D/R-Kurve, Modus, Len-Einheit), gefunden {selects.count()}")
        check(gset.get_by_text('Modus').count() > 0, "'Modus'-Select (TrigMode) fehlt — Amp-Env sollte jetzt volle ADSR-Parität haben")
        skew_nums = gset.locator('input[type="number"]')
        # 3 Skew-Felder + 1 Nullpunktversatz-Feld (jetzt auch bei Amp-Env vorhanden, s. defs.js).
        check(skew_nums.count() >= 4, f"erwartet mind. 4 Zahlenfelder (A/D/R-Skew + Nullpunktversatz), gefunden {skew_nums.count()}")
        check(gset.get_by_text('D aktiv').count() > 0, "'D aktiv'-Toggle-Label fehlt im Amp-Env-Settings-Panel")

        # "D aktiv" ausschalten -> State adsrDOn wird false.
        dtoggle = gset.locator('label', has_text='D aktiv').locator('input[type="checkbox"]')
        dtoggle.click()
        gset.locator('.kme-close').click()
        adsr_d_on = pg.evaluate("() => window.__polysynth.state.get('adsrDOn')")
        check(adsr_d_on is False, f"adsrDOn sollte nach dem Ausschalten false sein, war {adsr_d_on}")

        # Funktionale Wirkung: OHNE Decay hält die Sustain-Phase auf PEAK (0.3), nicht mehr
        # auf peak*sustain (0.12) — bestätigt, dass das Setting wirklich in der DSP ankommt.
        pg.evaluate("() => window.__polysynth.engine.noteOn(60, 127)")
        time.sleep(0.15)
        g_noD = pg.evaluate("() => window.__polysynth.engine.debugAmpGain(60)")
        pg.evaluate("() => window.__polysynth.engine.noteOff(60)")
        check(g_noD is not None and abs(g_noD - 0.3) < 0.01,
              f"mit ampDOn=false sollte die Sustain-Phase auf Peak (~0.3) bleiben, war {g_noD}")

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
print("SMOKE OK: Amp-Env läuft über AdsrCore (Sustain/Release/Cleanup korrekt), Settings-Panel zeigt A/D/S/R/Inv/Verlauf/Kurve/Skew und wirkt live in der DSP.")
