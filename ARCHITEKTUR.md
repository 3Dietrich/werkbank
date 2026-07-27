# ARCHITEKTUR.md — Karte für gezielte Detailarbeit

> **Zweck:** Eine KI (auch ein kleines Modell) soll für einen ddw.md-Punkt NUR diese Karte
> + die 1–2 Zieldateien laden müssen — nicht das ganze Projekt. Die Modul-Köpfe (erste
> ~30 Zeilen jeder Datei) sind ausführlich; bei Unklarheit zuerst dort lesen.
> Stand: 2026-07-27 (Routing/Scope-Zeilen ergänzt — Rest der Tabelle weiterhin vom 2026-07-23-
> Stand, s. Hinweis am Tabellenende). Zeilenangaben sind Richtwerte, nicht exakt.

## Bereich → Datei

| UI-Bereich / Thema | Datei | Kern |
|---|---|---|
| Seiten-Aufbau, Demo-Verdrahtung | `werkbank.js` (769 Z.) | bewusst dünn (Demo-Bausteinschaukasten seit Phase 0.3 raus), verdrahtet nur die ISMs |
| Gruppen, e-Mode (Anordnen), Control-Fabriken | `lib/group/GroupHost.js` (1055 Z.) | `mountGroups()`, Port aus teslacoil |
| Knob/Fader-Control selbst (Zeichnung, Drag) | `lib/Knob.js` (707 Z.) | SVG-Knob, Kurven, Gestalten |
| Knob-Settings-Panel (Gestalt/Größe/Farbe/Range) | `lib/KnobMetaEditor.js` (505 Z.) | Rechtsklick auf Knob |
| Settings-Panel aller Nicht-Knob-Controls (button/select/toggle/text/note/readout/scope/…) | `lib/ElementSettings.js` | Rechtsklick; rein Optik, nie Werte; Typ-Feldliste in `_fieldsFor()` |
| Farbwähler (Mischfeld, Regenbogen, RGB/Hex) | `lib/colorPick.js` (175 Z.) | `upgradeColorInputs()` |
| Tasten + MIDI-Learn (Header-Overlay, Badges) | `lib/keymidi/KeyMidi.js` (315 Z.) | Overlay-Modus `.keyedit` |
| MIDI-Verteiler (Web-MIDI) | `lib/keymidi/Midi.js` (92 Z.) | generisch, Ch-Lernen |
| Takt/Metronom: Control-Definitionen | `lib/taktmetro/defs.js` (119 Z.) | deklarative `defs` für mountGroups |
| Takt/Metronom: Audio-Verdrahtung | `lib/taktmetro/engine.js` (129 Z.) | `onAction(id)`, `ensureAudio()` |
| Metronom-Klang (DSP) | `lib/taktmetro/audio/` (metro, clock, tapTempo, dsp/) | 1:1 aus taktgeber |
| Stepsequenzer (eigenes ISM) | `lib/stepseq/` (`defs.js` · `engine.js` · `seqCore.js` · `ui/StepSeqGrid.js`) | `createStepSeqEngine(state, ...)`; `seqCore.js` = reine Logik, aus alter `lib/stepSeq.js` gezogen (Phase 0.2) |
| Presets / Snapshots | `lib/PresetManager.js` (414 Z.) | inkl. Namensregel `renameIn` |
| Dropdown-Menüs | `lib/PickMenu.js` (218 Z.) | |
| Hilfe-Texte (Hints, editierbar) | `lib/hints.js` (412 Z.) + `lib/i18n.js` (273 Z.) | `factoryHint()`, `hint()`, DE/EN |
| Icons | `lib/icons.js` (103 Z.) | `icon(name)`, `ICON_NAMES` |
| State (get/set/subscribe + localStorage) | `lib/MiniState.js` (50 Z.) | Minimal-Vertrag, s. Nähte |
| Kompakte Gruppen-Settings | `lib/MiniSettings.js` (136 Z.) | |
| Instrument-Settings (BG/Größe/Name/Breite/Höhe/Verschieben, `[?]`-Hilfe+Edit) | `lib/InstrumentSettings.js` | `mountInstrumentSettings()`, aufgerufen aus `werkbank.js` |
| Mini-Markdown (Instrument-Hilfe editierbar) | `lib/miniMarkdown.js` | `mdToHtml()`, `htmlToMdApprox()` |
| Panels verschiebbar machen | `lib/dragPanel.js` (40 Z.) | `makeDraggable()` |
| Tastatur-Routing (wann greifen globale Keys) | `lib/keyRoute.js` (53 Z.) | `globalKeyOk`, `arrowKeyOk` |
| Datei-Export/-Import | `lib/fileIO.js` (64 Z.) | |
| SELECT-Options-Notation (`label [a,b]~`) | `lib/optionNotation.js` (56 Z.) | |
| Farb-Hilfsfunktionen | `lib/rgba.js` (31 Z.) | `parseHex`, `hexA` |
| Oszilloskop (großes, Master-Bus-gespeist) | `lib/Scopes.js` (275 Z.) | eigener `AnalyserNode` am `engine.master`, Vorbild fürs Signal-Scope-„sample" unten |
| Routing-Registry (Modul↔Modul-Verdrahtung: `emit`/`flush`/`deliver`) | `lib/routing/Registry.js` | `registerModule()`, `outputSources()`/`inputTargets()`; Output-Ports optional mit `node`/`hasNode` (s. Nähte unten) |
| Routing-Struktur-Ansicht | `lib/routing/StructureView.js` | zeigt `connections`, Live-Aktivität via `onActivity()` |
| Poly-Synth (ISM): Control-Definitionen + Audio-Verdrahtung | `lib/polysynth/defs.js` · `lib/polysynth/engine.js` | Keyboard, Base-Frq, Chord-Memory |
| Multi-ADSR (vervielfältigbare Envelopes, Multi-Sq-Muster) | `lib/polysynth/multiEnv.js` | `EnvEngine` (ConstantSourceNode-basiert) + `createEnvManager()`; einziger aktueller `hasNode`-Output (s. Nähte) |
| Signal-Scope (schmales Steuersignal-Meter zum Reinklinken, frame/sample) | `lib/SignalScope.js` + `lib/scope/multiScope.js` | reine Anzeige, kein Routing-Modul; `accuracy:'sample'` hängt sich mit `AnalyserNode` audio-rate an Quellen mit `hasNode` |
| Haupt-Styles (inkl. `:root`-Variablen) | `css/main.css` (1020 Z.) | Variablen Z. 1–25 |
| Werkbank-Rahmen-Styles | `css/werkbank.css` (114 Z.) | |
| Takt-Styles (NICHT zusätzlich zu main.css laden — Kollision, s. Memory) | `css/takt.css` (210 Z.) | |
| Alt-Original taktgeber (Referenz, nicht Ziel von Änderungen) | `lib/taktgeber/` | eigene ui.js/css bleiben ungenutzt |

