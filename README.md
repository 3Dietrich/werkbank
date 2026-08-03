# Werkbank

**🎛 Live-Demo:** https://3dietrich.github.io/werkbank/  
**📖 Anleitung:** [docs/ANLEITUNG.md](docs/ANLEITUNG.md)  
**🗂 Eingefrorene Stände:** [Releases](https://github.com/3Dietrich/werkbank/releases)  

Modularer Synth-Baukasten im Browser — **Takt/Metronom**, **Multi-Stepsequenzer** und **Poly-Synth** als eigenständige Instrumente (ISMs), frei anordbar, per Routing-Registry verdrahtbar, mit vier Ebenen von Snapshots (Control-Combo → Gruppen-Snapshot → ISM-Snapshot → Ensemble-Snapshot). Läuft komplett clientseitig: reine ES-Module, Web Audio, localStorage — **kein Build-Schritt, kein Server, kein Tracking**.  

> Für die Arbeit an der Werkbank: **[CLAUDE.md](CLAUDE.md)** (Projekt-Kontext, Workflow,
> Test-Befehle) und **[ARCHITEKTUR.md](ARCHITEKTUR.md)** (Landkarte „UI-Bereich → Datei" +
> Nähte) sind der Einstieg – gebaut, damit man für einen Auftrag nur Karte + Zieldatei laden
> muss.

## Wofür

Ursprünglich (@dpa 2026-07-15) als **Sammlung der Bausteine aus [teslacoil](../teslacoil/)**
gedacht – Knobs/Fader, Gruppen, Settings zum Rüberkopieren. Seit 20260718 ist der Auftrag
größer: **Werkbank ist der neue, aktuelle Pool für die Module.** Was in teslacoil gefeilt und
in [taktgeber](../taktgeber/) gebaut wurde, wird hier zusammengeführt und zu eigenständigen
Instrumenten ausgebaut.

@dpa (20260721): *„Eine der Hauptaufgaben ist in Werkbank: modulare Synthesizer gebären."*
Darum ist hier alles ein Modul mit klaren Nähten – nie ad hoc dazugestellt, sondern immer als
**Control**, **Instrument (ism)** oder **DSP-Baustein** (s. [docs/CONTROLS.md](docs/CONTROLS.md)).

Der **Taktgeber** war lange „draußen" (das Netzteil neben der Werkbank) – inzwischen sind
Takt und Metronom als Instrument `lib/taktmetro/` hier eingezogen und liefern den Puls für
die anderen Module.

## Starten

Nur über einen lokalen Server (ES-Module, kein `file://`). **Port 8002:**

```bash
cd ~/Music/KI_html/werkbank && python3 -m http.server 8002 & sleep 1 && open http://localhost:8002/
```

→ <http://localhost:8002/> zeigt die Landing-Page mit der Ensemble-Auswahl (aktuell
[Overcord](overcord/) – der volle Baukasten – und [Leer](werkbank-leer/) – die
Kopiervorlage). **`Address already in use`** = der Port ist von einem früheren
Server belegt → `kill $(lsof -ti :8002)`, oder den laufenden weiterbenutzen.

## Was drin ist

**Instrumente (ism)** – je eigener State + `defs.js` + `engine.js` + Settings:

| Instrument | Ordner |
|---|---|
| Takt + Metronom (aus taktgeber) | `lib/taktmetro/` |
| Step-Sequenzer | `lib/stepseq/` |
| Poly-Synth (Voices, ADSR, Keyboard, Akkord-Speicher) | `lib/polysynth/` |
| Rec (Master-Bus-Aufnahme, Downbeat-synct) | `lib/recInstrument/` |
| LevelMeter / Out-Meter | `lib/LevelMeter.js` |
| Signal-Scopes (vervielfältigbar, Routing-Quelle wählbar) | `lib/scope/`, `lib/SignalScope.js` |
| Debug (Audio+Screenshot+Zustand-Bündel für KI-Feedback) | `lib/debugPanel/` |

**Controls & Infrastruktur** (Auswahl – vollständige Karte in [ARCHITEKTUR.md](ARCHITEKTUR.md)):

| Baustein | Datei |
|---|---|
| Gruppen, e-Mode (Anordnen), Control-Fabriken | `lib/group/GroupHost.js` |
| Knob / Fader (3 Gestalten, Länge, Farben) + Settings | `lib/Knob.js`, `lib/KnobMetaEditor.js` |
| Settings für Select/Toggle/Button/Text/Readout | `lib/ElementSettings.js` |
| Farbwähler | `lib/colorPick.js` |
| Tasten + MIDI-Learn | `lib/keymidi/` |
| State (get/set/subscribe + localStorage) | `lib/MiniState.js` |
| Presets / Snapshots | `lib/PresetManager.js` |
| Hilfe-Texte (DE/EN) | `lib/hints.js`, `lib/i18n.js` |
| Oszilloskop | `lib/Scopes.js` |

## Die Nahtstellen (das Interessante)

Was ein Baustein von außen braucht, ist genau das, was man beim Kopieren mitliefern muss –
Details im Kopf-Kommentar jeder Datei und in [ARCHITEKTUR.md](ARCHITEKTUR.md#nähte-mini-verträge--gegenseite-muss-nicht-gelesen-werden):

- **State-Vertrag:** `get(key)` / `set(key,val)` / `subscribe(fn)` – `lib/MiniState.js` zeigt
  das Minimum. Jedes Instrument bringt seinen eigenen State mit.
- **`mountGroups(root, state, defs, opts)`** baut Controls generisch aus `defs`
  (`KNOBS/SELECTS/SEGMENTS/TOGGLES/TEXTS/NOTES/BUTTONS/DEFAULTS/GROUPS`). Optik läuft über
  eigene Persistenz-Keys, nie über Sound-Werte.
- **UI ↔ Audio:** `onAction(id)` (Button → Engine) und `onApply(id, style)` (Settings →
  Control-Optik). defs/GroupHost wissen nichts von Audio, engine nichts von UI.

`MiniState.js` und `overcord/werkbank.js` sind das **Gerüst** der Werkbank, nicht ihr Inhalt –
nicht zum Rüberkopieren gedacht.

## Testen

- **Logik (Node):** `node --test lib/taktgeber/test/`
- **UI/Integration (Playwright, headless):** je Feature ein `test/<thema>_smoke.py` mit
  eigenem Watchdog (killt nach ~40 s). Einzeln: `python3 test/mainConfigPanel_smoke.py`.
  Jeder Test nennt im Docstring seinen ddw.md-Bezug.

## Stand & offene Punkte

Aufträge und offene Fäden: [ddw.md](ddw.md) (neueste Prompts unten). Erledigtes lebt im
git log (`git log --oneline`). Sanierungs-/Umbaupläne: [PLAN_OPERA.md](PLAN_OPERA.md),
[todos.md](todos.md), [UMBAU_KONFLIKTE.md](UMBAU_KONFLIKTE.md).
