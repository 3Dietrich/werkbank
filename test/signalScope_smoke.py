#!/usr/bin/env python3
"""Headless-Selbsttest Signal-Scope (@dpa 20260726): der Scope ist eine REINE
ANZEIGE — kein Routing-Modul, kein Input-Port, kein write() irgendwo. Er wählt
eine bestehende Quelle (routing.outputSources()) und liest sie passiv mit
routing.getValue(). Der Test verifiziert genau das, damit der Fehlversuch
(Scope als Inline-Insert mit eigenem Ziel-Port, der Werte klemmte) nicht
wiederkehrt.

Lauf: python3 test/signalScope_smoke.py
Hart begrenzt (30s Watchdog), kein Pollen.
"""
import subprocess, sys, time, os, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8149
HARD_LIMIT_S = 30

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
        ctx = browser.new_context(bypass_csp=True)
        page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(f"http://localhost:{PORT}/overcord/", wait_until="domcontentloaded")
        page.wait_for_function("window.__scope && window.__routing && window.__env", timeout=15000)

        # ── 1) Scope ist KEIN Routing-Modul (kein registerModule aufgerufen) ──
        is_module = page.evaluate("window.__routing.reg.modules().some(m => m.id.includes('scope'))")
        check(not is_module, f"Scope hat sich als Routing-Modul registriert (soll NICHT): {is_module}")

        # ── 2) outputSources() findet die ADSR-Env als lesbare Quelle ──
        sources = page.evaluate("window.__routing.reg.outputSources().map(s => s.module + '.' + s.port)")
        check(any('env' in s for s in sources), f"Env-Output nicht in outputSources(): {sources}")

        # ── 3) Scope zeigt den Wert der gewählten Quelle — OHNE selbst etwas
        #      zu schreiben (kein write() existiert am Scope) ──
        data = page.evaluate("""() => {
            const scope = window.__scope.mgr.scopes[0];
            const before = { hasWrite: typeof scope.push === 'function' && false }; // push() existiert nicht mehr
            scope.setSource({ module: 'polysynth.env_0', port: 'out' });
            const eng = window.__polysynth.engine;
            eng.noteOn(60, 100);
            window.__env.mgr.gateAt(0);
            const ctx = window.__audioBus.getContext();
            const waitAudio = (sec) => { const t1 = ctx.currentTime + sec; while (ctx.currentTime < t1) {} };
            waitAudio(0.05);
            scope.sample(window.__routing.reg);
            const scopeVal = scope._last;
            eng.allNotesOff();
            return { scopeVal, hasPushMethod: typeof scope.push === 'function' };
        }""")
        check(abs(data['scopeVal']) > 0.05, f"Scope hat den Env-Wert nicht übernommen: {data}")
        check(not data['hasPushMethod'], "Scope hat noch eine push()-Methode (Alt-API, sollte entfernt sein)")

        # ── 4) Der bestehende Signalweg (Env → preQuantMod) bleibt UNABHÄNGIG vom
        #      Scope funktionsfähig — der Scope darf ihn nicht beeinflussen ──
        chain = page.evaluate("""() => {
            window.__polysynth.state.set('adsrOutput_0', 'polysynth.preQuantMod');
            window.__polysynth.state.set('pitchSmooth', 0);
            // Nullpunktversatz=1 (ddw.md 20260727, „Bug2"-Fix): preMod() multipliziert die
            // Frequenz DIREKT (raw*mod, s. engine.js) — das alte, fest verdrahtete `1+mod` ist
            // zurückgebaut. Ein Frequenz-Ziel (Ruhepunkt 1, nicht 0) braucht den Versatz jetzt
            // EXPLIZIT an der Env, sonst multipliziert der Default-Nullpunkt (0) die Frequenz mit
            // dem rohen 0..1-Envelope-Wert nach UNTEN statt nach oben — genau das ließ diesen Test
            // fehlschlagen, obwohl der Signalweg selbst intakt war (Test war auf die alte, seither
            // zurückgebaute Formel geeicht).
            window.__polysynth.state.set('adsrNullpunkt_0', 1);
            const eng = window.__polysynth.engine;
            const scope = window.__scope.mgr.scopes[0];  // bleibt auf env_0 eingestellt
            eng.noteOn(60, 100);
            const f0 = eng.debugDampGain(60)?.[0]?.freq;
            window.__env.mgr.gateAt(0);
            const ctx = window.__audioBus.getContext();
            const waitAudio = (sec) => { const t1 = ctx.currentTime + sec; while (ctx.currentTime < t1) {} };
            waitAudio(0.05);
            window.__env.mgr.flush();
            scope.sample(window.__routing.reg);
            waitAudio(0.02);  // Audio-Thread verarbeiten lassen (setValueAtTime braucht einen Tick)
            const f1 = eng.debugDampGain(60)?.[0]?.freq;
            const scopeVal = scope._last;
            eng.allNotesOff(); eng.setPreModValue(0);
            window.__polysynth.state.set('adsrNullpunkt_0', 0);
            return { f0, f1, scopeVal };
        }""")
        check(chain['f1'] > chain['f0'] * 1.1,
              f"Signalweg (Env→preQuantMod) läuft nicht mehr, trotz aktivem Scope: {chain}")
        check(abs(chain['scopeVal']) > 0.05,
              f"Scope sieht den Wert nicht, während der Signalweg läuft: {chain}")

        browser.close()
finally:
    srv.terminate()

for e in errors: print("PAGEERROR:", e)
if fails:
    for f in fails: print("FAIL:", f)
    sys.exit(1)
print("SMOKE: Signal-Scope OK — reine Anzeige (kein Routing-Modul, kein write()), "
      "sieht die Quelle passiv, bestehender Signalweg bleibt unbeeinflusst.")
