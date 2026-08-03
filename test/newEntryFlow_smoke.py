#!/usr/bin/env python3
"""Headless-Smoke: "+ Neu"-Rebuild in werkbank-leer (@dpa ddw.md 20260803, kompletter Rebuild
nach @dpas Kritik am ersten Versuch — s. lib/newEntryFlow.js-Kopf für das volle Zitat).

Prüft die zwei wichtigsten, konkret benannten Regressionen:
  1. Der kopierte Terminalbefehl referenziert das Skript über einen ABSOLUTEN Pfad (aus
     project-root.txt) — das ist der eigentliche Bugfix (@dpa reproduziert: der alte,
     relative Befehl `node tools/new-entry.mjs "…"` schlug in `~` fehl). Hier NICHT nochmal
     per echtem Terminal-cwd-Wechsel getestet (das macht der Aufrufer separat, s. Auftrag),
     sondern dass die UI überhaupt den absoluten Pfad einsetzt statt des alten relativen.
  2. Die zentrale "+ Neu"-Karte existiert NUR in werkbank-leer (nicht in overcord) und öffnet
     ein eigenes Fenster (kein natives `prompt()` mehr) mit zwei Schritten (Name → Befehl).

Zusätzlich: derselbe Ablauf ist über den kleinen "+ Neu"-Knopf im Einstellungs-Fenster
(lib/mainSettings.js, beide Einstiege) weiterhin erreichbar und öffnet DASSELBE Fenster.

Lauf: python3 test/newEntryFlow_smoke.py
Hart begrenzt (Watchdog killt nach 40s), kein Pollen.
"""
import subprocess, sys, time, os, threading
from playwright.sync_api import sync_playwright

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

srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT)],
                       cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
errors, fails = [], []
check = lambda ok, msg: None if ok else fails.append(msg)

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

        # ── 4. overcord: KEINE zentrale Karte (nur der kleine Knopf in den Einstellungen) ──
        pg.goto(f"http://localhost:{PORT}/overcord/", wait_until="networkidle", timeout=15000)
        check(pg.locator("#newEntryCard").count() == 0, "#newEntryCard sollte in overcord NICHT existieren")

        # ── 5. Derselbe Ablauf über den kleinen Knopf im Einstellungs-Fenster ──
        pg.locator('#cfgmenu').click()
        pg.locator('.sw-window:visible button:has-text("+ Neu")').click()
        check(pg.locator(".ne-window:visible").count() == 1,
              "'+ Neu' im Einstellungs-Fenster sollte dasselbe .ne-window öffnen")
        check(dialogs == [], f"Auch hier kein natives prompt() mehr, kam aber: {dialogs!r}")

        b.close()
except Exception as e:
    fails.append(f"Exception: {e}")
finally:
    srv.terminate()

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
