#!/usr/bin/env python3
"""Headless-Smoke: "+ Neu"-Rebuild in werkbank-leer (@dpa ddw.md 20260803, kompletter Rebuild
nach @dpas Kritik am ersten Versuch — s. lib/newEntryFlow.js-Kopf für das volle Zitat) UND die
drei Nachbesserungen aus ddw.md 20260803_122138 ("viel besser!" + drei Punkte).

Prüft die zwei wichtigsten, ursprünglich konkret benannten Regressionen:
  1. Der kopierte Terminalbefehl referenziert das Skript über einen ABSOLUTEN Pfad (aus
     project-root.txt) — das ist der eigentliche Bugfix (@dpa reproduziert: der alte,
     relative Befehl `node tools/new-entry.mjs "…"` schlug in `~` fehl). Hier NICHT nochmal
     per echtem Terminal-cwd-Wechsel getestet (das macht der Aufrufer separat, s. Auftrag),
     sondern dass die UI überhaupt den absoluten Pfad einsetzt statt des alten relativen.
  2. Die zentrale "+ Neu"-Karte existiert NUR in werkbank-leer (nicht in overcord) und öffnet
     ein eigenes Fenster (kein natives `prompt()` mehr) mit zwei Schritten (Name → Befehl).

Zusätzlich: derselbe Ablauf ist über den kleinen "+ Neu"-Knopf im Einstellungs-Fenster
(lib/mainSettings.js, beide Einstiege) weiterhin erreichbar und öffnet DASSELBE Fenster.

Und die drei Nachbesserungen (20260803_122138):
  Punkt 1 "mittiger!": #newEntryCard überlappt KEIN `.wb-bench` (Bounding-Box-Vergleich,
     kein Screenshot-Diffing) — werkbank-leer.js `placeNewEntryCard()` platziert die Karte
     laufzeit-berechnet unterhalb aller Instrumente (die per `instrPos` frei positioniert
     sein können, s. lib/InstrumentSettings.js).
  Punkt 2 "Öffnen-Knopf": erscheint in Schritt 2 erst, NACHDEM der Zielordner wirklich
     existiert — hier per `page.route()` gemockt (kein echtes Minuten-Pollen im Test).
  Punkt 3 "Auslagern": in einem ECHTEN, für diesen Testlauf per `tools/new-entry.mjs`
     erzeugten (und danach wieder entfernten) Klon zeigt derselbe Ablauf "Auslagern" statt
     "+ Neu", KEINE zentrale Karte, und der generierte Befehl trägt `--source <Klon>`.

Und der Nachbesserungs-Rebuild aus ddw.md 20260803_135251 (der ERSTE Fix oben vermied nur
Überlappung, landete dabei aber unsichtbar am Ende des Dokumentflusses, s. ddw/image-13.png):
  Punkt 1 NEU "wirklich im sichtbaren Viewport": #newEntryCard liegt nach der Platzierung
     komplett INNERHALB von `window.innerHeight`/`innerWidth` (nicht nur überlappungsfrei
     irgendwo im Dokument) — Bounding-Box gegen `page.viewport_size` geprüft.
  Punkt 3 "Popup weg → Karte weg": solange das "Neues Projekt starten"-Fenster offen ist,
     ist #newEntryCard unsichtbar (`hidden`); nach dem Schließen wieder sichtbar UND erneut
     korrekt (innerhalb des Viewports, kein Overlap) positioniert.

Lauf: python3 test/newEntryFlow_smoke.py
Hart begrenzt (Watchdog killt nach 40s), kein Pollen.
"""
import subprocess, sys, time, os, threading, shutil
from playwright.sync_api import sync_playwright, expect

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8236
HARD_LIMIT_S = 40

def watchdog():
    time.sleep(HARD_LIMIT_S)
    print(f"SMOKE: HARD-TIMEOUT nach {HARD_LIMIT_S}s — abgebrochen (kein Hänger-Pollen).")
    os._exit(2)

threading.Thread(target=watchdog, daemon=True).start()

with open(os.path.join(ROOT, "project-root.txt"), "r", encoding="utf-8") as fh:
    EXPECTED_ROOT = fh.read().strip()

