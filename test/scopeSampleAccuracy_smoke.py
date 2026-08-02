#!/usr/bin/env python3
"""Headless-Selbsttest: Signal-Scope „Genauigkeit" [frame, sample] (ddw.md 20260727,
Grill-Runde: frame bleibt Default, sample = echter AnalyserNode audio-rate, nur für
Quellen mit echtem AudioNode wählbar, sonst stiller Fallback auf frame).

Prüft (kein UI-Zufall, alles deterministisch über echte Audio-Zeit/DOM):
  1. Ohne gewählte Quelle: hasNode()=false.
  2. ADSR-Envelope-Quelle (polysynth.env_0.out) hat einen echten AudioNode → hasNode()=true.
  3. accuracy='sample' baut einen echten AnalyserNode auf (this._analyser).
  4. Der eigentliche Nutzen: ein SEHR KURZER Trigger-Puls (D=5ms), der zum Zeitpunkt des
     nächsten tick()-Aufrufs (20ms später, per echter Wartezeit) im LIVE-Wert (frame-
     Äquivalent, engine.read()) schon wieder abgeklungen ist, ist im AnalyserNode-Puffer
     (sample-Modus) TROTZDEM noch als Peak sichtbar — genau das behebt ddw.md: „sehr kurze
     Env zeigt bei jedem Trigger anders, kaum von linear zu unterscheiden".
  5. Fallback: Quellwechsel auf eine node-lose Quelle (polysynth.baseFreq, reiner JS-Wert)
     schaltet 'sample' still ab (_analyser wird abgebaut, effektive Genauigkeit 'frame').
  6. Echtes UI: Rechtsklick auf den Scope öffnet ElementSettings — der Genauigkeit-Toggle
     ist bei einer node-losen Quelle ausgegraut (disabled).

Lauf: python3 test/scopeSampleAccuracy_smoke.py
Hart begrenzt (40s Watchdog), kein Pollen.
"""
import subprocess, sys, time, os, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8223
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
        ctx = browser.new_context(bypass_csp=True)
        page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(f"http://localhost:{PORT}/overcord/", wait_until="domcontentloaded")
        page.wait_for_function("window.__scope && window.__env && window.__routing && window.__polysynth", timeout=15000)

        # Echter Mausklick (User-Geste) — OHNE die bleibt der AudioContext unter Chromiums
        # Autoplay-Policy 'suspended', ctx.currentTime friert ein, AnalyserNode liefert nur
        # Stille (Flakiness beobachtet @dpa 20260727-Rückfrage: erst 20/20 grün, dann 0/3 —
        # Root Cause per Probe verifiziert: ctx.resume() aus reinem page.evaluate() greift
        # NICHT ohne echte Geste, ein page.mouse.click() dagegen zuverlässig). Vgl.
        # adsrGateButtonClick_smoke.py, das denselben Effekt über einen echten DOM-Klick löst.
        # Der Klick allein reicht noch NICHT — resume() ist async, ohne explizites Abwarten
        # lief das nachfolgende evaluate() dem 'running'-Übergang manchmal davon (weiterhin
        # 'suspended' beobachtet trotz Klick) — darum hart auf den Context-State pollen.
        page.evaluate("() => { window.__env.mgr.engines[0]._audio(); }")
        page.mouse.click(5, 5)
        page.wait_for_function(
            "() => window.__env.mgr.engines[0]._audio().state === 'running'", timeout=5000)

        result = page.evaluate("""async () => {
            const scope = window.__scope.mgr.scopes[0];
            const reg = window.__routing.reg;
            const st = window.__polysynth.state;
            const env = window.__env.mgr.engines[0];
            const out = {};

            out.hasNodeBefore = scope.hasNode();

            const sources = reg.outputSources();
            const adsrSrc = sources.find((s) => s.module === 'polysynth.env_0' && s.port === 'out');
            const baseFreqSrc = sources.find((s) => s.module === 'polysynth' && s.port === 'baseFreq');
            out.adsrSrcFound = !!adsrSrc;
            out.adsrSrcHasNode = !!(adsrSrc && adsrSrc.hasNode);
            out.baseFreqSrcFound = !!baseFreqSrc;
            out.baseFreqSrcHasNode = !!(baseFreqSrc && baseFreqSrc.hasNode);

            scope.setSource(adsrSrc);
            out.hasNodeAfterAdsr = scope.hasNode();

            scope.applyStyle({ accuracy: 'sample', bufferMs: 40 });
            out.analyserBuiltForAdsr = !!scope._analyser;
            out.effectiveAfterAdsrSample = scope._effectiveAccuracy();

            // Sehr kurzer Trigger + Wartezeit (ECHTE Zeit, nicht rAF) — genau der Fall aus
            // ddw.md, wo ein Frame-Snapshot den Puls verpassen/verzerrt zeigen kann.
            st.set('adsrA_0', 0.0005); st.set('adsrD_0', 0.005); st.set('adsrS_0', 0);
            st.set('adsrR_0', 0.005); st.set('adsrPeak_0', 1);
            st.set('adsrAOn_0', true); st.set('adsrDOn_0', true); st.set('adsrSOn_0', true); st.set('adsrROn_0', true);
            env.trigger();
            await new Promise((res) => setTimeout(res, 20));
            out.liveValueAfterWait = env.read();
            scope.tick();
            const buf = scope._analyserBuf;
            out.analyserPeak = buf ? Math.max(...Array.from(buf).map(Math.abs)) : null;

            // Fallback: node-lose Quelle während 'sample' gewählt → still zurück auf frame.
            scope.setSource(baseFreqSrc);
            out.hasNodeAfterFallback = scope.hasNode();
            out.analyserAfterFallback = !!scope._analyser;
            out.effectiveAfterFallback = scope._effectiveAccuracy();

            return out;
        }""")

        print("JS-Ergebnis:", result)
        check(result["hasNodeBefore"] is False, "hasNode() ohne Quelle sollte false sein")
        check(result["adsrSrcFound"], "ADSR-Env-Quelle (polysynth.env_0.out) nicht in outputSources() gefunden")
        check(result["adsrSrcHasNode"] is True, "ADSR-Env-Quelle sollte hasNode=true tragen")
        check(result["baseFreqSrcFound"], "polysynth.baseFreq nicht in outputSources() gefunden")
        check(result["baseFreqSrcHasNode"] is not True, "polysynth.baseFreq sollte KEINEN Node haben (reiner JS-Wert)")
        check(result["hasNodeAfterAdsr"] is True, "hasNode() nach ADSR-Quellwahl sollte true sein")
        check(result["analyserBuiltForAdsr"] is True, "AnalyserNode wurde bei accuracy=sample + ADSR-Quelle nicht aufgebaut")
        check(result["effectiveAfterAdsrSample"] == "sample", f"effektive Genauigkeit sollte 'sample' sein, war {result['effectiveAfterAdsrSample']}")
        check(abs(result["liveValueAfterWait"]) < 0.3,
              f"Live-Wert 20ms nach einem 5ms-Trigger sollte schon wieder klein sein (war {result['liveValueAfterWait']}) — Testaufbau prüfen")
        check(result["analyserPeak"] is not None and result["analyserPeak"] > 0.3,
              f"AnalyserNode-Puffer sollte den kurzen Trigger-Peak noch zeigen (war {result['analyserPeak']}) — genau der Kernnutzen von 'sample'")
        check(result["hasNodeAfterFallback"] is False, "hasNode() nach Wechsel auf node-lose Quelle sollte false sein")
        check(result["analyserAfterFallback"] is False, "AnalyserNode sollte nach Quellwechsel auf node-lose Quelle abgebaut sein")
        check(result["effectiveAfterFallback"] == "frame", f"effektive Genauigkeit sollte nach Fallback 'frame' sein, war {result['effectiveAfterFallback']}")

        # Echtes UI: Rechtsklick auf den Scope, Genauigkeit-Toggle ausgegraut bei node-loser Quelle.
        scope_el = page.locator('[data-ctrl="u:scope_0"]')
        check(scope_el.count() == 1, f"Scope-Control nicht eindeutig im DOM (count={scope_el.count()})")
        scope_el.first.scroll_into_view_if_needed()
        scope_el.first.click(button="right")
        acc_select = page.locator('.es-accuracy:visible')
        page.wait_for_timeout(100)
        disabled = acc_select.is_disabled()
        check(disabled, "Genauigkeit-Toggle sollte bei node-loser Quelle (baseFreq) ausgegraut sein")

        browser.close()
finally:
    srv.terminate()
    try:
        srv.wait(timeout=5)
    except Exception:
        srv.kill()

for e in errors:
    print("PAGEERROR:", e)
if fails:
    for f in fails:
        print("FAIL:", f)
    sys.exit(1)
print("SMOKE OK: Scope-Genauigkeit frame/sample — Fähigkeits-Check, AnalyserNode-Aufbau, kurzer Trigger-Peak sichtbar, stiller Fallback, UI-Ausgrauen.")
