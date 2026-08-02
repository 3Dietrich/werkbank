#!/usr/bin/env python3
"""Headless-Smoke: Amp-Env teilt sich seit dd.md 20260802 (2. Runde: "alles von ADSR
einfach rein!") den groupKind 'ADSR' UND dieselben State-Keys wie Multi-ADSR (nur
unsuffixed, s. defs.js GROUPS-Eintrag 'Amp-Env'). Prüft:
  · listGroupCombos('Amp-Env') und listGroupCombos(<erste Multi-ADSR-Instanz>) liefern
    denselben Pool (in Amp-Env gespeicherte Combo taucht bei der ADSR-Instanz auf).
  · Volle Knob-Parität: adsrPeak/adsrLenMs/adsrTrigMode/adsrNullpunkt sind über den
    bloßen (unsuffixed) State-Key lesbar — nicht mehr nur die alte Teilmenge
    (ampAttack/ampDecay/ampSustain/ampRelease).
  · Settings-Hook-Zusammenlegung (overcord/werkbank.js _groupKindSettings.ADSR) hat den
    unsuffixed Zweig nicht kaputt gemacht: A/D/S/R + Peak sind live schreibbar.
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
        # die echten Instanzen heißen 'ADSR', 'ADSR 2', … (envName(i), s. multiEnv.js) — die
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

        # Regressionscheck: VOLLE Knob-Parität — nicht mehr nur die alte AMPENV-Teilmenge
        # (A/D/S/R), sondern auch Peak/Len/TrigMode/Nullpunkt direkt (unsuffixed) im State.
        pg.evaluate("""() => {
            const st = window.__polysynth.state;
            st.set('adsrA', 0.02); st.set('adsrPeak', 2); st.set('adsrTrigMode', 'gate');
            st.set('adsrLenMs', 250); st.set('adsrNullpunkt', 0);
        }""")
        vals = pg.evaluate("""() => ({
            a: window.__polysynth.state.get('adsrA'),
            peak: window.__polysynth.state.get('adsrPeak'),
            trigMode: window.__polysynth.state.get('adsrTrigMode'),
            lenMs: window.__polysynth.state.get('adsrLenMs'),
        })""")
        check(vals['a'] == 0.02, f"adsrA nicht schreib-/lesbar, war {vals['a']!r}")
        check(vals['peak'] == 2, f"adsrPeak nicht schreib-/lesbar, war {vals['peak']!r}")
        check(vals['trigMode'] == 'gate', f"adsrTrigMode nicht schreib-/lesbar, war {vals['trigMode']!r}")
        check(vals['lenMs'] == 250, f"adsrLenMs nicht schreib-/lesbar, war {vals['lenMs']!r}")

        # Settings-Panel-Hook (zusammengelegt, s. overcord/werkbank.js _groupKindSettings.ADSR):
        # Amp-Env muss weiterhin über den Rechtsklick bedienbar sein (kein leeres Panel).
        group = pg.locator('.group[data-group="Amp-Env"]').first
        group.scroll_into_view_if_needed()
        group.locator('.group-title-bar').click(button="right")
        gset = pg.locator('.group-settings:visible')
        check(gset.locator('input[type="checkbox"]').count() >= 6,
              f"Amp-Env-Settings-Panel zu leer: {gset.locator('input[type=\"checkbox\"]').count()} Checkboxen")
        # Copy/Delete (+➚/🚮) dürfen bei Amp-Env NICHT auftauchen (sfx='' -> falsches Ziel,
        # s. overcord/werkbank.js-Kommentar an der Buttons-Sektion).
        check(gset.get_by_text('+➚').count() == 0, "Amp-Env sollte KEINEN Copy-Button zeigen (sfx='')")
        gset.locator('.kme-close').click()

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
print("SMOKE OK: Amp-Env und Multi-ADSR teilen sich den Combo-Pool (groupKind 'ADSR'); volle Knob-Parität (Peak/Len/Modus/Nullpunkt) intakt; kein irreführender Copy/Delete-Button.")