errors, fails = [], []
check = lambda ok, msg: None if ok else fails.append(msg)

# ── Punkt 3: ECHTER Testklon für den "Auslagern"-Fall (tools/new-entry.mjs --source) ──────
# CLONE_A = ein "bereits geklonter Einstieg" (Quelle: werkbank-leer, wie ein normales "+ Neu"
# es auch täte) — daran wird geprüft, dass so ein Klon "Auslagern" statt "+ Neu" zeigt.
# CLONE_B beweist den ECHTEN --source-Durchlauf: kopiert aus CLONE_A (nicht aus werkbank-leer).
# Beide werden am Ende IMMER entfernt (finally), egal ob der Test sonst durchläuft.
CLONE_A = "smoke-src-clone"
CLONE_B = "smoke-outsource-target"

def run_new_entry(name, source=None):
    args = ["node", os.path.join(ROOT, "tools", "new-entry.mjs"), name]
    if source:
        args += ["--source", source]
    return subprocess.run(args, cwd=ROOT, capture_output=True, text=True, timeout=20)

def cleanup_clone(slug):
    d = os.path.join(ROOT, slug)
    if os.path.isdir(d):
        subprocess.run(["git", "reset", "--", d], cwd=ROOT, capture_output=True)
        shutil.rmtree(d, ignore_errors=True)
    preset = os.path.join(ROOT, "presets", f"{slug}-config.json")
    if os.path.isfile(preset):
        subprocess.run(["git", "reset", "--", preset], cwd=ROOT, capture_output=True)
        os.remove(preset)

gen_a = run_new_entry(CLONE_A)
check(gen_a.returncode == 0, f"tools/new-entry.mjs {CLONE_A} fehlgeschlagen: {gen_a.stdout}\n{gen_a.stderr}")
gen_b = run_new_entry(CLONE_B, source=CLONE_A)
check(gen_b.returncode == 0, f"tools/new-entry.mjs {CLONE_B} --source {CLONE_A} fehlgeschlagen: {gen_b.stdout}\n{gen_b.stderr}")
check(f"angelegt aus {CLONE_A}/" in gen_b.stdout,
      f"--source sollte {CLONE_A}/ als Quelle nennen, stdout war: {gen_b.stdout!r}")

srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT)],
                       cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)

