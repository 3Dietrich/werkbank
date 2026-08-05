# CLAUDE.md – Werkbank (Projekt-Kontext für neue Chats)

> Modularer Synth-Baukasten im Browser (Web Audio, reines ES-Modul-JS, kein Build-Step).
>
> **Kernauftrag:** Modulare Synthesizer-Module bauen – alles hier ist ein Modul mit klaren Nähten, nie ad hoc dazustellen.
>
> **Drei Einstiege:** [index.html](index.html) (Landing), [/overcord](overcord/) (voll), [/werkbank-leer](werkbank-leer/) (Basis zum Kopieren). Details: [ARCHITEKTUR.md](ARCHITEKTUR.md).
>
> **Daten:** `<html data-app="…">` → eigene localStorage-Keys + Config-Datei (s. [lib/appId.js](lib/appId.js)). Immer `lsKey('key')` nutzen, nie hart verdrahten.

## Zuerst lesen: die Karte

**[ARCHITEKTUR.md](ARCHITEKTUR.md)** – Landkarte mit „UI-Bereich → Datei", Nähte, Querschnitte, Modul-Typisierung. Immer dort einsteigen, nicht Code suchen. Die Modul-Köpfe (erste ~30 Zeilen jeder Datei) sind ausführlich.

## Arbeitsweise (wichtig)

- Markierte/selektierte ddw.md-Abschnitte sind Prompts – direkt umsetzen.
- Fazit zuerst, knapp, Deutsch. Am Anfang kurz das Modell nennen.
- **Erst klassifizieren, dann bauen:** Jeder neue Teil ist **Control**, **Instrument (ism)** oder **DSP-Baustein** (s. [docs/CONTROLS.md](docs/CONTROLS.md#die-drei-modul-sorten-der-werkbank)). Unklar? Fragen statt raten. Bestand: [docs/BESTAND.md](docs/BESTAND.md).
- **Gestaltung:** kompakt, kleine Ecken-Radien, sanfte Rahmen – CSS-Variablen in `css/main.css:2–25` vor Hard-Values prüfen.
- **Klang ist @dpas Ohr:** bei DSP ein Change pro Hördurchgang, keine Deckel auf User-Werte, nichts „gefixt" nennen, was @dpa noch nicht gehört hat.

## Starten / Testen

```bash
cd ~/Music/KI_html/werkbank && python3 -m http.server 8002 & sleep 1 && open http://localhost:8002/
```

- **Port 8002:** <http://localhost:8002/>. Details: [howto.md](howto.md).
- **Logik-Tests (Node):** `node --test lib/taktgeber/test/`
- **UI-Tests (Playwright):** [test/](test/), je `<thema>_smoke.py` mit eigenem Watchdog. Bei UI-Änderungen passenden Test grün halten.
- **GroupHost-Selbsttest:** `lib/group/_selftest.html` im Browser.
- **Headless-Audio:** Transport/Sound nie über Play-Buttons testen, nur Engine-Aufrufe / Logik.

## Architektur

Siehe [ARCHITEKTUR.md](ARCHITEKTUR.md) – State, Controls, Instrumente (ISM), DSP, Persistenz.

## Konventionen

- Kommentare erklärend (warum, nicht nur was).
- Markdown: relative Links.
- Deutsch/Englisch: s. [lib/i18n.js](lib/i18n.js). Wächter: `hintTranslation_smoke.py`, `i18nLabels_smoke.py`.
- **Git:** Pre-change-save committen, aussagekräftige Messages (was + warum), Schritt für Schritt. Git log IST die Historie.

## Offene/laufende Punkte

[ddw.md](ddw.md) (neueste Prompts), git log, [PLAN_OPERA.md](PLAN_OPERA.md), [PHASE2_SPEC.md](PHASE2_SPEC.md)/[PHASE3_SPEC.md](PHASE3_SPEC.md)/[PHASE4_SPEC.md](PHASE4_SPEC.md), [UMBAU_KONFLIKTE.md](UMBAU_KONFLIKTE.md), [todos.md](todos.md).
