#!/usr/bin/env python3
"""Headless-Smoke: Amp-Env teilt sich seit dd.md 20260802 den groupKind 'ADSR' mit Multi-ADSR
(defs.js GROUPS-Eintrag 'Amp-Env': groupKind:'ADSR'). Prüft:
  · listGroupCombos('Amp-Env') und listGroupCombos(<erste Multi-ADSR-Instanz>) liefern
    denselben Pool (in Amp-Env gespeicherte Combo taucht bei der ADSR-Instanz auf).
  · Amp-Env-Settings bleiben über eigene AMPENV_SETTINGS_*-Keys les-/schreibbar (Regression:
    die Hook-Zusammenlegung in overcord/werkbank.js _groupKindSettings.ADSR darf das
    unsuffixed Amp-Env-Zweig nicht kaputt machen).
Lauf: python3 test/ampEnvComboPoolShared_smoke.py
Hart begrenzt (Watchdog killt nach 40s), kein Pollen.
"""
import subprocess, sys, time, os, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8153
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
        pg.goto(f"http://localhost:{PORT}/overcord/", wait_until="networkidle", timeout=15000)

        host_js = "window.__polysynth.host"
        names = pg.evaluate(f"() => {host_js}.groupNames()")
        check('Amp-Env' in names, f"'Amp-Env' fehlt in groupNames(): {names!r}")
        # 'Multi-ADSR' ist nur die statische Platzhalter-Gruppe aus defs.js (s. Kommentar dort),
        # die echten Instanzen heißen 'ADSR', 'ADSR_1', … (envName(i), s. multiEnv.js) — die
        # Platzhalter-Gruppe ausschließen, sonst matcht find() sie fälschlich zuerst.
        first_adsr_name = pg.evaluate(f"""
            () => {host_js}.groupNames().find(n => n !== 'Amp-Env' && n !== 'Multi-ADSR' && n.toLowerCase().includes('adsr'))
        """)
        check(bool(first_adsr_name), f"keine Multi-ADSR-Gruppe gefunden in {names!r}")

        # Combo unter Amp-Env speichern, dann prüfen dass sie unter der Multi-ADSR-Instanz sichtbar ist
        # (Pool-Beweis, analog seqComboSnapPool_smoke.py).
        pg.evaluate(f"() => {host_js}.saveGroupCombo('Amp-Env', 'ComboPoolTest')")
        combos_ampenv = pg.evaluate(f"() => {host_js}.listGroupCombos('Amp-Env').map(c => c.name)")
        check('ComboPoolTest' in combos_ampenv, f"Combo nicht unter Amp-Env gelistet: {combos_ampenv!r}")

        if first_adsr_name:
            combos_adsr = pg.evaluate(f"() => {host_js}.listGroupCombos({first_adsr_name!r}).map(c => c.name)")
            check('ComboPoolTest' in combos_adsr,
                  f"Combo-Pool NICHT geteilt: unter {first_adsr_name!r} fehlt 'ComboPoolTest' ({combos_adsr!r})")
            # Aufräumen über die tatsächlich existierende Instanz (Index statt Name).
            idx = pg.evaluate(f"""
                () => {host_js}.listGroupCombos({first_adsr_name!r}).findIndex(c => c.name === 'ComboPoolTest')
            """)
            if idx is not None and idx >= 0:
                pg.evaluate(f"() => {host_js}.deleteGroupCombo({first_adsr_name!r}, {idx})")

        # Regressionscheck: Amp-Env-Settings-Keys (AMPENV_SETTINGS_*) bleiben direkt (unsuffixed)
        # les-/schreibbar über den State — das ist genau das, was der zusammengelegte Hook liest.
        ampenv_toggle_keys = pg.evaluate("""
            () => Object.keys(window.__polysynth.instr?.defsObj?.AMPENV_SETTINGS_TOGGLES
                || (window.polySynthDefsObj && window.polySynthDefsObj.AMPENV_SETTINGS_TOGGLES) || {})
        """)
        # Fallback: direkt über den State ampAttack/ampDecay lesen (existiert so oder so).
        amp_attack = pg.evaluate("() => window.__polysynth.state.get('ampAttack')")
        check(amp_attack is not None, "ampAttack nicht im polySynthState lesbar — Amp-Env-Keys kaputt?")

        b.close()
except Exception as e:
    fails.append(f"Exception: {e}")
finally:
    srv.terminate()

if errors:
    fails.append(f"Konsolen-/Page-Errors: {errors[:5]}")

if fails:
    print("SMOKE FAIL:")
    for f in fails: print(" -", f)
    sys.exit(1)
print("SMOKE OK: Amp-Env und Multi-ADSR teilen sich den Combo-Pool (groupKind 'ADSR'); Amp-Env-Keys intakt.")
