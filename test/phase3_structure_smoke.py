#!/usr/bin/env python3
"""Headless-Smoke für Phase 3 (Struktur-Ansicht, PLAN_OPERA.md/PHASE3_SPEC.md).
Lauf: python3 test/phase3_structure_smoke.py

Hart begrenzt (Watchdog killt nach 40s), kein Pollen — wie test/phase2_routing_smoke.py.
Prüft NUR die PHASE3_SPEC.md-Zusagen (3.6), nicht die ganze Werkbank-UI:

  · Header-Button „⧉ Struktur" öffnet/schließt ein .structure-pop.
  · Alle vier Module als Kästen, alle deklarierten Ports als Buchsen sichtbar.
  · Kabel-Anzahl == registry.connections().length; Takt→Rec trägt .wire--declared,
    Stepseq→Poly nicht (die reale vs. nur-deklarierte Zustellung, s. PHASE2_SPEC.md).
  · Latenz-Badges vorhanden (Zahl ODER „—").
  · reg.emit() auf Stepseq.amp löst am zugehörigen Kabel kurz .wire--pulse aus.
  · ESC schließt; erneutes Öffnen zeigt wieder alle vier Kästen (kein Leck).
"""
import subprocess, sys, time, os, signal, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8144
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
        b = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        pg = b.new_page(viewport={"width": 1400, "height": 900})
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.goto(f"http://localhost:{PORT}/", wait_until="networkidle", timeout=15000)

        # ── Öffnen über den Header-Button ──
        check(pg.locator("#structurebtn").count() == 1, "Header-Button #structurebtn fehlt")
        pg.click("#structurebtn")
        time.sleep(0.15)
        check(pg.locator(".structure-pop").count() == 1, "Struktur-Fenster öffnet nicht")

        # ── Alle vier Module als Kästen, alle Ports als Buchsen ──
        mods = pg.evaluate("() => window.__routing.reg.modules()")
        for m in mods:
            box = pg.locator(f'.structure-box[data-module="{m["id"]}"]')
            check(box.count() == 1, f"Kasten für Modul {m['id']!r} fehlt")
            for p_ in m["outputs"]:
                sel = f'.structure-port--out[data-module="{m["id"]}"][data-port="{p_["id"]}"]'
                check(pg.locator(sel).count() == 1, f"Output-Buchse {m['id']}:{p_['id']} fehlt")
            for p_ in m["inputs"]:
                sel = f'.structure-port--in[data-module="{m["id"]}"][data-port="{p_["id"]}"]'
                check(pg.locator(sel).count() == 1, f"Input-Buchse {m['id']}:{p_['id']} fehlt")

        # ── Kabel: Anzahl + aktiv/deklariert ──
        conns = pg.evaluate("() => window.__routing.reg.connections()")
        wire_count = pg.locator(".structure-pop svg.structure-wires path.wire").count()
        check(wire_count == len(conns), f"Kabel-Anzahl {wire_count} != connections() {len(conns)}")

        def wire_classes(src_mod, src_port, dst_mod, dst_port):
            el = pg.locator(f'path[data-src="{src_mod}:{src_port}"][data-dst="{dst_mod}:{dst_port}"]')
            return el.get_attribute("class") or ""

        step_poly = wire_classes("stepseq", "amp", "polysynth", "trig")
        check("wire--declared" not in step_poly, f"Stepseq→Poly fälschlich als nur-deklariert markiert: {step_poly!r}")
        check("wire--event" in step_poly, f"Stepseq→Poly sollte ein Event-Kabel sein: {step_poly!r}")

        takt_rec = wire_classes("takt", "beat", "rec", "clock")
        check("wire--declared" in takt_rec, f"Takt→Rec sollte 'nur deklariert' sein: {takt_rec!r}")

        # ── Latenz-Badges ──
        for m in mods:
            txt = pg.inner_text(f'.structure-box[data-module="{m["id"]}"] .structure-box-lat')
            check(bool(txt.strip()), f"Latenz-Badge für {m['id']} ist leer")

        # ── Live-Puls: reg.emit() auf Stepseq.amp lässt das Kabel kurz aufblitzen ──
        pg.evaluate("() => window.__routing.reg.emit({module:'stepseq', port:'amp'}, 0.8)")
        time.sleep(0.05)
        pulsed = wire_classes("stepseq", "amp", "polysynth", "trig")
        check("wire--pulse" in pulsed, f"Kein wire--pulse direkt nach reg.emit(): {pulsed!r}")
        time.sleep(0.35)
        settled = wire_classes("stepseq", "amp", "polysynth", "trig")
        check("wire--pulse" not in settled, f"wire--pulse bleibt hängen: {settled!r}")
        pg.evaluate("() => window.__polysynth.engine.allNotesOff()")

        # ── ESC schließt, kein Leck beim erneuten Öffnen ──
        pg.keyboard.press("Escape")
        time.sleep(0.1)
        check(pg.locator(".structure-pop").count() == 0, "ESC schließt das Struktur-Fenster nicht")
        pg.click("#structurebtn")
        time.sleep(0.15)
        check(pg.locator(".structure-box").count() == len(mods), "erneutes Öffnen zeigt nicht wieder alle Kästen")
        pg.click("#structurebtn")
        time.sleep(0.1)
        check(pg.locator(".structure-pop").count() == 0, "Toggle-Klick auf den Opener schließt nicht")

        b.close()
finally:
    srv.send_signal(signal.SIGINT)

if errors:
    print("JS-Fehler:", *errors, sep="\n  ")
if fails:
    print("FAILS:", *fails, sep="\n  ")
print("SMOKE:", "OK" if not errors and not fails else "FAILED")
sys.exit(1 if errors or fails else 0)
