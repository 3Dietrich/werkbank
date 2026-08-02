#!/usr/bin/env python3
"""Headless-Selbsttest: der ⏵-Gate-Button zeigt jetzt auch EXTERN getriebene Gates
(ddw.md 20260727_144x, @dpa: "Es wäre schön, wenn man die ankommenden Gates in der
ADSR sehen könnte, etwa durch Button on,off").

Vorher: der Button-„an"-Zustand (isOn/ctrl-on-Klasse) wurde NUR von GroupHost.js'
eigenem Klick-Handling gesetzt — ein Sequenzer, der über routing.deliver() direkt
eng.gateOn()/gateOff() aufruft, ging am Button komplett vorbei. Fix: EnvEngine._setGate()
ruft jetzt bei JEDER _gate-Änderung host.setCtrlOn('b:adsrGate_i', on) auf — unabhängig
von der Quelle (Klick, Tastatur/MIDI, Routing).

Zweiter Aspekt (Regressionsschutz): im TRIG-Modus darf das NICHT passieren — dort hat
_gate kein sinnvolles Dauer-„an" (jeder trigger() würde sofort wieder auf false
zurückschalten und den Klick-Flash von GroupHost.js sofort abwürgen, ohne Fade).

Lauf: python3 test/adsrGateVisibility_smoke.py
Hart begrenzt (40s Watchdog), kein Pollen.
"""
import subprocess, sys, time, os, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8229
HARD_LIMIT_S = 40

def watchdog():
    time.sleep(HARD_LIMIT_S)
    print(f"SMOKE: HARD-TIMEOUT nach {HARD_LIMIT_S}s — abgebrochen.")
    os._exit(2)

threading.Thread(target=watchdog, daemon=True).start()

srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT)],
                       cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
errors, fails = [], []
check = lambda ok, msg: None if ok else fails.append(msg)

try:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(f"http://localhost:{PORT}/overcord/", wait_until="domcontentloaded")
        page.wait_for_function("window.__env && window.__polysynth && window.__routing", timeout=15000)
        page.mouse.click(5, 5)

        btn = page.locator('[data-ctrl="b:adsrGate_0"] button')
        check(btn.count() == 1, f"Gate-Button nicht eindeutig im DOM (count={btn.count()})")

        # ── 1) Gate-Modus: externes Gate (wie ein Sq-Step) muss den Button sichtbar an-/ausschalten ──
        page.evaluate("""() => {
            const st = window.__polysynth.state;
            st.set('adsrTrigMode_0', 'gate');
            window.__routing.reg.deliver({ module: 'stepseq', port: 'amp', instance: '_vis' },
                                          { module: 'polysynth.env_0', port: 'gate' }, 1);
        }""")
        page.wait_for_timeout(60)
        on_class = btn.evaluate("(el) => el.classList.contains('ctrl-on')")
        check(on_class, "Extern getriebenes Gate-ON sollte den Button sichtbar aktiv zeigen (ctrl-on)")

        page.evaluate("""() => {
            window.__routing.reg.deliver({ module: 'stepseq', port: 'amp', instance: '_vis' },
                                          { module: 'polysynth.env_0', port: 'gate' }, 0);
        }""")
        page.wait_for_timeout(60)
        off_class = btn.evaluate("(el) => el.classList.contains('ctrl-on')")
        check(not off_class, "Externes Gate-OFF sollte den Button wieder deaktiviert zeigen")

        # ── 2) Trig-Modus: echter Klick löst weiterhin den Flash aus (kein Abwürgen durch _setGate) ──
        # Spy statt Timing-Wettlauf (Playwright-.click() selbst braucht schon >16ms für seine
        # Actionability-Checks — ein Timing-Fenster von 16ms ließe sich damit nicht zuverlässig
        # treffen): zählt, wie oft paint() den Button auf isOn=true stellt.
        page.evaluate("() => window.__polysynth.state.set('adsrTrigMode_0', 'trig')")
        page.wait_for_timeout(30)
        page.evaluate("""() => {
            window.__flashCount = 0;
            const btn = document.querySelector('[data-ctrl="b:adsrGate_0"] button');
            const obs = new MutationObserver(() => {
                if (btn.classList.contains('ctrl-on')) window.__flashCount++;
            });
            obs.observe(btn, { attributes: true, attributeFilter: ['class'] });
        }""")
        btn.click()
        page.wait_for_timeout(80)
        flash_count = page.evaluate("() => window.__flashCount")
        check(flash_count >= 1, f"Trig-Klick sollte den gewohnten Flash auslösen (ctrl-on mind. einmal gesetzt), war {flash_count}")
        after_fade = btn.evaluate("(el) => el.classList.contains('ctrl-on')")
        check(not after_fade, "Trig-Flash sollte nach der Fade-Zeit wieder aus sein")

        browser.close()
finally:
    srv.terminate()
    try:
        srv.wait(timeout=5)
    except Exception:
        srv.kill()

for e in errors: print("PAGEERROR:", e)
if fails:
    for f in fails: print("FAIL:", f)
    sys.exit(1)
print("SMOKE OK: Gate-Button zeigt extern getriebene Gates (Gate-Modus), Trig-Klick-Flash bleibt unangetastet.")
