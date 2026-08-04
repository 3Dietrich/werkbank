# ARCHITEKTUR.md — Karte für gezielte Detailarbeit

> **Zweck:** Eine KI (auch ein kleines Modell) soll für einen ddw.md-Punkt NUR diese Karte
> + die 1–2 Zieldateien laden müssen — nicht das ganze Projekt. Die Modul-Köpfe (erste
> ~30 Zeilen jeder Datei) sind ausführlich; bei Unklarheit zuerst dort lesen.
> Stand: 2026-08-03 (doc-sync-Audit vor erstem GitHub-Push: Master-Bus/Limiter/WaveShaper,
> Debug-ISM, "+ Neu"/Pool-Werkzeuge, Settings-Fenster ergänzt — Rest der Tabelle weiterhin vom
> 2026-07-23-Stand, s. Hinweis am Tabellenende). Zeilenangaben sind Richtwerte, nicht exakt.
> Inventar (welche Controls/Gruppen/ISMs es aktuell gibt): [docs/BESTAND.md](docs/BESTAND.md).

## Einstiegspunkte (Pool)

Werkbank ist ein Pool mehrerer HTML-Einstiege über gemeinsame `lib/`+`css/` (@dpa 20260801) –
der Dateiname ist beliebig, keiner der Einstiege ist „der eine wahre". `/` selbst ist seit
20260802 kein Ensemble mehr, sondern eine schlanke **Landing-Page** ([index.html](index.html),
rein statisch, kein `lib/`-Verdrahten) mit Ensemble-Auswahl + ein paar Bedienungstipps für
Neulinge.

| URL | Datei | `data-app` | Daten | Inhalt |
|---|---|---|---|---|
| `/` | `index.html` | – | – | Landing-Page: Verlinkt alle Ensembles + kurze Bedien-Tipps (Space/Snapshots/e/Rechtsklick/ESC). |
| `/overcord` | `overcord/index.html` + `overcord/werkbank.js` | `werkbank` | `werkbank_*` · `presets/werkbank-config.json` | Voller Funktionsumfang: alle ISMs (Takt/Metronom, Poly-Synth, Stepsequenzer, Rec, LevelMeter, Signal-Scopes). Bis 20260802 die Wurzel-`index.html`; `data-app` blieb bewusst `werkbank`, keine Migration. |
| `/werkbank-leer` | `werkbank-leer/index.html` + `werkbank-leer/werkbank-leer.js` | `werkbank-leer` | `werkbank-leer_*` · `presets/werkbank-leer-config.json` | Neutrales Basis-Scaffold: alle Header-Funktionen + nur Takt/Metronom, Rec, LevelMeter, Signal-Scopes (kein Poly-Synth, kein Stepsequenzer). Kopiervorlage für neue Projekte. |

**Jeder Ensemble-Einstieg liegt in einem eigenen Unterordner** (@dpa dd.md 20260801_3,
seit 20260802 auch `overcord/`) – das gibt saubere URLs (`/overcord` statt `/overcord.html`)
und hält die Dateien eines Projekts beisammen. Nur die Landing-Page `index.html` bleibt im
Wurzelverzeichnis. Aus einem Unterordner zeigen `css/`+`lib/` per `../` nach oben; die
Demo-Datei löst [lib/appId.js](lib/appId.js) über `import.meta.url` auf, damit sie aus
**jeder** Ordnertiefe im einen `presets/` landet (ein relativer Pfad würde sonst still zu
`/werkbank-leer/presets/…` und der Erstbesuch bliebe ohne Demo-Stand).

> **Unterordner trennen KEINE Daten.** localStorage hängt am Origin (Schema+Host+**Port**),
> der Pfad zählt nicht mit – eine Seite in `/werkbank-leer/` sieht denselben Speicher wie
> `/`. Die Datentrennung macht allein `data-app`/`lsKey()`, s. unten.

