#!/usr/bin/env python3
"""Verifikation eines frisch von tools/new-entry.mjs angelegten Pool-Einstiegs ("Neues Projekt
starten"-Auftrag, @dpa-Plan, Phase 2). 1:1 nach Vorlage test/werkbankLeerEntry_smoke.py, aber
allgemein für einen BELIEBIGEN Slug (nicht fest auf werkbank-leer verdrahtet) — new-entry.mjs
kopiert werkbank-leer/ 1:1, dieselben Regressions-Wächter gelten also für die Kopie.

Prüft (s. Auftrag Phase 2):
  1. page.goto('/<slug>/') lädt ohne Console-/Page-Errors.
  2. document.documentElement.dataset.app === '<slug>'.
  3. Object.keys(localStorage) enthält NUR '<slug>_*'-Keys, keine 'werkbank_*'/
     'werkbank-leer_*'-Reste (wichtigster Regressionswächter — Kopie exakt der entsprechenden
     Prüfung aus werkbankLeerEntry_smoke.py).
  4. Die ISM-Sektionen vorhanden/sichtbar wie in werkbank-leer (Takt/Rec/LevelMeter/Scope),
     kein Polysynth/Stepseq.
  5. Netzwerk-Sicherheitsnetz: kein Response-Status >=400 während des Ladens (fängt kaputte
     ../lib/-/../css/-/presets/-Pfade sofort ab).
  6. fetch('presets/<slug>-config.json') liefert 200, Konsole zeigt den Demo-Stand-Log aus
     lib/defaultConfig.js.

Lauf: python3 test/verify_new_entry.py <slug>
Hart begrenzt (Watchdog killt nach 40s), kein Pollen (Headless-Audio-Falle, s. CLAUDE.md —
keine Play-Buttons klicken).
"""
import subprocess, sys, time, os, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8234
HARD_LIMIT_S = 40

if len(sys.argv) < 2:
    print("Aufruf: python3 test/verify_new_entry.py <slug>")
    sys.exit(2)
SLUG = sys.argv[1]

def watchdog():
    time.sleep(HARD_LIMIT_S)
    print(f"VERIFY: HARD-TIMEOUT nach {HARD_LIMIT_S}s — abgebrochen (kein Hänger-Pollen).")
    os._exit(2)

threading.Thread(target=watchdog, daemon=True).start()

if not os.path.isdir(os.path.join(ROOT, SLUG)):
    print(f"VERIFY FAIL: Ordner '{SLUG}/' existiert nicht — erst node tools/new-entry.mjs \"<Name>\" laufen lassen.")
    sys.exit(1)

srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT)],
                       cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
errors, fails, bad_responses, console_all = [], [], [], []
check = lambda ok, msg: None if ok else fails.append(msg)

try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": 1500, "height": 1000})
        # Ein einziger Konsolen-Mitschnitt für ALLE Level: 'error' geht in `errors` (Fail-Kriterium
        # 1.), der volle Text zusätzlich in `console_all` (für den Demo-Stand-Log unten, Punkt 6 —
        # console.info() zählt nicht als 'error', braucht also einen eigenen Mitschnitt statt
        # eines zweiten, teureren Seitenaufrufs).
        pg.on("console", lambda m: (errors.append(m.text) if m.type == "error" else None, console_all.append(m.text)))
        pg.on("pageerror", lambda e: errors.append(str(e)))
        # ── 5. Netzwerk-Sicherheitsnetz: kein Response-Status >=400 ──
        pg.on("response", lambda r: bad_responses.append(f"{r.status} {r.url}") if r.status >= 400 else None)
        pg.goto(f"http://localhost:{PORT}/{SLUG}/", wait_until="networkidle", timeout=15000)

        # ── 1. Fehlerfrei geladen (s.u. am Ende, gesammelt) ──

        # ── 2. Eigener data-app ──
        check(pg.evaluate("() => document.documentElement.dataset.app") == SLUG,
              f"{SLUG}/index.html braucht <html data-app='{SLUG}'>")

        # ── 3. Eigener Datentopf, KEINE Fremd-Präfixe (wichtigster Regressionswächter) ──
        own = pg.evaluate(f"() => Object.keys(localStorage).filter(k => k.startsWith('{SLUG}_')).sort()")
        check(len(own) >= 4, f"Es sollten eigene '{SLUG}_*'-Keys angelegt sein, waren {own!r}")
        foreign = pg.evaluate("""(slug) => ['state','taktmetro','rec','levelmeter','master','ensemble','scope','debug','polysynth','stepseq']
            .flatMap(n => ['werkbank_' + n, 'werkbank-leer_' + n])
            .filter(k => !k.startsWith(slug + '_') && localStorage.getItem(k) != null)""", SLUG)
        check(foreign == [], f"{SLUG}/index.html darf keine werkbank_*/werkbank-leer_*-Keys anlegen, tat es aber: {foreign!r}")
        check(pg.evaluate("() => window.__takt.state._ls") == f"{SLUG}_taktmetro",
              "taktState sollte am eigenen lsKey hängen")

        # ── 4. ISM-Sektionen wie werkbank-leer, kein Polysynth/Stepseq ──
        for sec in ["#bench-taktgeber", "#bench-rec", "#bench-levelmeter", "#bench-scope"]:
            loc = pg.locator(sec)
            check(loc.count() == 1, f"{sec} fehlt im DOM")
            check(loc.first.is_visible(), f"{sec} ist nicht sichtbar")
        check(pg.locator("#bench-polysynth").count() == 0, "#bench-polysynth sollte NICHT existieren")
        check(pg.locator("#bench-stepseq").count() == 0, "#bench-stepseq sollte NICHT existieren")

        # ── 6. Demo-Preset erreichbar + Demo-Stand-Log aus lib/defaultConfig.js ──
        # Absoluter Pfad (Wurzel-relativ '/presets/…'), NICHT der einfache relative Pfad
        # 'presets/…': von der Seite /<slug>/ aus würde ein relativer Pfad zu
        # /<slug>/presets/… aufgelöst (die Datei liegt aber im Wurzel-presets/, s. lib/
        # appId.js configPath() — genau der Grund, warum die App selbst import.meta.url
        # statt eines relativen Strings benutzt).
        preset_status = pg.evaluate(f"""async () => {{
            const r = await fetch('/presets/{SLUG}-config.json');
            return r.status;
        }}""")
        check(preset_status == 200, f"presets/{SLUG}-config.json sollte 200 liefern, war {preset_status}")
        check(any(f"[{SLUG}] Demo-Stand geladen" in t for t in console_all),
              f"Konsole sollte den Demo-Stand-Log '[{SLUG}] Demo-Stand geladen …' zeigen (lib/defaultConfig.js), war: {console_all!r}")

        b.close()
except Exception as e:
    fails.append(f"Exception: {e}")
finally:
    srv.terminate()

# ── 1./5. gesammelte Fehler ──
errs = [e for e in errors if "favicon" not in e.lower()]
check(len(errs) == 0, f"Console-/Page-Errors: {errs}")
check(bad_responses == [], f"HTTP-Responses >=400 beim Laden: {bad_responses}")

if fails:
    print("VERIFY FAIL:")
    for f in fails:
        print(" -", f)
    sys.exit(1)
print(f"VERIFY OK: {SLUG}/ lädt fehlerfrei, eigener Datentopf, 4 ISMs vorhanden, Demo-Preset erreichbar.")
