#!/usr/bin/env python3
"""Headless-Smoke für den Gruppen-Combo-Speicher (ddw.md @dpa 20260724: "Gruppen (Combo und
Snapshot)"). Lauf: python3 test/groupCombo_smoke.py

Hart begrenzt (Watchdog killt nach 40s), kein Pollen — wie test/seqOutput_smoke.py.
Testet an einer STATISCHEN (Nicht-Klon-)Gruppe (Takt/Metronom "Takt"), wo Instanz-Suffix
und Gruppen-Art trivial sind (kind === name) — validiert die Grundmechanik, bevor der
Klon-Pool (mehrere Instanzen teilen sich einen Speicher) in multiSq.js dazukommt:
  · Rechtsklick auf die Gruppe öffnet Settings inkl. neuer "Combo"-PickMenu-Zeile.
  · saveGroupCombo() über window.__takt.host merkt sich die aktuelle Optik (ctrlStyles
    eines Controls dieser Gruppe) unter einem Namen.
  · Optik ändern, dann recallGroupCombo() → alte Optik kommt zurück (UI UND State).
  · renameGroupCombo()/deleteGroupCombo() funktionieren wie erwartet.
"""
import subprocess, sys, time, os, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8150
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
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": 1600, "height": 1100})
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.goto(f"http://localhost:{PORT}/overcord/", wait_until="networkidle", timeout=15000)

        check(pg.evaluate("() => !!window.__takt && !!window.__takt.host"), "window.__takt.host fehlt")
        has_combo_api = pg.evaluate("() => typeof window.__takt.host.saveGroupCombo === 'function'")
        check(has_combo_api, "host.saveGroupCombo fehlt")

        # ── Rechtsklick auf die Gruppe öffnet Settings inkl. Combo-PickMenu ──
        group = pg.locator('.group[data-group="Transport / Tempo"]').first
        check(group.count() == 1, f"Gruppe 'Takt' nicht gefunden, count={group.count()}")
        # Rechtsklick auf die TITELLEISTE, nicht die ganze Gruppe — ein Klick auf einen Knob/
        # ein Control würde dessen EIGENES Rechtsklick-Menü öffnen (stopPropagation).
        group.locator('.group-title-bar').click(button="right")
        gset = pg.locator('.group-settings:visible')
        check(gset.count() == 1, f"Gruppen-Settings öffnen nicht, count={gset.count()}")
        combo_pm = gset.locator('.pickmenu .pm-btn')
        check(combo_pm.count() >= 1, "Combo-PickMenu-Knopf fehlt im Gruppen-Settings-Panel")
        gset.locator('.kme-close').click()

        # ── Optik setzen (BPM-Knob-Farbe über ctrlStyles direkt, damit der Test nicht an
        #    einer bestimmten UI-Interaktion hängt), dann Combo speichern ──
        pg.evaluate("""() => {
            const s = window.__takt.state;
            const cur = { ...(s.get('ctrlStyles') || {}) };
            cur['k:bpm'] = { ...(cur['k:bpm']||{}), bg: '#112233' };
            s.set('ctrlStyles', cur);
        }""")
        saved = pg.evaluate("() => window.__takt.host.saveGroupCombo('Transport / Tempo', 'Mein Combo').length")
        check(saved == 1, f"saveGroupCombo sollte 1 Eintrag liefern, war {saved}")
        pool = pg.evaluate("() => (window.__takt.state.get('groupCombos')||{})['Transport / Tempo']")
        check(bool(pool and pool[0]['ctrlStyles']['k:bpm']['bg'] == '#112233'), f"Pool-Eintrag fehlt/falsch: {pool!r}")
        sel = pg.evaluate("() => (window.__takt.state.get('groupComboSel')||{})['Transport / Tempo']")
        check(sel == 'Mein Combo', f"groupComboSel['Takt'] sollte 'Mein Combo' sein, war {sel!r}")

        # ── Optik ändern, dann Combo zurückladen → alte Farbe kommt zurück ──
        pg.evaluate("""() => {
            const s = window.__takt.state;
            const cur = { ...(s.get('ctrlStyles') || {}) };
            cur['k:bpm'] = { ...(cur['k:bpm']||{}), bg: '#ff0000' };
            s.set('ctrlStyles', cur);
        }""")
        ok = pg.evaluate("() => window.__takt.host.recallGroupCombo('Transport / Tempo', 0)")
        check(ok is True, "recallGroupCombo sollte true liefern")
        bg_after = pg.evaluate("() => (window.__takt.state.get('ctrlStyles')||{})['k:bpm'].bg")
        check(bg_after == '#112233', f"Recall sollte die alte Farbe zurückholen, war {bg_after!r}")

        # ── Umbenennen ──
        err = pg.evaluate("() => window.__takt.host.renameGroupCombo('Transport / Tempo', 0, 'Umbenannt')")
        check(err == '', f"renameGroupCombo sollte '' (ok) liefern, war {err!r}")
        sel2 = pg.evaluate("() => (window.__takt.state.get('groupComboSel')||{})['Transport / Tempo']")
        check(sel2 == 'Umbenannt', f"Sel-Zeiger sollte dem Umbenennen folgen, war {sel2!r}")

        # ── Löschen: Pool leer, Sel-Zeiger weg ──
        pg.evaluate("() => window.__takt.host.deleteGroupCombo('Transport / Tempo', 0)")
        pool2 = pg.evaluate("() => (window.__takt.state.get('groupCombos')||{})['Transport / Tempo']")
        check(pool2 == [], f"Pool sollte leer sein, war {pool2!r}")
        sel3 = pg.evaluate("() => (window.__takt.state.get('groupComboSel')||{})['Transport / Tempo']")
        check(sel3 is None, f"Sel-Zeiger sollte nach Löschen weg sein, war {sel3!r}")

        # ── Aufräumen: ctrlStyles-Testfarbe wieder raus ──
        pg.evaluate("""() => {
            const s = window.__takt.state;
            const cur = { ...(s.get('ctrlStyles') || {}) };
            delete cur['k:bpm'];
            s.set('ctrlStyles', cur);
        }""")

        errs = [e for e in errors if "favicon" not in e.lower()]
        check(len(errs) == 0, f"Console-/Page-Errors: {errs}")

except Exception as e:
    fails.append(f"Exception: {e}")
finally:
    srv.terminate()

if fails:
    print("SMOKE FAIL:")
    for f in fails:
        print(" -", f)
    sys.exit(1)
print("SMOKE OK: Gruppen-Combo (Save/Recall/Rename/Delete) an statischer Gruppe.")