**Neuer Einstieg per Werkzeug statt von Hand** (@dpa 20260803, ddw.md 20260803_135251):
Panel → ⚙ Einstellungen → "+ Neu" ([lib/newEntryFlow.js](lib/newEntryFlow.js)) fragt einen
Namen ab, prüft Kollisionen, zeigt einen fertigen Terminalbefehl (schon in der Zwischenablage).
Die eigentliche Kopie macht [tools/new-entry.mjs](tools/new-entry.mjs) (Node, läuft NICHT im
Browser — die Werkbank hat keinen Server, der Dateien anlegen könnte): kopiert `werkbank-leer/`
(oder mit `--source` einen bestehenden, bereits gewachsenen Einstieg — "Auslagern"-Modus,
Knopf heißt dann so statt "+ Neu"), schreibt `data-app`/Titel/Preset-Keys um, legt
Start-/Lösch-Skripte für macOS/Windows/Linux (`start.command`/`.bat`/`.sh`,
`remove.command`/`.bat`/`.sh`) + eine kurze `README.md` in den neuen Ordner, staged alles per
`git add` (NIE `git commit`). Gegenstück: [tools/remove-entry.mjs](tools/remove-entry.mjs)
(dieselbe Sperrliste aus [lib/slugify.js](lib/slugify.js), räumt Ordner + Preset-Datei + ggf.
Landing-Page-Karte/ARCHITEKTUR-Zeile aus `--publish`-Einträgen wieder auf).

**Jeder Einstieg hat seinen eigenen Datentopf** ([lib/appId.js](lib/appId.js), @dpa dd.md
20260801_2). Früher trennte der **Port** die Projekte (localStorage hängt am Origin =
Schema+Host+**Port**), darum brauchte es nie eigenen Code dafür. Seit mehrere HTMLs auf
EINEM Port liegen, fällt das weg: gleicher Port = gleicher localStorage. Deshalb setzt
jede Seite ihr `<html data-app="…">`, und `lsKey(name)` macht daraus ihre Key-Namen.

Eine **neue Kopie** (z.B. `werkbank-drone/`) braucht nur ein eigenes `data-app` — und
hat damit automatisch eigene Instrumenten-Stände **und** eine eigene Demo-Datei
`presets/<data-app>-config.json`. Keine Liste, die man dafür pflegen müsste. Der Default
ist `werkbank`, damit `overcord/index.html` (die frühere Wurzel-`index.html`) seine
bisherigen Key-Namen behält (keine Migration).
Import biegt fremde Präfixe über `toOwnKey()` auf den eigenen Einstieg um, sonst ließe
sich ein Export nur dort einlesen, wo er entstanden ist.

## Bereich → Datei

