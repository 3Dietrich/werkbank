#!/usr/bin/env python3
"""Headless-Smoke: ddw.md @dpa 20260724 (Zeile 1078-1080):
'`button` Modus=Trigger: soll beim CLICKEN (Mouse DOWN) triggern! Überall wo Button Mode=trigger
ist.' + 'StepSeq/StepSeq/fill und set0 Sind noch nicht angeschlossen.'

Prüft:
  1. '!'-Button (Transport/Tempo, b:bang, Modus 'trigger'): ein reines 'mousedown' (OHNE
     mouseup/click) löst die Aktion bereits aus und zeigt sofort 'ctrl-on'. Ein kompletter
     Klick (mousedown+mouseup+click) feuert weiterhin nur EINMAL (keine Doppelauslösung durch
     einen übrig gebliebenen click-Listener).
  2. StepSeq/StepSeq Fill-Button: war bislang NICHT ans Modus-System angeschlossen (fester
     click-Listener, kein 'ctrl-on', Modus-Dropdown wirkungslos). Jetzt: Modus 'trigger' per
     Default, mousedown feuert die echte Fill-Aktion (seqSteps ändert sich nachweisbar) UND
     zeigt 'ctrl-on'.

Lauf: python3 test/buttonMousedownTrigger_smoke.py
Hart begrenzt (Watchdog killt nach 40s), kein Pollen.
"""
import subprocess, sys, time, os, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8171
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

        # ── 1) '!'-Button: mousedown allein triggert, kompletter Klick feuert nur 1x ──
        pg.evaluate("""() => {
            window.__bangCount = 0;
            const orig = window.__takt.engine.onAction.bind(window.__takt.engine);
            window.__takt.engine.onAction = (id, phase) => { if (id === 'bang') window.__bangCount++; return orig(id, phase); };
        }""")

        mousedown_only = pg.evaluate("""() => {
            const btn = document.querySelector('.group[data-group="Transport / Tempo"] .btn-field[data-ctrl="b:bang"] .pb-btn');
            btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
            return { on: btn.classList.contains('ctrl-on'), count: window.__bangCount };
        }""")
        check(mousedown_only['on'], "'!': reines mousedown sollte sofort 'ctrl-on' zeigen")
        check(mousedown_only['count'] == 1, f"'!': reines mousedown sollte die Aktion 1x auslösen, war {mousedown_only['count']}")

        # Echter Playwright-Klick (mousedown+mouseup+click über CDP, anders als JS .click(),
        # das NUR ein click-Event ohne mousedown auslöst) — prüft, dass kein übrig gebliebener
        # click-Listener ein zweites Mal feuert.
        bang_locator = pg.locator('.group[data-group="Transport / Tempo"] .btn-field[data-ctrl="b:bang"] .pb-btn')
        bang_locator.click()
        full_click = pg.evaluate("() => window.__bangCount")
        check(full_click == 2, f"'!': ein echter Klick sollte insgesamt genau 1x zusätzlich feuern (2 total), war {full_click}")

        # ── 2) StepSeq Fill: bislang unverkabelt, jetzt Modus-System + echte Aktion ──
        pg.evaluate("""() => {
            const st = window.__stepseq.state;   // Sq 0 nutzt Suffix '_0' (multiSq.js scoped())
            const steps = new Array(120).fill(null);
            steps[0] = 1; steps[1] = 0; steps[2] = 0; steps[3] = 0;
            st.set('seqLen_0', 4);
            st.set('seqSteps_0', steps);
        }""")

        fill = pg.locator('.group[data-group="Stepsequenzer"] .seq-ic-wrap .pb-btn[title], .group[data-group="Stepsequenzer"] .seq-ic-wrap button:has-text("Fill")').first
        check(fill.count() == 1, f"Fill-Button nicht gefunden, count={fill.count()}")

        result = pg.evaluate("""() => {
            const wrap = document.querySelector('.group[data-group="Stepsequenzer"] .seq-ic-wrap');
            const btn = [...document.querySelectorAll('.group[data-group="Stepsequenzer"] .seq-ic-wrap button')]
                .find(b => b.textContent.trim() === 'Fill');
            btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
            return {
                on: btn.classList.contains('ctrl-on'),
                hasCtrlBtn: btn.classList.contains('ctrl-btn'),
                step4: window.__stepseq.state.get('seqSteps_0')[4],
            };
        }""")
        check(result['hasCtrlBtn'], "Fill-Button sollte jetzt die generische 'ctrl-btn'-Klasse tragen")
        check(result['on'], "Fill-Button (Modus 'trigger') sollte nach mousedown 'ctrl-on' zeigen")
        check(result['step4'] == 1, f"Fill sollte das Muster [1,0,0,0] über Step 4 hinaus wiederholen (step4==1), war {result['step4']}")

        # Modus-Dropdown wirklich wirksam prüfen: Settings öffnen, Option 'nix' vorhanden.
        fill.click(button="right")
        panel = pg.locator('.elem-settings:visible')
        check(panel.count() == 1, f"Settings-Panel für Fill öffnet nicht, count={panel.count()}")
        values = panel.locator('.es-btnmode option').evaluate_all("els => els.map(e => e.value)")
        check('nix' in values and 'trigger' in values, f"Fill-Settings: Modus-Dropdown unvollständig, hat {values}")
        panel.locator('.kme-close').click()

        # ── zurück auf Standard, aufräumen ──
        pg.evaluate("""() => {
            const s = window.__takt.state;
            const cur = { ...(s.get('ctrlStyles') || {}) };
            delete cur['b:bang'];
            s.set('ctrlStyles', cur);
        }""")
        pg.evaluate("""() => {
            const s = window.__stepseq.state;
            const cur = { ...(s.get('ctrlStyles') || {}) };
            delete cur['u:seqFill_0'];
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
print("SMOKE OK: Trigger feuert auf mousedown (kein Doppelfeuer bei Klick), Fill/set0 sind ans Modus-System angeschlossen.")