> Lücke (doc-sync 20260727): `lib/stepseq/multiSq.js`, `lib/recInstrument/`, `lib/group/registry`-
> nahe Multi-Instanz-Bausteine sind ebenfalls noch nicht in dieser Tabelle — vorbestehend seit
> dem 2026-07-23-Stand, nicht Teil der heutigen Änderung. Eigener doc-sync-Durchgang empfohlen,
> falls die Karte wieder vollständig sein soll.

## Settings-Hierarchie (Rechtsklick-System)

In der Werkbank gibt es keine sichtbaren ⚙-Icons. Alles wird über **Rechtsklick** auf den jeweiligen Header oder das Element gesteuert:

| Ebene | Wo (Rechtsklick) | Modul | Inhalt |
|---|---|---|---|
| **Ensemble** | Header "Config" (Linksklick) | `werkbank.js` (`cfgPanel`) | Globale Optik (Labels, Gruppen-Köpfe), Sprache, Export/Import/Reset. |
| **Instrument** (ISM) | ISM-Header (auf Name) | `lib/InstrumentSettings.js` | Name, BG-Farbe, Zoom, Position, **ISM-Snapshots** (Werte aller Gruppen). |
| **Gruppe** | Gruppen-Header | `lib/group/GroupHost.js` | Name, BG/VG-Farbe, Breite/Höhe, **Combos** (Optik-Pool) + **Snapshots** (Werte-Pool). |
| **Control (Knob)** | Auf den Regler | `lib/KnobMetaEditor.js` | Min/Max/Step, Kurve/Skew, Default, Einheit, Gestalt (Fader/Knob), Design-Presets. |
| **Control (Rest)** | Auf das Element | `lib/ElementSettings.js` | Label-Position, Farben, Button-Modi, Design-Presets. |

## Nähte (Mini-Verträge — Gegenseite muss nicht gelesen werden)

- **`mountGroups(root, state, defs, opts)`** (GroupHost.js, Kopf-Kommentar = volle Spezifikation):
  `defs = { KNOBS, SELECTS, SEGMENTS, TOGGLES, TEXTS, NOTES, BUTTONS, DEFAULTS, GROUPS }`.
  Rückgabe `{ panel, setArranging(on), isArranging(), refresh() }`.
- **State-Vertrag:** `get(key)`, `set(key, val)`, `subscribe((key, data) => …)` — MiniState erfüllt das.
  Persistenz-Keys der Optik-Ebene: `ctrlStyles · knobMeta · ctrlPos · groupPos · groupStyles ·
  groupOrder · controlOrder`.
- **Settings-Panels → Control:** `onApply(id, style)` schreibt `state.ctrlStyles[id]`; die
  DOM-Anwendung macht der Aufrufer (`target.applyStyle`). Settings verstellen NIE Control-Werte.
- **Buttons → Audio:** `onAction(id)` mit den Button-ids aus defs (`start/bang/bang2/slow/fast/
  tap/tapReset`). defs/GroupHost wissen nichts von Audio; engine.js nichts von UI.
