# CLAUDE.md – Werkbank (Projekt-Kontext für neue Chats)

> Modularer Synth-Baukasten im Browser (Web Audio, reines ES-Modul-JS, kein Build-Step).
> **Werkbank = der aktuelle Pool für die Module** (@dpa 20260718): was in [teslacoil](../teslacoil/)
> gefeilt und in [taktgeber](../taktgeber/) gebaut wurde, wächst hier zu einem eigenständigen
> Werkzeug zusammen. Sagt ein neuer Chat „bau X an der Werkbank", gilt dieser Kontext.
>
> **Kernauftrag (@dpa 20260721):** „Eine der Hauptaufgaben ist in Werkbank: modulare
> Synthesizer gebären." Alles hier ist ein Modul mit klaren Nähten – nie ad hoc dazustellen.
>
> **Mehrere HTML-Einstiege (@dpa 20260801):** `index.html` ist nur EIN Einstieg von mehreren,
> alle teilen sich `lib/`+`css/`. `werkbank-leer.html` ist die neutrale Basis (Header-Funktionen
> + Takt/Metronom/Rec/LevelMeter/Scope, kein Poly-Synth/Stepsequenzer) zum Kopieren für neue
> Projekte – Details in [ARCHITEKTUR.md](ARCHITEKTUR.md#einstiegspunkte-pool).
>
> **Jeder Einstieg hat eigene Daten (@dpa dd.md 20260801_2):** `<html data-app="…">` bestimmt
> über [lib/appId.js](lib/appId.js) die localStorage-Keys (`werkbank_*` / `werkbank-leer_*`)
> UND die Erstbesuch-Datei `presets/<data-app>-config.json`. Nie wieder Key-Namen hart in eine
> Einstiegsdatei schreiben – immer `lsKey('taktmetro')`. Eine neue Kopie braucht nur ein eigenes
> `data-app` und hat damit automatisch eigenen Stand + eigene Demo-Datei.

## Zuerst lesen: die Karte

**[ARCHITEKTUR.md](ARCHITEKTUR.md) ist die Landkarte** – gebaut, damit auch ein kleines
Modell für einen Auftrag NUR die Karte + die 1–2 Zieldateien laden muss, nicht das ganze
Projekt. Sie enthält: „UI-Bereich → Datei", die Nähte (Mini-Verträge, sodass die Gegenseite
ungelesen bleiben darf), die Querschnitte und die Modul-Typisierung. **Immer dort einsteigen,
bevor du Code suchst.** Die Modul-Köpfe (erste ~30 Zeilen jeder Datei) sind ausführlich.

## Arbeitsweise (wichtig)

- **Prompts stehen in [ddw.md](ddw.md)** – chronologisch, jeder neue Prompt beginnt mit einem
  Zeitstempel `YYYYMMDD_HHMMSS`. Gibt @dpa keinen an, **setze die aktuelle lokale Zeit**
  (`date +%Y%m%d_%H%M%S`) an den Prompt-Anfang. Ältere Prompts haben keinen Stempel.
- **Markierte ddw.md-Abschnitte sind Aufträge, keine Vorschläge** – direkt umsetzen, nie
  „soll ich das überhaupt?" fragen. Alle Punkte eines Prompts komplett durchziehen, keine
  prozeduralen „soll ich weitermachen?"-Zwischenfragen. Inhaltliche Rückfragen nur, wenn @dpa
  ausdrücklich danach fragt.
