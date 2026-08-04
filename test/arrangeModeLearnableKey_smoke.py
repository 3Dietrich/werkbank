#!/usr/bin/env python3
"""Headless-Smoke: Bug 2 aus ddw.md (@dpa, woertlich: "der Tastaturshortcut ist fuer
e-mode (='e') festgeloetet, das muss er nicht mehr, weil es einen 'learnbaren' header
button dafuer gibt.").

Vorher: lib/group/GroupHost.js hatte in JEDEM mountGroups()-eigenen Tastatur-Listener
(ein Exemplar PRO Instrument/ISM) `e.key === 'e' || e.key === 'E'` hart verdrahtet --
unabhaengig davon, was der Header-Knopf "⇄ Anordnen" ueber KeyMidi gelernt hatte
(`keyMidi.register('hdr:arrangemode', …)` existierte zwar schon, aber NUR der Knopf
selbst hoerte darauf; ein reales Umlernen aendert nichts an GroupHost.js' eigenem,
parallelen 'e'-Listener).

Jetzt: GroupHost.js liest `opts.arrangeKeyOf()` (von jedem Einstiegspunkt mit derselben
Funktion durchgereicht, die `taktState.keyBindings['hdr:arrangemode']` liest -- taktState
ist der State HINTER allen Header-Knoepfen, s. "const keyMidi = takt.keyMidi" in
overcord/werkbank.js, werkbank-leer/werkbank-leer.js, pitchosc/pitchosc.js). Ohne gelernte
Taste bleibt der Default 'e'/'E' (Bestandsnutzer merken nichts). Mit gelernter Taste
wirkt NUR noch diese -- 'e' toggelt dann NICHT mehr.

Geprueft in overcord/, werkbank-leer/ UND pitchosc/ (dieselbe GroupHost.js-/mount.js-
Logik):
  - Default (nichts gelernt): 'e' toggelt Anordnen-Modus an mehreren Instrumenten
    GLEICHZEITIG (Takt/Metronom UND Debug -- beide teilen sich denselben Listener-Trigger).
  - Nach dem Lernen einer anderen Taste (state.keyBindings['hdr:arrangemode']='r'):
    'e' toggelt NICHT MEHR, 'r' toggelt weiterhin an BEIDEN Instrumenten synchron.

Getriggert ueber echten `page.keyboard.press()` (echter, getrusteter Keyboard-Event via
CDP), NICHT ueber eine simulierte KeyboardEvent-Injektion und NICHT ueber echtes
Audio/Play-Buttons (CLAUDE.md "Headless-Audio-Falle").

Lauf: python3 test/arrangeModeLearnableKey_smoke.py
Hart begrenzt (40s Watchdog), kein Pollen.
"""
import subprocess, sys, time, os, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8296
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

ENTRIES = ["overcord/", "werkbank-leer/", "pitchosc/"]

try:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for entry in ENTRIES:
            ctx = browser.new_context(viewport={"width": 1600, "height": 1100})
            page = ctx.new_page()
            page.on("pageerror", lambda e, entry=entry: errors.append(f"{entry}: {e}"))
            page.goto(f"http://localhost:{PORT}/{entry}", wait_until="networkidle", timeout=15000)
            page.wait_for_function(
                "window.__takt && window.__takt.host && window.__debug && window.__debug.host",
                timeout=15000)

            def arranging():
                return page.evaluate(
                    "() => [window.__takt.host.isArranging(), window.__debug.host.isArranging()]")

            # Sauberer Ausgangszustand (falls ein frueherer Testlauf/Import etwas hinterliess).
            a0 = arranging()
            if any(a0):
                page.keyboard.press('e')
                page.wait_for_timeout(30)

            # ── Default: 'e' toggelt BEIDE Instrumente gleichzeitig ──────────────────────
            page.keyboard.press('e')
            page.wait_for_timeout(30)
            check(arranging() == [True, True], f"{entry}: 'e' (Default) sollte Takt+Debug in Anordnen-Modus schalten, war {arranging()}")
            page.keyboard.press('e')
            page.wait_for_timeout(30)
            check(arranging() == [False, False], f"{entry}: 'e' (Default) sollte Anordnen-Modus wieder verlassen, war {arranging()}")

            # ── Umlernen: hdr:arrangemode -> 'r' (derselbe State-Key, den KeyMidi fuer den
            # Header-Knopf benutzt, s. taktState.keyBindings) ────────────────────────────
            page.evaluate("""() => {
                const st = window.__takt.state;
                const map = { ...(st.get('keyBindings') || {}) };
                map['hdr:arrangemode'] = 'r';
                st.set('keyBindings', map);
            }""")

            # 'e' darf jetzt NICHT MEHR wirken.
            page.keyboard.press('e')
            page.wait_for_timeout(30)
            check(arranging() == [False, False], f"{entry}: alte Taste 'e' sollte nach dem Umlernen NICHT mehr wirken, war {arranging()}")

            # 'r' (die neu gelernte Taste) MUSS jetzt wirken, an BEIDEN Instrumenten synchron.
            page.keyboard.press('r')
            page.wait_for_timeout(30)
            check(arranging() == [True, True], f"{entry}: gelernte Taste 'r' sollte Takt+Debug in Anordnen-Modus schalten, war {arranging()}")
            page.keyboard.press('r')
            page.wait_for_timeout(30)
            check(arranging() == [False, False], f"{entry}: gelernte Taste 'r' sollte Anordnen-Modus wieder verlassen, war {arranging()}")

            # Aufraeumen: Bindung zuruecksetzen, damit ein evtl. persistenter Server-State
            # (localStorage bleibt im Browser-Context) nachfolgende Laeufe nicht verfaelscht.
            page.evaluate("""() => {
                const st = window.__takt.state;
                const map = { ...(st.get('keyBindings') || {}) };
                delete map['hdr:arrangemode'];
                st.set('keyBindings', map);
            }""")

            errs = [e for e in errors if "favicon" not in e.lower()]
            check(len(errs) == 0, f"{entry}: Console-/Page-Errors: {errs}")

            page.close()
            ctx.close()
        browser.close()
except Exception as e:
    fails.append(f"Exception: {e}")
finally:
    srv.terminate()

if fails:
    print("SMOKE FAIL:")
    for f in fails:
        print(" -", f)
    sys.exit(1)
print("SMOKE OK: Anordnen-Taste ist lernbar (Default 'e' fuer Bestandsnutzer unveraendert, "
      "nach Umlernen wirkt nur noch die neue Taste, 'e' NICHT mehr) — geprueft an Takt+Debug "
      "gleichzeitig in overcord/, werkbank-leer/ UND pitchosc/.")