- **KeyMidi:** `new KeyMidi(state, { panel, midi, keyOk })`; Controls per
  `register(id, el, label, activate)`. State-Keys: `keyBindings` (id→`e.key`),
  `midiBindings` (id→`{type,data1,ch}`).
- **Output-Port → echter AudioNode (optional, ddw.md 20260727):** ein Output-Port in
  `Registry.js` kann zusätzlich zu `read()` ein `hasNode:true` + lazy `node: () => AudioNode`
  tragen — additiv, die meisten Value-Outputs (reine JS-Zahlen) lassen es einfach weg.
  `hasNode` ist ein billiger, seiteneffektfreier Fähigkeits-Check (UI-Ausgrauen); `node()`
  erzeugt den echten Node erst bei Bedarf. Einziger aktueller Anbieter: `multiEnv.js`
  (`EnvEngine` → `ConstantSourceNode`). Konsument: `SignalScope.js`s `accuracy:'sample'`
  (echter `AnalyserNode`-Tap statt Frame-Polling).

## Querschnitte (brauchen mehr als eine Datei)

- **e-Mode-Selektion** (auch: Selektion über Moduswechsel erhalten, Shift+Click):
  `GroupHost.js` ~Z. 543–620 (`selected`-Set, `clearSelection`, `wireArrange`).
  Beteiligt: CSS-Klasse `arrange-selected` in `css/main.css`.
- **Rahmen/Hover/Selektion-Optik:** zentrale Variablen in `css/main.css:2–25`
  (`--sel-line`, `--sel-bg`, `--sel2-*`, `--line`, `--accent`). Regel: **sanfte,
  kontrastarme Rahmen** (Vorbild Settings-Fenster), kleine Radien — erst Variable prüfen,
  bevor irgendwo ein harter Wert gesetzt wird.
- **Tastatur:** globale Keys laufen durch `keyRoute.js` (tippt der User gerade Text?),
  Belegungen durch `KeyMidi`. Beide anfassen, wenn sich „wer kriegt den Tastendruck" ändert.
- **Hilfe/Hints:** Text in `hints.js` (Factory) + `i18n.js` (DE/EN); UI-seitig zeigen
  die Panels sie selbst an. Neuer Control ⇒ Hint-Eintrag nicht vergessen.

## Welche Modul-Sorte ist ein neuer Teil? (@dpa 20260721_203557, Kern-Regel)

„Bitte nichts mehr einfach so dazustellen. Wenn Du nicht weißt, ob Control oder ism, oder…
frag mich. Aber alles hat hier seine Module." Hauptsatz fürs ganze Projekt: „Eine der
Hauptaufgaben ist in Werkbank: modulare Synthesizer gebären." Vor jedem neuen Teil zuerst
klassifizieren — Details + Tabelle in [docs/CONTROLS.md](docs/CONTROLS.md#die-drei-modul-sorten-der-werkbank):

- **Control** — generisch, entsteht aus `defs` (KNOBS/SELECTS/…/DISPLAYS), Rechtsklick-Settings
  via `registerCtrlStyle()`. Auch freistehende Widgets mit eigenem `mount()` zählen hierher,
  wenn sie wie ein Bedienelement benutzt werden (Beispiel: `u:playKb`-Keyboard-Control).
- **Instrument** (ism) — eigener State + `defs.js` + `engine.js` + eigene `.wb-bench`-Sektion +
  eigene `InstrumentSettings.js`-Instanz. Beispiele: `lib/taktmetro/`, `lib/polysynth/`,
  `lib/recInstrument/`.
- **DSP-Baustein** — reine Audio-Mathematik in `audio/`/`dsp/`, kein UI, 1:1 kopierbar.

Unklar? Fragen statt raten — das ist ausdrücklich gewünscht, nicht optional.

## Arbeitsregeln für die KI (Kurzfassung)

1. ddw.md-Punkt lesen → hier den Bereich nachschlagen → NUR Zieldatei(en) + deren
   Kopf-Kommentar laden. `werkbank.js` fast nie nötig.
2. Gestaltung: kompakt (Platz sparen), kleine Ecken-Radien, sanfte Rahmen. Nichts
   „gefixt" nennen, was @dpa noch nicht gesehen/gehört hat.
3. Ein Change pro Hördurchgang bei Klang-Themen; keine stillen Deckel/Limits.
4. Prüfen: `node --test lib/taktgeber/test/` für die Logik-Tests; UI-Änderungen
   headless per Playwright gegen `index.html` (Hard-Timeout 30–45 s, kein Pollen).
   `lib/group/_selftest.html` existiert für GroupHost.
5. Originaldateien in `lib/taktgeber/` sind Referenz-Altbestand — dort nichts ändern.
6. Neuer Teil unklarer Sorte (Control/Instrument/DSP-Baustein)? Erst nachschlagen
   (s.o.), dann bauen — nicht raten, im Zweifel @dpa fragen.
