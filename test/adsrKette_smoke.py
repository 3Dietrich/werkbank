#!/usr/bin/env python3
"""Headless-Selbsttest Multi-ADSR (ddw.md 20260725): komplette Kette
Gate → Env-Kurve → flush/deliver → preQuantMod → hörbare Frequenzänderung
an einer GEHALTENEN Note (retuneHeld).

Lauf: python3 test/adsrKette_smoke.py
Hart begrenzt (45s Watchdog), kein Pollen. Audio-Clock (ctx.currentTime) statt
setTimeout für die Messpunkte — Hintergrund-Drosselung spielt keine Rolle,
weil jede Messung synchron in einem evaluate läuft.
"""
import subprocess, sys, time, os, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8148
HARD_LIMIT_S = 45

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
        page.goto(f"http://localhost:{PORT}/", wait_until="domcontentloaded")
        page.wait_for_function("window.__env && window.__polysynth && window.__routing", timeout=15000)

        # ── 1) ADSR konfigurieren: A=1ms D=400ms S=aus R=400ms, Output=preQuantMod ──
        page.evaluate("""() => {
            const st = window.__polysynth.state;
            st.set('adsrAOn_0', true);  st.set('adsrA_0', 0.001);
            st.set('adsrDOn_0', true);  st.set('adsrD_0', 0.4);
            st.set('adsrSOn_0', false); st.set('adsrS_0', 0);
            st.set('adsrROn_0', true);  st.set('adsrR_0', 0.4);
            st.set('adsrPeak_0', 1);    st.set('adsrInv_0', false);
            st.set('adsrTrigMode_0', 'trig');
            st.set('adsrOutput_0', 'polysynth.preQuantMod');
        }""")

        # ── 2) Env-Modul registriert, Ziel-Port existiert ──
        mod = page.evaluate("""() => {
            const r = window.__routing.reg;
            const mods = r.modules();
            return {
                envModul: mods.filter(m => m.id.includes('env')).map(m => m.id),
                preQuant: mods.find(m => m.id === 'polysynth').inputs.filter(p => p.id === 'preQuantMod').length,
            };
        }""")
        check('polysynth.env_0' in mod['envModul'], f"Env-Modul nicht registriert: {mod}")
        check(mod['preQuant'] == 1, f"preQuantMod-Port fehlt: {mod}")

        # ── 3) Gate-Button als defs-Control vorhanden ──
        has_btn = page.evaluate("!!document.querySelector('[data-ctrl=\"b:adsrGate_0\"]')")
        check(has_btn, "Gate-Button b:adsrGate_0 fehlt (kein defs-BUTTON)")

        # ── 4) DIE KETTE: Note halten → Env triggern → Frequenz muss steigen ──
        # Alles in EINEM evaluate: noteOn, Trigger, Messpunkte über Audio-Clock.
        # ctx.currentTime läuft im Audio-Thread weiter, egal ob rAF gedrosselt ist —
        # wir warten über kurze busy-loops auf die Audio-Zeit (kein setTimeout!).
        result = page.evaluate("""() => {
            const eng = window.__polysynth.engine;
            const env = window.__env.mgr.engines[0];
            const ctx = window.__audioBus.getContext();
            eng.noteOn(60, 100);
            const f0 = eng.debugDampGain(60)?.[0]?.freq;
            // Env triggern (wie Gate-Button)
            window.__env.mgr.gateAt(0);
            const t0 = ctx.currentTime;
            const samples = [];
            // Busy-wait auf Audio-Zeit (Audio-Thread läuft unabhängig von rAF)
            const waitAudio = (sec) => { const t1 = ctx.currentTime + sec; while (ctx.currentTime < t1) {} };
            waitAudio(0.05);  // 50ms: Attack durch, Decay läuft
            window.__env.mgr.flush();  // rAF-Ersatz im Headless (rAF dort unzuverlässig)
            samples.push({ t: +(ctx.currentTime - t0).toFixed(3), env: +env.read().toFixed(3),
                           f: eng.debugDampGain(60)?.[0]?.freq });
            waitAudio(0.2);   // 250ms: Mitte Decay
            window.__env.mgr.flush();
            samples.push({ t: +(ctx.currentTime - t0).toFixed(3), env: +env.read().toFixed(3),
                           f: eng.debugDampGain(60)?.[0]?.freq });
            waitAudio(0.05);
            window.__env.mgr.flush();
            samples.push({ t: +(ctx.currentTime - t0).toFixed(3), env: +env.read().toFixed(3),
                           f: eng.debugDampGain(60)?.[0]?.freq });
            eng.allNotesOff();
            eng.setPreModValue(0);
            return { f0, samples };
        }""")

        f0 = result['f0']
        s = result['samples']
        check(f0 is not None, f"Note nicht gestartet: {result}")
        check(s[0]['env'] > 0.5, f"Env nach 50ms sollte hoch sein (Attack+Peak): {s}")
        check(s[1]['f'] > f0 * 1.1,
              f"Frequenz hat sich nicht erhöht (Modulation wirkt nicht): f0={f0} s={s}")

        # ── 5) Inv: Env invertiert → Faktor < 1 ──
        result2 = page.evaluate("""() => {
            const st = window.__polysynth.state;
            st.set('adsrInv_0', true);
            const eng = window.__polysynth.engine;
            const env = window.__env.mgr.engines[0];
            const ctx = window.__audioBus.getContext();
            eng.noteOn(60, 100);
            const f0 = eng.debugDampGain(60)?.[0]?.freq;
            window.__env.mgr.gateAt(0);
            const waitAudio = (sec) => { const t1 = ctx.currentTime + sec; while (ctx.currentTime < t1) {} };
            waitAudio(0.05);
            const envV = env.read();
            window.__env.mgr.flush();
            waitAudio(0.1);
            const f1 = eng.debugDampGain(60)?.[0]?.freq;
            eng.allNotesOff();
            eng.setPreModValue(0);
            st.set('adsrInv_0', false);
            return { f0, f1, envV };
        }""")
        check(result2['envV'] < 0, f"Inv: Env sollte negativ sein: {result2}")
        check(result2['f1'] < result2['f0'],
              f"Inv: Frequenz sollte fallen: {result2}")

        browser.close()
finally:
    srv.terminate()

for e in errors: print("PAGEERROR:", e)
if fails:
    for f in fails: print("FAIL:", f)
    sys.exit(1)
print("SMOKE: ADSR-Kette OK — Gate→Env→flush→preQuantMod→hörbare Frequenzänderung an gehaltener Note (inkl. Inv).")