- **Fazit zuerst, knapp, Deutsch.** Am Anfang kurz das Modell nennen.
- **Erst klassifizieren, dann bauen:** Jeder neue Teil ist **Control**, **Instrument (ism)**
  oder **DSP-Baustein** (Tabelle in [docs/CONTROLS.md](docs/CONTROLS.md#die-drei-modul-sorten-der-werkbank)).
  Unklar? **Fragen statt raten** – ausdrücklich gewünscht (@dpa 20260721). Was aktuell schon
  existiert (Controls/Gruppen/ISMs im Überblick): [docs/BESTAND.md](docs/BESTAND.md).
- **Gestaltung:** kompakt (Platz sparen), kleine Ecken-Radien, sanfte/kontrastarme Rahmen
  (Vorbild Settings-Fenster) – erst die CSS-Variable in `css/main.css:2–25` prüfen, bevor
  irgendwo ein harter Wert gesetzt wird.
- **Klang ist @dpas Ohr:** bei DSP/Sound EIN Change pro Hördurchgang, keine stillen Deckel
  oder Klemmungen auf User-Werte, und nichts „gefixt" nennen, was @dpa noch nicht gehört hat.

## Starten / Testen

- Läuft nur über einen lokalen Server (ES-Module, kein `file://`). **Port 8002:**
  ```bash
  cd ~/Music/KI_html/werkbank && python3 -m http.server 8002 & sleep 1 && open http://localhost:8002/
  ```
  → <http://localhost:8002/>. Details: [howto.md](howto.md).
  **`Address already in use`** = auf dem Port läuft schon ein Server → `kill $(lsof -ti :8002)`,
  oder den laufenden weiterbenutzen (`lsof -i :8002` zeigt, wer draufsitzt).
- **Logik-Tests (headless, Node):** `node --test lib/taktgeber/test/` für die reine
  Takt-/Metronom-Logik.
- **UI/Integration (Playwright, headless):** die Smoke-Tests liegen einzeln in
  [test/](test/), je Feature einer (`test/<thema>_smoke.py`), jeder mit **eigenem Watchdog,
  der nach ~40 s hart killt** (kein Pollen). Einzeln laufen lassen:
  `python3 test/mainConfigPanel_smoke.py`. Jeder Test nennt im Kopf-Docstring seinen
  ddw.md-Bezug und was er festnagelt. Bei UI-Änderungen den passenden Test grün halten bzw.
  einen neuen `_smoke.py` nach demselben Muster ergänzen – **nicht** nur `node --check`.
- **GroupHost-Selbsttest:** `lib/group/_selftest.html` im Browser.
- **Headless-Audio-Falle:** Web-Audio-Module lösen headless oft nicht auf – Transport/Sound
  nie über Play-Buttons prüfen, sondern über gezählte Engine-Aufrufe bzw. reine Logik.

## Architektur in einem Absatz

- **State = Single Source of Truth** ([lib/MiniState.js](lib/MiniState.js), 50 Z.):
  Minimal-Vertrag `get(key)` / `set(key,val)` / `subscribe(fn)` + localStorage. Jedes
  Instrument bringt seinen eigenen State mit.
- **Controls entstehen generisch aus `defs`** über `mountGroups(root, state, defs, opts)`
  ([lib/group/GroupHost.js](lib/group/GroupHost.js)) – der Kopf-Kommentar dort IST die
  volle Spezifikation. `defs = { KNOBS, SELECTS, SEGMENTS, TOGGLES, TEXTS, NOTES, BUTTONS,
  DEFAULTS, GROUPS }`. Optik läuft über eigene Persistenz-Keys (`ctrlStyles`, `knobMeta`,
  `ctrlPos`, `groupPos`, `groupStyles`, `groupOrder`, `controlOrder`), nie über Sound-Werte.
- **Instrumente (ism)** haben je `defs.js` + `engine.js` + eigene `.wb-bench`-Sektion +
  eigene `InstrumentSettings.js`-Instanz. Beispiele: `lib/taktmetro/`, `lib/stepseq/`,
  `lib/polysynth/`. UI (defs/GroupHost) und Audio (engine) wissen nichts voneinander –
  die Naht ist `onAction(id)` / `onApply(id, style)`.
- **DSP-Bausteine** sind reine Audio-Mathematik in `audio/`/`dsp/`, kein UI, 1:1 kopierbar.
- **Persistenz ist geschachtelt:** Control → Gruppen-Snapshot → ISM → Config. Features hängen
  sich in diese Kette ein, statt eigene Persistenz zu erfinden.

## Konventionen

- **Kommentare beibehalten/erklärend** (das @dpa-Prinzip: warum, nicht nur was).
- Markdown: **relative Links**, keine `file:///`.
- **Deutsch/Englisch** ([lib/i18n.js](lib/i18n.js) + [lib/hints.js](lib/hints.js)): der
  deutsche Text IST der Schlüssel; Hints als EIN Literal schreiben (zusammengesetzte
  `'a '+'b'` verlieren still ihre Übersetzung); selbst benannte Labels gehen nie durch i18n.
  Neuer Control ⇒ Hint-Eintrag + EN-Entsprechung nicht vergessen (`hintTranslation_smoke.py`
  / `i18nLabels_smoke.py` sind die Wächter).
- **Git:** Werkbank ist ein **eigenes Repo** (kein Remote) direkt in diesem Ordner. Vor
  Änderungen `git status`; pre-change-save committen; aussagekräftige Messages (was + warum),
  Schritt für Schritt. Der git log IST die Historie des Erledigten. Commit-Message endet mit
  der Co-Authored-By-Zeile.
- **Referenz-Altbestand `lib/taktgeber/`** ist Original zum Nachschlagen – dort nichts ändern.

## Offene/laufende Punkte

Siehe die neuesten Prompts in [ddw.md](ddw.md) (Erledigtes bleibt als Historie stehen) und
den git log (`git log --oneline`). Größere Sanierungs-/Umbaupläne: [PLAN_OPERA.md](PLAN_OPERA.md),
Phasen-Specs [PHASE2_SPEC.md](PHASE2_SPEC.md)/[PHASE3_SPEC.md](PHASE3_SPEC.md)/[PHASE4_SPEC.md](PHASE4_SPEC.md),
Konflikt-Entscheidungen [UMBAU_KONFLIKTE.md](UMBAU_KONFLIKTE.md), offene To-dos [todos.md](todos.md).