| UI-Bereich / Thema | Datei | Kern |
|---|---|---|
| Seiten-Aufbau, Demo-Verdrahtung | `overcord/werkbank.js` (769 Z.) | bewusst dünn (Demo-Bausteinschaukasten seit Phase 0.3 raus), verdrahtet nur die ISMs |
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
| Instrument-Settings (BG/Größe/Name/Breite/Höhe/Verschieben, `[?]`-Hilfe+Edit) | `lib/InstrumentSettings.js` | `mountInstrumentSettings()`, aufgerufen aus `overcord/werkbank.js` |
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
| Rec (ISM): Audio-Verdrahtung + vervielfältigbarer Manager (@dpa 20260804) | `lib/recInstrument/engine.js` (`createRecEngine`) + `lib/recInstrument/multiRec.js` (`createRecManager`) | anders als Multi-ADSR/Scope bekommt JEDE Instanz ihre EIGENE Engine (eigener Tap via `opts.getInputNode`, Default `getMaster()` = Alt-Verhalten); wählbarer Tap-Punkt ist ein PickMenu aus `routing.outputSources()`, gefiltert auf `hasNode` |
| LevelMeter (ISM): Pegelanzeige + vervielfältigbarer Manager (@dpa 20260804) | `lib/LevelMeter.js` (Klasse) + `lib/levelMeter/multiLevelMeter.js` (`createLevelMeterManager`) | wie Rec: EIGENER Analyser-Tap pro Instanz (lazy `makeAnalyserResolver()`), Instanz 0 defaultet auf `'master.out'` (Alt-Verhalten); kein `<h2>`-Header → +➚/🚮 sitzt im Gruppen-Rechtsklick-Settings (`createLevelMeterSettingsHook`), nicht im ISM-Header |
| Haupt-Styles (inkl. `:root`-Variablen) | `css/main.css` (1020 Z.) | Variablen Z. 1–25 |
| Werkbank-Rahmen-Styles | `css/werkbank.css` (114 Z.) | |
| Takt-Styles (NICHT zusätzlich zu main.css laden — Kollision, s. Memory) | `css/takt.css` (210 Z.) | |
| Alt-Original taktgeber (Referenz, nicht Ziel von Änderungen) | `lib/taktgeber/` | eigene ui.js/css bleiben ungenutzt |
| Master-Bus (Fader/Limiter/WaveShaper, gemeinsamer AudioContext) | `lib/audioBus.js` (151 Z.) | `ensureAudio()`, `setLimiterOn/Attack/Release`, `setWaveshaperOn`; Rec zapft `master` VOR dieser Kette ab |
| Eigener sample-genauer Peak-Limiter (Lookahead-Ringpuffer) | `lib/audio/limiterProcessor.js` (195 Z.) | AudioWorkletProcessor + reine `processBlock()`, node-testbar (`lib/audio/test/`) |
| Master-Lautstärke/Limiter-UI im Header | `lib/MasterVolume.js` (180 Z.) | `[Lim]`-Button + Popover (Attack/Release/WaveShaper/Optik) |
| Haupt-Settings-Fenster (⚙ „Einstellungen") | `lib/mainSettings.js` (388 Z.) | Sprache, Gruppenkopf-Optik, ISMs-Unterrubrik (ausgeblendete Standard-ISMs), Aufnahme-Format, Backups, Daten (Export/Import/Reset/+Neu) |
| Settings-Fenster-Rahmen (Overlay, Drag, ESC) | `lib/SettingsWindow.js` (340 Z.) | von mainSettings.js + Config genutzt |
| Auto-Backup, gestaffelt (2/Min · 5/Std · 1/Tag · 1/Woche) | `lib/Backup.js` (108 Z.) | UI in `lib/mainSettings.js` |
| Ensemble-weite Presets/Snapshots (Header „Snapshots") | `lib/EnsembleStore.js` (86 Z.) | eine Ebene über ISM-Snapshots |
| Debug-Instrument (ISM, Port aus teslacoil) | `lib/debugPanel/` (`DebugPanel.js` · `DebugRecorder.js` · `defs.js` · `mount.js`) | Audio+Screenshot+Zustand+Prompt-Bündel; Tap-Punkt NACH Limiter/Waveshaper (anders als Rec) |
| "+ Neu"/"Auslagern"-Panel-Trigger (neuer Pool-Einstieg) | `lib/newEntryFlow.js` (359 Z.) | ruft `tools/new-entry.mjs` NICHT selbst auf — bereitet nur Name/Befehl vor, s. „Einstiegspunkte (Pool)" oben |
| Slug-Normalisierung + Sperrliste (geteilt: Panel + Node-Skripte) | `lib/slugify.js` (50 Z.) | `slugify()`, `isReservedSlug()`, `RESERVED_SLUGS` |
| Neuen Pool-Einstieg anlegen (Node, kein Browser) | `tools/new-entry.mjs` | `--source`/`--publish`, legt Start-/Lösch-Skripte + README an |
| Pool-Einstieg wieder entfernen (Node, kein Browser) | `tools/remove-entry.mjs` | räumt Ordner+Preset+ggf. Landing-Page-Karte auf |

> Lücke (doc-sync 20260727, Rec/LevelMeter-Zeilen oben am 20260804 nachgetragen):
> `lib/stepseq/multiSq.js`, `lib/group/registry`-nahe Multi-Instanz-Bausteine sind weiterhin
> nicht in dieser Tabelle — vorbestehend seit dem 2026-07-23-Stand. Eigener doc-sync-Durchgang
> empfohlen, falls die Karte wieder vollständig sein soll.

## Settings-Hierarchie (Rechtsklick-System)

In der Werkbank gibt es keine sichtbaren ⚙-Icons. Alles wird über **Rechtsklick** auf den jeweiligen Header oder das Element gesteuert:

| Ebene | Wo (Rechtsklick) | Modul | Inhalt |
|---|---|---|---|
| **Ensemble** | Header "Config" (Linksklick) | `overcord/werkbank.js` (`cfgPanel`) | Globale Optik (Labels, Gruppen-Köpfe), Sprache, Export/Import/Reset. |
| **Instrument** (ISM) | ISM-Header (auf Name) | `lib/InstrumentSettings.js` | Name, BG-Farbe, Zoom, Position, **ISM-Snapshots** (Werte aller Gruppen), **Sichtbar**-Umschalter (ddw.md 20260803_135251, `ismHidden`) — versteckt die ganze `.wb-bench`-Sektion; ausgeblendete Standard-ISMs stehen in einer Unterrubrik von Ensemble-Settings → Config. |
| **Gruppe** | Gruppen-Header | `lib/group/GroupHost.js` | Name, BG/VG-Farbe, Breite/Höhe, **Combos** (Optik-Pool) + **Snapshots** (Werte-Pool). |
| **Control (Knob)** | Auf den Regler | `lib/KnobMetaEditor.js` | Min/Max/Step, Kurve/Skew, Default, Einheit, Gestalt (Fader/Knob), Design-Presets. |
| **Control (Rest)** | Auf das Element | `lib/ElementSettings.js` | Label-Position, Farben, Button-Modi, Design-Presets. |

## Nähte (Mini-Verträge — Gegenseite muss nicht gelesen werden)

- **`mountGroups(root, state, defs, opts)`** (GroupHost.js, Kopf-Kommentar = volle Spezifikation):
  `defs = { KNOBS, SELECTS, SEGMENTS, TOGGLES, TEXTS, NOTES, BUTTONS, DEFAULTS, GROUPS }`.
  Rückgabe `{ panel, setArranging(on), isArranging(), refresh() }`.
- **State-Vertrag:** `get(key)`, `set(key, val)`, `subscribe((key, data) => …)` — MiniState erfüllt das.
  Persistenz-Keys der Optik-Ebene: `ctrlStyles · knobMeta · ctrlPos · groupPos · groupStyles ·
  groupOrder · controlOrder · ctrlOffPanel`.
- **Panel? — wo ein Control wohnt (@dpa dd.md 20260801):** `ctrlOffPanel` (`data-ctrl-id → true`)
  nimmt ein Control vom Panel und zeigt es stattdessen als kompakte Label+Wert-Zeile am Fuß der
  Gruppen-Settings. Der Schalter sitzt in der Kopfzeile beider Control-Settings-Panels; die
  Panels selbst kennen die Bedeutung nicht, GroupHost reicht ihnen zwei Hooks rein
  (`offPanelGet(id)` / `onOffPanel(id, off)`). **Das Control bleibt gebaut und im Gruppen-DOM**
  (nur CSS-Klasse `.ctrl-offpanel`) — Combos/Snapshots sammeln über `[data-ctrl]` innerhalb der
  Gruppe, ein herausgenommenes Element fiele still aus beidem. Nicht verwechseln mit der
  Regler-Gestalt „Ohne" (`viewSize:'none'`): das ist Paneldesign, kein Umzug.
- **ISM-Sichtbarkeit (ddw.md 20260803_135251):** `lib/InstrumentSettings.js` — `ismHidden`
  lebt im ISM-EIGENEN State (wie `instrPos`/`instrBg`), nicht in `ismSnaps` (Sound-Werte).
  Dasselbe UI-Muster wie `ctrlOffPanel` bei Controls (Icon `panelIn`/`panelOut`), eine Ebene
  höher: versteckt die ganze `.wb-bench`-Sektion (`.ism-hidden`, bleibt im DOM). Rückgabe von
  `mountInstrumentSettings()`: `isHidden()`/`setHidden()`/`name()`/`openSettings()` — Letzteres
  öffnet das Panel auch ohne sichtbaren Header (LevelMeter hat nie einen, ein verstecktes ISM
  auch nicht mehr). `lib/mainSettings.js` listet ausgeblendete Standard-ISMs zum Zurückholen.
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

**Neuen Klang-Baustein bauen (z. B. „ADSR und OSZ")?** Nicht bei null anfangen und nicht
querlesen — [docs/CONTROLS.md#rezept-klang-baustein-bauen-z-b-adsr-und-osz](docs/CONTROLS.md#rezept-klang-baustein-bauen-z-b-adsr-und-osz)
listet die vorhandenen wiederverwendbaren DSP-Bausteine (Oszillator/ADSR/Pitch) und die
Pflicht-Rückfragen (Anschluss/Routing, Wellenform, mono/poly, eigenes ISM vs. Gruppe).

## Arbeitsregeln für die KI (Kurzfassung)

1. ddw.md-Punkt lesen → hier den Bereich nachschlagen → NUR Zieldatei(en) + deren
   Kopf-Kommentar laden. `overcord/werkbank.js` fast nie nötig.
2. Gestaltung: kompakt (Platz sparen), kleine Ecken-Radien, sanfte Rahmen. Nichts
   „gefixt" nennen, was @dpa noch nicht gesehen/gehört hat.
3. Ein Change pro Hördurchgang bei Klang-Themen; keine stillen Deckel/Limits.
4. Prüfen: `node --test lib/taktgeber/test/` für die Logik-Tests; UI-Änderungen
   headless per Playwright gegen `overcord/index.html` (Hard-Timeout 30–45 s, kein Pollen).
   `lib/group/_selftest.html` existiert für GroupHost.
5. Originaldateien in `lib/taktgeber/` sind Referenz-Altbestand — dort nichts ändern.
6. Neuer Teil unklarer Sorte (Control/Instrument/DSP-Baustein)? Erst nachschlagen
   (s.o.), dann bauen — nicht raten, im Zweifel @dpa fragen.
