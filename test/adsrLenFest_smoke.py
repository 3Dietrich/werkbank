#!/usr/bin/env python3
"""Headless-Selbsttest: ADSR 'Len: fest/offen' (ddw.md 20260726, korrigiert 20260727).

Prüft die Struktur-Klärung aus ddw.md „Logik und Funktion: Gate Länge":
  - Trig-Modus zeigt NUR die zur Len-Einheit (ms/beats) passende Len-Variante
    (adsrLenMs / adsrLenBeat), der Fest/Offen-Button bleibt versteckt (Trig ist
    per Definition immer 'fest').
  - Gate-Modus zeigt den Fest/Offen-Button; Len (ms ODER beat, je Len-Einheit)
    NUR bei fest, gar kein Len-Knob bei offen (Panel frei von inaktiven
    Elementen, @dpa: „das Panel frei räumen von inaktiven Elementen").
  - EIN Len-Konzept für BEIDE Modi (@dpa-Korrektur 20260727: „'Fest' schaltet
    noch nicht die Regler um (GateLen/*beatLen), es ist nur GateLen zu sehen" /
    „'beat' Len habe ich schon länger nicht mehr gesehen") — das alte, separate
    `adsrGateLen` (IMMER Sekunden, ignorierte Len-Einheit komplett) ist entfernt;
    Gate+fest nutzt jetzt DIESELBEN adsrLenMs/adsrLenBeat-Knobs wie Trig, inkl.
    Len-Einheit-Umschaltung — das war der eigentliche, lange nicht gefundene Bug.
  - Der Fest/Offen-Button ist ein echter DOM-Klick (nicht nur state.set), prüft
    also auch die Button↔State-Rücksynchronisierung (setCtrlOn, wie bei kbHold).
  - DSP-Ebene (envCore.js AdsrCore.trigger()): bei 'offen' plant trigger() KEIN
    Sustain-/Release-Segment voraus (Kurve endet nach Attack+Decay, Pegel hält
    von selbst), bei 'fest' schon (inkl. Len + Release).

Lauf: python3 test/adsrLenFest_smoke.py
Hart begrenzt (40s Watchdog), kein Pollen.
"""
import subprocess, sys, time, os, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8162
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
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.goto(f"http://localhost:{PORT}/", wait_until="networkidle")
        page.wait_for_timeout(500)

        vis = page.evaluate("""
            () => {
                const st = window.__polysynth.state;
                const grpEl = window.__polysynth.host.panel.querySelector('[data-group="ADSR"]');
                const v = (sel) => { const el = grpEl.querySelector(sel); return el ? getComputedStyle(el).display !== 'none' : null; };
                const out = {};

                st.set('adsrTrigMode_0', 'trig'); st.set('adsrLenUnit_0', 'ms');
                out.trig_ms = { lenMs: v('[data-ctrl="k:adsrLenMs_0"]'), lenBeat: v('[data-ctrl="k:adsrLenBeat_0"]'),
                                festBtn: v('[data-ctrl="b:adsrLenFest_0"]') };

                st.set('adsrLenUnit_0', 'beats');
                out.trig_beats = { lenMs: v('[data-ctrl="k:adsrLenMs_0"]'), lenBeat: v('[data-ctrl="k:adsrLenBeat_0"]') };

                // Gate+fest, Einheit=ms: Len-ms muss erscheinen (NICHT ein separates GateLen)
                st.set('adsrTrigMode_0', 'gate'); st.set('adsrLenFest_0', true); st.set('adsrLenUnit_0', 'ms');
                out.gate_fest_ms = { lenMs: v('[data-ctrl="k:adsrLenMs_0"]'), lenBeat: v('[data-ctrl="k:adsrLenBeat_0"]'),
                                     festBtn: v('[data-ctrl="b:adsrLenFest_0"]') };

                // Gate+fest, Einheit=beats: JETZT muss Len-BEAT erscheinen (der Kern-Bug: das
                // tat es vorher NIE im Gate-Modus, weil GateLen die Len-Einheit ignorierte).
                st.set('adsrLenUnit_0', 'beats');
                out.gate_fest_beats = { lenMs: v('[data-ctrl="k:adsrLenMs_0"]'), lenBeat: v('[data-ctrl="k:adsrLenBeat_0"]') };

                st.set('adsrLenFest_0', false);
                out.gate_offen = { lenMs: v('[data-ctrl="k:adsrLenMs_0"]'), lenBeat: v('[data-ctrl="k:adsrLenBeat_0"]'),
                                   festBtn: v('[data-ctrl="b:adsrLenFest_0"]') };

                st.set('adsrAOn_0', true); st.set('adsrDOn_0', true); st.set('adsrSOn_0', true); st.set('adsrROn_0', true);
                st.set('adsrA_0', 0.01); st.set('adsrD_0', 0.01); st.set('adsrR_0', 0.2);
                st.set('adsrLenUnit_0', 'ms'); st.set('adsrLenMs_0', 100);
                const eng = window.__env.mgr.engines[0];
                out.durationOffen = eng._core.trigger(eng._cfg(), 48000).duration;
                st.set('adsrLenFest_0', true);
                out.durationFest = eng._core.trigger(eng._cfg(), 48000).duration;

                return out;
            }
        """)

        check(vis["trig_ms"]["lenMs"] is True, "Trig+ms: Len-ms sollte sichtbar sein")
        check(vis["trig_ms"]["lenBeat"] is False, "Trig+ms: Len-Beat sollte versteckt sein")
        check(vis["trig_ms"]["festBtn"] is False, "Trig: Fest/Offen-Button sollte versteckt sein")
        check(vis["trig_beats"]["lenMs"] is False, "Trig+beats: Len-ms sollte versteckt sein")
        check(vis["trig_beats"]["lenBeat"] is True, "Trig+beats: Len-Beat sollte sichtbar sein")

        gfm = vis["gate_fest_ms"]
        check(gfm["lenMs"] is True, "Gate+fest+ms: Len-ms sollte sichtbar sein (kein separates GateLen mehr)")
        check(gfm["lenBeat"] is False, "Gate+fest+ms: Len-Beat sollte versteckt sein")
        check(gfm["festBtn"] is True, "Gate: Fest/Offen-Button sollte sichtbar sein")

        gfb = vis["gate_fest_beats"]
        check(gfb["lenBeat"] is True,
              "KERN-BUG (ddw.md 20260727): Gate+fest+beats muss Len-Beat zeigen — vorher NIE sichtbar im Gate-Modus")
        check(gfb["lenMs"] is False, "Gate+fest+beats: Len-ms sollte versteckt sein")

        go = vis["gate_offen"]
        check(go["lenMs"] is False and go["lenBeat"] is False, "Gate+offen: kein Len-Knob sichtbar")
        check(go["festBtn"] is True, "Gate+offen: Fest/Offen-Button bleibt sichtbar")

        check(vis["durationOffen"] < vis["durationFest"], "offen sollte KEIN Sustain/Release vorausplanen (kürzere Kurve als fest)")
        check(abs(vis["durationOffen"] - 0.0205) < 0.001, f"offen-Dauer unerwartet: {vis['durationOffen']}")
        # fest: outin(0.5ms) + A(10ms) + D(10ms) + Len(100ms) + R(200ms) = 320.5ms
        check(abs(vis["durationFest"] - 0.3205) < 0.001, f"fest-Dauer unerwartet: {vis['durationFest']}")

        # Echter DOM-Klick auf den Fest/Offen-Button (nicht nur state.set)
        page.evaluate("window.__polysynth.state.set('adsrLenFest_0', true)")
        page.wait_for_timeout(50)
        btn = page.locator('[data-group="ADSR"] [data-ctrl="b:adsrLenFest_0"] button')
        before = page.evaluate("window.__polysynth.state.get('adsrLenFest_0')")
        btn.click()
        page.wait_for_timeout(100)
        after = page.evaluate("window.__polysynth.state.get('adsrLenFest_0')")
        lenMsAfter = page.evaluate("""
            () => { const el = document.querySelector('[data-group="ADSR"] [data-ctrl="k:adsrLenMs_0"]');
                    return el ? getComputedStyle(el).display !== 'none' : null; }
        """)
        check(before is True and after is False, f"Klick sollte adsrLenFest_0 umschalten: before={before} after={after}")
        check(lenMsAfter is False, "Nach Klick (→ offen) sollte Len-ms sofort verschwinden")

        browser.close()
finally:
    srv.terminate()
    try:
        srv.wait(timeout=5)
    except Exception:
        srv.kill()

if errors:
    print(f"SMOKE: {len(errors)} Konsolen-/Seitenfehler:")
    for e in errors[:10]:
        print("  ", e)
    fails.append("Konsolen-/Seitenfehler aufgetreten")

if fails:
    print(f"SMOKE FAIL ({len(fails)}):")
    for f in fails:
        print("  -", f)
    sys.exit(1)

print("SMOKE OK: ADSR Len-fest/offen, vereinheitlichtes Len-Konzept (Panel-Sichtbarkeit + DSP + Button-Klick)")
