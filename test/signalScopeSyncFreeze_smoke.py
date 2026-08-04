#!/usr/bin/env python3
"""Headless-Selbsttest: Signal-Scope Sync/Freeze-Buttons (ddw.md 20260727_111500, Grill-
Runde @dpa 20260804: „Signal-Scope: Sync/Freeze-Buttons").

Prüft (gezählt/programmatisch, kein echtes Hören — ScriptProcessorNode fällt laut
test/debugPanel_smoke.py NICHT unter die Headless-Audio-Falle des Projekts):
  1. Sync-/Freeze-Buttons + Trigger-Pos-/Sync-Offset-Knobs existieren als echte GroupHost-
     Controls (data-ctrl) in der Scope-Gruppe.
  2. Sync ist bei einer node-losen Quelle (kein hasNode) wirkungslos (kein stiller Absturz,
     scope.syncOn bleibt false) — analog zum hasNode-Gate von 'sample' (ddw.md 20260727).
  3. Bei einer ECHTEN AudioNode-Quelle (polysynth.env_0.out) + laufendem Takt füllt der
     Sync-Tap (ScriptProcessorNode) tatsächlich einen Ringpuffer mit echten (≠0 totalWritten)
     Samples — der Kernnachweis, dass der Tap wirklich audio-rate mitschreibt.
  4. Freeze nimmt eine Kopie: der eingefrorene Snapshot ändert sich NICHT mehr, obwohl die
     Erfassung im Hintergrund weiterläuft. Unfreeze springt zurück (scope.frozen=false).
  5. Kein pageerror während des gesamten Durchlaufs (bricht bestehende Pfade nicht).

Lauf: python3 test/signalScopeSyncFreeze_smoke.py
Hart begrenzt (40s Watchdog), kein Pollen.
"""
import subprocess, sys, time, os, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8231
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
        page.wait_for_function("window.__scope && window.__env && window.__routing && window.__takt", timeout=15000)

        # ── 1) Controls existieren ──
        ids = page.evaluate("""() => ({
            sync: !!document.querySelector('[data-ctrl=\"b:scopeSync_0\"]'),
            freeze: !!document.querySelector('[data-ctrl=\"b:scopeFreeze_0\"]'),
            triggerPos: !!document.querySelector('[data-ctrl=\"k:scopeTriggerPos_0\"]'),
            syncOffset: !!document.querySelector('[data-ctrl=\"k:scopeSyncOffset_0\"]'),
        })""")
        check(ids["sync"], "Sync-Button (b:scopeSync_0) fehlt im DOM")
        check(ids["freeze"], "Freeze-Button (b:scopeFreeze_0) fehlt im DOM")
        check(ids["triggerPos"], "Trigger-Pos-Knob (k:scopeTriggerPos_0) fehlt im DOM")
        check(ids["syncOffset"], "Sync-Offset-Knob (k:scopeSyncOffset_0) fehlt im DOM")

        # Echter Mausklick (User-Geste) — AudioContext bleibt sonst 'suspended' (Autoplay-
        # Policy), s. scopeSampleAccuracy_smoke.py-Kommentar für die Begründung.
        page.evaluate("() => { window.__env.mgr.engines[0]._audio(); }")
        page.mouse.click(5, 5)
        page.wait_for_function(
            "() => window.__env.mgr.engines[0]._audio().state === 'running'", timeout=5000)

        # ── 2) Sync bei node-loser Quelle wirkungslos ──
        r2 = page.evaluate("""() => {
            const scope = window.__scope.mgr.scopes[0];
            scope.setSource(null);
            document.querySelector('[data-ctrl=\"b:scopeSync_0\"]').click();
            return { syncOn: scope.syncOn, hasNode: scope.hasNode() };
        }""")
        check(not r2["hasNode"], f"ohne Quelle sollte hasNode()=false sein: {r2}")
        check(not r2["syncOn"], f"Sync sollte ohne echten AudioNode wirkungslos bleiben: {r2}")
        # Echter Klick (Playwright page.click, NICHT das DOM-`.click()` — GroupHosts
        # 'toggle'-Buttons hängen ihre Logik an ECHTE 'mousedown'/'mouseup'-Events, s.
        # lib/group/GroupHost.js makeButton(); ein synthetisches `.click()` feuert nur
        # 'click' und löst darum GAR NICHTS aus — @dpa-Lehre aus diesem Testlauf).
        # Button-Zustand nach dem wirkungslosen Sync-Klick zurücksetzen, falls GroupHost
        # ihn optisch trotzdem auf ON gesetzt hat (isOn ist GroupHost-intern, unabhängig
        # von scope.syncOn).
        if page.eval_on_selector('[data-ctrl="b:scopeSync_0"] button', 'el => el.classList.contains("ctrl-on")'):
            page.click('[data-ctrl="b:scopeSync_0"] button')

        # ── 3) Echte AudioNode-Quelle + Takt läuft → Tap füllt sich ──
        page.evaluate("""() => {
            const scope = window.__scope.mgr.scopes[0];
            const src = window.__routing.reg.outputSources().find(
                (s) => s.module === 'polysynth.env_0' && s.port === 'out');
            scope.setSource(src);
        }""")
        page.click('[data-ctrl="b:scopeSync_0"] button')
        r3a = page.evaluate("""() => {
            const scope = window.__scope.mgr.scopes[0];
            if (!window.__takt.engine.running()) window.__takt.engine.onAction('startCont');
            return { hasNode: scope.hasNode(), syncOn: scope.syncOn, running: window.__takt.engine.running() };
        }""")
        check(r3a["hasNode"], "polysynth.env_0.out sollte hasNode()=true liefern")
        check(r3a["syncOn"], f"Sync sollte bei echter AudioNode-Quelle angehen: {r3a}")
        check(r3a["running"], "Takt sollte jetzt laufen")

        # Echte Zeit vergehen lassen, damit der ScriptProcessorNode wirklich Callbacks bekommt
        # UND mind. ein Beat durchläuft (Tempo default ~irgendwas — 1.5s reicht bei jedem
        # praktikablen BPM-Wert für mind. einen Beat).
        time.sleep(1.5)

        r3b = page.evaluate("""() => {
            const scope = window.__scope.mgr.scopes[0];
            const ring = scope._tapRing;
            return {
                hasRing: !!ring,
                totalWritten: ring ? ring.totalWritten : 0,
                nonZero: ring ? Array.from(ring.samples).some((v) => v !== 0) : false,
                beatCount: scope._beatTimes.length,
            };
        }""")
        check(r3b["hasRing"], "Sync-Tap-Ringpuffer wurde nicht aufgebaut")
        check(r3b["totalWritten"] > 0, f"ScriptProcessorNode hat nichts geschrieben: {r3b}")
        check(r3b["beatCount"] > 0, f"kein Beat beim Scope angekommen (onClockBeat-Listener-Liste?): {r3b}")

        # ── 4) Freeze kopiert, Unfreeze springt zurück ──
        page.click('[data-ctrl="b:scopeFreeze_0"] button')
        snap1 = page.evaluate("""() => {
            const scope = window.__scope.mgr.scopes[0];
            return { frozen: scope.frozen, data: scope._frozenSnapshot ? Array.from(scope._frozenSnapshot.data).slice(0, 5) : null };
        }""")
        check(snap1["frozen"], "scope.frozen sollte nach Freeze-Klick true sein")
        time.sleep(0.3)
        snap2 = page.evaluate("""() => {
            const scope = window.__scope.mgr.scopes[0];
            return Array.from(scope._frozenSnapshot.data).slice(0, 5);
        }""")
        check(snap1["data"] == snap2, f"eingefrorener Snapshot hat sich verändert: {snap1['data']} vs {snap2}")

        page.click('[data-ctrl="b:scopeFreeze_0"] button')
        r4 = page.evaluate("() => window.__scope.mgr.scopes[0].frozen")
        check(r4 is False, f"scope.frozen sollte nach Unfreeze-Klick false sein: {r4}")

        browser.close()
except Exception as e:
    fails.append(f"Exception: {e}")
finally:
    srv.terminate()

if errors:
    fails.append(f"pageerror: {errors}")

if fails:
    print("SMOKE FAIL:")
    for f in fails:
        print(" -", f)
    sys.exit(1)
print("SMOKE OK: Signal-Scope Sync/Freeze")