try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": 1400, "height": 1000})
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        pg.on("pageerror", lambda e: errors.append(str(e)))

        # ── 1. werkbank-leer: Karte existiert, prominent, korrekter Text ──
        pg.goto(f"http://localhost:{PORT}/werkbank-leer/", wait_until="networkidle", timeout=15000)
        card = pg.locator("#newEntryCard")
        check(card.count() == 1, "#newEntryCard fehlt in werkbank-leer")
        check(card.is_visible(), "#newEntryCard ist nicht sichtbar")
        check(card.locator("h2").inner_text().strip() == "+ Neu", "Karten-Überschrift sollte '+ Neu' sein")
        # Bewusst KEIN ISM: kein .wb-bench auf demselben Element, keine data-ctrl-Nähte.
        check("wb-bench" not in (card.get_attribute("class") or ""), "#newEntryCard sollte KEIN .wb-bench (ISM-Muster) sein")

        # ── 2. Klick öffnet ein eigenes Fenster (kein natives prompt() mehr) ──
        dialogs = []
        pg.on("dialog", lambda d: (dialogs.append(d.message), d.dismiss()))
        card.click()
        win = pg.locator(".ne-window:visible")
        check(win.count() == 1, "Klick auf die Karte sollte .ne-window öffnen")
        check(pg.locator(".sw-head span").first.inner_text() == "Neues Projekt starten",
              "Fenstertitel sollte 'Neues Projekt starten' sein")
        check(dialogs == [], f"Es sollte KEIN natives prompt()/alert() mehr auftauchen, kam aber: {dialogs!r}")

        # ── 3. Schritt 1 → 2: Name eingeben, Befehl prüfen ──
        name_input = win.locator("#ne-name-input")
        check(name_input.count() == 1, "#ne-name-input fehlt in Schritt 1")
        name_input.fill("Smoke Test Entry")
        win.locator("button:has-text('Weiter')").click()
        code = win.locator(".ne-code")
        # Bis zu 5s auf den asynchronen project-root.txt-Fetch warten (kein Pollen — Playwright
        # eigenes Warten auf Text-Änderung reicht, kein manuelles time.sleep-Polling).
        pg.wait_for_function(
            "() => document.querySelector('.ne-code') && document.querySelector('.ne-code').textContent.includes('new-entry.mjs')",
            timeout=5000)
        cmd = code.inner_text()
        expected = f'node "{EXPECTED_ROOT}/tools/new-entry.mjs" "Smoke Test Entry"'
        check(cmd == expected, f"Befehl sollte den ABSOLUTEN Pfad tragen: {expected!r}, war {cmd!r}")
        check(cmd.startswith('node "/'), f"Befehl sollte mit einem ABSOLUTEN Pfad beginnen (Bugfix), war {cmd!r}")
        check("Danach ist" in win.inner_text() and "git commit" in win.inner_text(),
              "Schritt 2 sollte erklären, dass die Dateien schon zu Git hinzugefügt sind (kein Commit)")

        # ── Aufräumen: Fenster schließen ──
        win.locator(".sw-close").click()
        time.sleep(0.1)
        check(pg.locator(".ne-window:visible").count() == 0, "Fenster sollte nach ✕ zu sein")

        # ── 6. Punkt 1 (ddw.md 20260803_122138, "mittiger!"): kein Overlap mit irgendeinem
        # .wb-bench. Bounding-Box-Vergleich, kein Screenshot-Diffing. `placeNewEntryCard()`
        # (werkbank-leer.js) braucht zwei requestAnimationFrame-Umläufe, bis das Layout
        # steht — auf `position:absolute` warten statt eines pauschalen sleep. ──
        pg.wait_for_function(
            "() => document.querySelector('#newEntryCard')?.style.position === 'absolute'",
            timeout=5000)

        def intersects(a, bx):
            return not (a["x"] + a["width"] <= bx["x"] or bx["x"] + bx["width"] <= a["x"]
                        or a["y"] + a["height"] <= bx["y"] or bx["y"] + bx["height"] <= a["y"])

        card_box = pg.locator("#newEntryCard").bounding_box()
        check(card_box is not None, "#newEntryCard hat keine Bounding-Box (unsichtbar?)")
        for sel in ["#bench-taktgeber", "#bench-rec", "#bench-scope", "#bench-debug"]:
            bench_box = pg.locator(sel).bounding_box()
            check(bench_box is not None, f"{sel} hat keine Bounding-Box")
            if card_box and bench_box:
                check(not intersects(card_box, bench_box),
                      f"#newEntryCard überlappt {sel}: card={card_box} bench={bench_box}")

        # ── 6b. Punkt 1 NEU (ddw.md 20260803_135251, "wirklich im sichtbaren Viewport"): die
        # Karte muss KOMPLETT innerhalb von window.innerHeight/innerWidth liegen — der erste
        # Fix (oben, 20260803_122138) prüfte nur Überlappungsfreiheit und landete dabei am
        # Ende des Dokumentflusses, weit unterhalb des sichtbaren Bereichs (ddw/image-13.png,
        # @dpa: "jetzt ist es ganz unten, versteckt"). Toleranz 1px für Sub-Pixel-Rundung. ──
        vp = pg.viewport_size
        if card_box and vp:
            check(card_box["y"] >= -1, f"#newEntryCard ragt oben aus dem Viewport: {card_box}")
            check(card_box["y"] + card_box["height"] <= vp["height"] + 1,
                  f"#newEntryCard ragt unten aus dem Viewport (Scrollen nötig): card={card_box} viewport={vp}")
            check(card_box["x"] >= -1, f"#newEntryCard ragt links aus dem Viewport: {card_box}")
            check(card_box["x"] + card_box["width"] <= vp["width"] + 1,
                  f"#newEntryCard ragt rechts aus dem Viewport: card={card_box} viewport={vp}")

        # ── 6c. Punkt 3 (ddw.md 20260803_135251, "Popup weg → Karte weg"): solange das
        # "Neues Projekt starten"-Fenster offen ist, ist die Karte unsichtbar; nach dem
        # Schließen wieder sichtbar UND erneut korrekt (Viewport, kein Overlap) platziert. ──
        pg.locator("#newEntryCard").click()
        pg.wait_for_selector(".ne-window:visible", timeout=3000)
        check(pg.locator("#newEntryCard").is_hidden(),
              "#newEntryCard sollte unsichtbar sein, solange das 'Neues Projekt starten'-Fenster offen ist")
        pg.locator(".ne-window:visible .sw-close").click()
        pg.wait_for_function(
            "() => document.querySelector('#newEntryCard') && !document.querySelector('#newEntryCard').hidden",
            timeout=3000)
        check(pg.locator("#newEntryCard").is_visible(),
              "#newEntryCard sollte nach dem Schließen des Fensters wieder sichtbar sein")
        card_box2 = pg.locator("#newEntryCard").bounding_box()
        check(card_box2 is not None, "#newEntryCard hat nach Popup-Schließen keine Bounding-Box")
        if card_box2 and vp:
            check(card_box2["y"] >= -1 and card_box2["y"] + card_box2["height"] <= vp["height"] + 1,
                  f"#newEntryCard nach Popup-Schließen nicht mehr im Viewport: card={card_box2} viewport={vp}")

        # ── 7. Punkt 2 ("Öffnen"-Knopf): erscheint erst, NACHDEM der Ordner existiert —
        # per page.route() gemockt (derselbe HEAD-Trick wie der Kollisions-Check in Schritt 1,
        # nur umgekehrte Bedingung), kein echtes Minuten-Pollen im Test. ──
        poll_slug = "smoke-openbtn-ghost"
        found = {"v": False}
        def handle_poll_route(route):
            if route.request.method == "HEAD":
                route.fulfill(status=200 if found["v"] else 404, body="")
            else:
                route.continue_()
        pg.route(f"**/{poll_slug}/index.html", handle_poll_route)

        pg.locator("#newEntryCard").click()
        win2 = pg.locator(".ne-window:visible")
        win2.locator("#ne-name-input").fill("Smoke Openbtn Ghost")
        win2.locator("button:has-text('Weiter')").click()
        pg.wait_for_function(
            "() => document.querySelector('.ne-code') && document.querySelector('.ne-code').textContent.includes('new-entry.mjs')",
            timeout=5000)
        open_btn = win2.locator("button:has-text('öffnen')")
        check(open_btn.count() == 1, "Öffnen-Knopf fehlt in Schritt 2")
        check(open_btn.is_hidden(), "Öffnen-Knopf sollte anfangs unsichtbar sein (Ordner existiert noch nicht) — kein hartes Fehlschlagen bei zu frühem Klick möglich")
        found["v"] = True   # Ordner "entsteht" jetzt (simuliert) — Poll-Intervall im Code ist 1.5s
        expect(open_btn).to_be_visible(timeout=4000)
        popups = []
        pg.on("popup", lambda p2: popups.append(p2.url))
        open_btn.click()
        pg.wait_for_timeout(200)
        check(len(popups) == 1 and f"/{poll_slug}/" in popups[0],
              f"Klick auf Öffnen sollte /{poll_slug}/ in neuem Tab öffnen, war {popups!r}")
        win2.locator(".sw-close").click()
        time.sleep(0.1)
        pg.unroute(f"**/{poll_slug}/index.html")

        # ── 4. overcord: KEINE zentrale Karte (nur der kleine Knopf in den Einstellungen) ──
        pg.goto(f"http://localhost:{PORT}/overcord/", wait_until="networkidle", timeout=15000)
        check(pg.locator("#newEntryCard").count() == 0, "#newEntryCard sollte in overcord NICHT existieren")

        # ── 5. Derselbe Ablauf über den kleinen Knopf im Einstellungs-Fenster ──
        pg.locator('#cfgmenu').click()
        pg.locator('.sw-window:visible button:has-text("+ Neu")').click()
        check(pg.locator(".ne-window:visible").count() == 1,
              "'+ Neu' im Einstellungs-Fenster sollte dasselbe .ne-window öffnen")
        check(dialogs == [], f"Auch hier kein natives prompt() mehr, kam aber: {dialogs!r}")
        pg.locator(".ne-window:visible .sw-close").click()

        # ── 8. Punkt 3 ("Auslagern"): im ECHTEN Testklon CLONE_A (erzeugt aus werkbank-leer,
        # s. Kopf) zeigt derselbe Ablauf "Auslagern" statt "+ Neu", KEINE zentrale Karte, und
        # der generierte Befehl trägt --source <CLONE_A>. Nur, wenn die Klon-Erzeugung oben
        # geklappt hat — sonst wurde das schon dort gemeldet. ──
        if gen_a.returncode == 0:
            pg.goto(f"http://localhost:{PORT}/{CLONE_A}/", wait_until="networkidle", timeout=15000)
            check(pg.locator("#newEntryCard").count() == 0,
                  f"#newEntryCard sollte im Klon {CLONE_A}/ NICHT existieren (NUR im Original werkbank-leer)")
            pg.locator('#cfgmenu').click()
            panel = pg.locator('.sw-window:visible')
            outsource_btn = panel.locator('button:has-text("Auslagern")')
            check(outsource_btn.count() == 1, f"Settings-Knopf sollte im Klon 'Auslagern' heißen, nicht '+ Neu' (Panel-Text: {panel.inner_text()[:200]!r})")
            outsource_btn.click()
            win3 = pg.locator(".ne-window:visible")
            check(win3.count() == 1, "'Auslagern' sollte dasselbe .ne-window öffnen")
            # win3.locator(...) statt pg.locator(...): das Haupt-Settings-Fenster liegt hier
            # NOCH offen darunter (beide teilen die Klasse .sw-head) — ".first" auf Seitenebene
            # träfe dessen Titel ("Einstellungen"), nicht den des ne-window.
            check(win3.locator(".sw-head span").first.inner_text() == "Als eigenes Projekt auslagern",
                  "Fenstertitel im Auslagern-Fall sollte 'Als eigenes Projekt auslagern' sein")
            win3.locator("#ne-name-input").fill("Smoke Outsourced Target 2")
            win3.locator("button:has-text('Weiter')").click()
            pg.wait_for_function(
                "() => document.querySelector('.ne-code') && document.querySelector('.ne-code').textContent.includes('new-entry.mjs')",
                timeout=5000)
            cmd3 = pg.locator(".ne-code").inner_text()
            check(f'--source "{CLONE_A}"' in cmd3,
                  f"Befehl im Auslagern-Fall sollte --source \"{CLONE_A}\" tragen, war {cmd3!r}")
            win3.locator(".sw-close").click()

        b.close()
except Exception as e:
    fails.append(f"Exception: {e}")
finally:
    srv.terminate()
    # Testklone IMMER entfernen, egal ob der Test sonst durchlief (@dpa: nichts Fremdes im
    # Repo liegen lassen). CLONE_B zuerst (falls er je auf CLONE_A verweisen würde), dann A.
    cleanup_clone(CLONE_B)
    cleanup_clone(CLONE_A)

# "Failed to load resource … 404" ist der ABSICHTLICHE Kollisions-Check (HEAD auf
# /<slug>/index.html, muss 404 liefern, damit der Name als frei gilt) — kein echter Fehler,
# Chromium loggt jede Netzwerkantwort >=400 trotzdem als 'error'-Konsolenmeldung (1:1
# dasselbe Rauschen wie der favicon-Filter in den anderen Smoke-Tests).
errs = [e for e in errors if "favicon" not in e.lower() and "404" not in e]
check(len(errs) == 0, f"Console-/Page-Errors: {errs}")

if fails:
    print("SMOKE FAIL:")
    for f in fails:
        print(" -", f)
    sys.exit(1)
print("SMOKE OK: '+ Neu'-Rebuild — zentrale Karte NUR in werkbank-leer, eigenes Fenster, absoluter Befehlspfad.")
