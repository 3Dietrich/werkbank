#!/usr/bin/env python3
"""Headless-Smoke: neuer Button-Modus 'nix' (ddw.md @dpa, Zeile 1064-1069: "Button Controls
... (neu) nix: triggert On beim drücken/aktivieren, aber bleibt auf BG off").

Prüft am '!'-Button (Transport/Tempo, b:bang):
  - Modus-Dropdown bietet 'nix' als Option an.
  - Im Modus 'nix': Klick feuert weiterhin die Aktion (onAction('bang', ...)), aber der Button
    zeigt NIE den ON-Zustand (keine 'ctrl-on'-Klasse, keine BG-Änderung).
  - Im Modus 'trigger' (Default) zeigt der Button weiterhin sichtbar AN (Regressionscheck,
    unverändertes Verhalten).

Lauf: python3 test/buttonNixMode_smoke.py
Hart begrenzt (Watchdog killt nach 40s), kein Pollen.
"""
import subprocess, sys, time, os, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8170
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
        pg.goto(f"http://localhost:{PORT}/", wait_until="networkidle", timeout=15000)

        bang = pg.locator('.group[data-group="Transport / Tempo"] .btn-field[data-ctrl="b:bang"]')
        check(bang.count() == 1, f"'!'-Button (b:bang) nicht gefunden, count={bang.count()}")

        # Monkeypatch: zählt echte onAction('bang')-Aufrufe, unabhängig vom Button-Modus.
        pg.evaluate("""() => {
            window.__bangCount = 0;
            const orig = window.__takt.engine.onAction.bind(window.__takt.engine);
            window.__takt.engine.onAction = (id, phase) => { if (id === 'bang') window.__bangCount++; return orig(id, phase); };
        }""")

        # ── Regressionscheck: Default-Modus 'trigger' zeigt weiterhin sichtbar AN ──
        on_after_trigger_click = pg.evaluate("""() => {
            const btn = document.querySelector('.group[data-group="Transport / Tempo"] .btn-field[data-ctrl="b:bang"] .pb-btn');
            btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
            return btn.classList.contains('ctrl-on');
        }""")
        check(on_after_trigger_click, "Modus 'trigger': Button sollte direkt nach Mousedown 'ctrl-on' zeigen (Regression)")
        count_after_trigger = pg.evaluate("() => window.__bangCount")
        check(count_after_trigger == 1, f"Modus 'trigger': onAction('bang') sollte 1x gefeuert haben, war {count_after_trigger}")

        # ── Settings-Panel öffnen, Modus-Dropdown prüfen + auf 'nix' umstellen ──
        bang.click(button="right")
        panel = pg.locator('.elem-settings:visible')
        check(panel.count() == 1, f"Settings-Panel öffnet nicht, count={panel.count()}")

        mode_select = panel.locator('.es-btnmode')
        options = mode_select.locator('option').all_inner_texts()
        values = mode_select.locator('option').evaluate_all("els => els.map(e => e.value)")
        check('nix' in values, f"Modus-Dropdown sollte Option 'nix' anbieten, hat nur {values}")

        mode_select.select_option('nix')
        time.sleep(0.05)
        panel.locator('.kme-close').click()

        # ── Klick im Modus 'nix': Aktion feuert weiter, aber NIE 'ctrl-on' ──
        on_after_nix_click = pg.evaluate("""() => {
            const btn = document.querySelector('.group[data-group="Transport / Tempo"] .btn-field[data-ctrl="b:bang"] .pb-btn');
            btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
            return btn.classList.contains('ctrl-on');
        }""")
        check(not on_after_nix_click, "Modus 'nix': Button sollte NIE 'ctrl-on' zeigen")
        count_after_nix = pg.evaluate("() => window.__bangCount")
        check(count_after_nix == 2, f"Modus 'nix': onAction('bang') sollte insgesamt 2x gefeuert haben, war {count_after_nix}")

        # ── zurück auf Standard, aufräumen ──
        bang.click(button="right")
        panel2 = pg.locator('.elem-settings:visible')
        panel2.locator('.es-btnmode').select_option('trigger')
        time.sleep(0.05)
        panel2.locator('.kme-close').click()
        pg.evaluate("""() => {
            const s = window.__takt.state;
            const cur = { ...(s.get('ctrlStyles') || {}) };
            delete cur['b:bang'];
            s.set('ctrlStyles', cur);
        }""")

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
print("SMOKE OK: Button-Modus 'nix' feuert die Aktion, bleibt aber ohne ON-Anzeige; 'trigger' unverändert.")
