# Die Control-Sorten der Werkbank

> Schwester zu [teslacoils CONTROLS.md](../../teslacoil/docs/CONTROLS.md). Die Werkbank
> ist eine Sammlung wiederverwendbarer Bausteine zum Rüberkopieren; die Controls entstehen
> **generisch** aus einer deklarativen `defs`-Quelle (`mountGroups(root, state, defs, opts)`
> in [GroupHost.js](../lib/group/GroupHost.js)). Wer die Architektur-Karte braucht:
> [ARCHITEKTUR.md](../ARCHITEKTUR.md).

## Die drei Modul-Sorten der Werkbank

Kern-Regel (@dpa 20260721_203557, gilt ab jetzt für ALLES in der Werkbank): „Bitte nichts
mehr einfach so dazustellen. Wenn Du nicht weißt, ob Control oder ism, oder… frag mich. Aber
alles hat hier seine Module." Hauptsatz fürs ganze Projekt: „Eine der Hauptaufgaben ist in
Werkbank: modulare Synthesizer gebären." Bevor ein neues Teil entsteht, MUSS es einer dieser
drei Sorten zugeordnet sein — geraten wird nicht, nachgeschlagen:

| Sorte | Was | Beispiel | Erkennungsmerkmal |
|---|---|---|---|
| **Control** | generisches Bedienelement, entsteht deklarativ aus `defs` (`KNOBS`/`SELECTS`/…), Rechtsklick öffnet seine Settings via `registerCtrlStyle()` | `k:bpm`, `t:kbHold`, `u:playKb` | Trägt ein `data-ctrl`-Präfix (s. Tabelle unten), hat KEINEN eigenen State/keine eigene Engine — sein Wert lebt in EINEM `defs.DEFAULTS`-Key des Instruments, das es mountet |
| **Instrument** (von @dpa „ism" abgekürzt) | eigenständiger Baustein mit eigenem State + `defs.js` + `engine.js` + eigenem `mountGroups()`-Mount, eigene `.wb-bench`-Sektion in `index.html`, eigene `InstrumentSettings.js`-Instanz | `lib/taktmetro/`, `lib/polysynth/`, `lib/recInstrument/`, `lib/stepseq/`, `lib/debugPanel/` | Hat eine eigene `MiniState` (eigener localStorage-Key), erscheint als eigener Menüpunkt/eigene Sektion, NICHT nur eine Gruppe innerhalb eines anderen Instruments |
| **DSP-Baustein** | reine Audio-Mathematik, kein eigenes UI, 1:1 kopierbar zwischen Instrumenten | `lib/polysynth/audio/pulseWave.js`, `lib/polysynth/dsp/holdSlide.js` | Liegt in einem `audio/`- oder `dsp/`-Unterordner, exportiert reine Funktionen/Klassen ohne DOM-Berührung, kennt weder State noch GroupHost |

Freistehende Widgets, die wie ein Instrument AUSSEHEN (eigenes `mount(parent)`, eigener
State-Zugriff) aber wie ein Control BEDIENT werden sollen (Rechtsklick-Settings, Platz in
einer GroupHost-Gruppe, Tasten-/MIDI-Overlay) — z.B. ein Keyboard-Widget — sind **Controls**,
kein Instrument: sie bekommen ein `u:`-Präfix und werden per `registerCtrlStyle()` in eine
Gruppe eingehängt, s. `lib/polysynth/ui/PlayKeyboard.js` (Poly-Synth-Nacharbeiten,
@dpa 20260721_203557 — Auslöser für diese Kern-Regel: das Keyboard stand vorher als lose
DOM-Geschwister neben dem Panel, ohne Settings).

### ISM-Namenskonvention (verbindlich)

Ein Instrument (ism) MUSS diese Naht einhalten – **keine Klassen-Sonderform**:

- Dateiname **muss** `engine.js` heißen (nicht `XEngine.js`, nicht `Engine.js`).
- Export **muss** eine Factory-Funktion `createXEngine(state, ...)` sein (kein `new XEngine()`).

**Hintergrund:** `lib/stepseq/` brach bis Phase 0.1 mit `StepSeqEngine.js`
(`new StepSeqEngine`) aus dieser Konvention aus – das war der Auslöser für die Sanierung
in [PLAN_OPERA.md](../PLAN_OPERA.md). Seitdem ist `lib/stepseq/engine.js` mit
`createStepSeqEngine(state, opts)` die gleiche Naht wie taktmetro/polysynth/recInstrument.

#### Neues-ISM-Checkliste

Beim Anlegen eines neuen Instruments müssen alle sechs Punkte stehen, bevor es als „fertig"
gilt:

1. **`defs.js`** – deklarative `DEFAULTS`/`GROUPS`/`KNOBS`/… -Quelle (s. Control-Sorten oben).
2. **`engine.js`** mit Factory `createXEngine(state, ...)` – keine Klasse, kein anderer Dateiname.
3. **Eigener `MiniState` + eigener `localStorage`-Key** – isolierte Naht, kein Mitbenutzen
   des `state` einer anderen Instanz.
4. **Eigene `.wb-bench`-Sektion** in `index.html` (eigene `id`, eigener Mount-Punkt).
5. **Eigene `InstrumentSettings.js`-Instanz** (`mountInstrumentSettings(...)`).
6. **Reine Logik in einem eigenen `*core.js`** statt Fremd-Import aus einem anderen
   Instrument/Altbestand (s. `lib/stepseq/seqCore.js` als Muster – Phase 0.2 zog die
   gebrauchten Helfer aus der alten `lib/stepSeq.js` genau dorthin).
7. **`ports` in `defs.js` (optional)** – hat das Instrument sinnvolle Aus-/Eingänge fürs
   Routing (Phase 2, [PLAN_OPERA.md](../PLAN_OPERA.md)), deklariert es sie dort als reine
   Metadaten (`{ outputs:[{id,label,type}], inputs:[...] }`), s. [lib/routing/types.js](../lib/routing/types.js)
   für die Typ-Tabelle. **`latency()`** in `engine.js` (optional, ms, aus
   [lib/routing/latency.js](../lib/routing/latency.js)`busLatencyMs()` + eigenem
   Puffer/Offset) ist der zugehörige Latenz-Vertrag. Fehlen beide, ist das ISM „ohne
   Anschlüsse" – kein Fehler, kein Bruch dieser Checkliste für Alt-ISMs.

Architektur-weiter Einstieg für „welcher Bereich, welche Datei": [ARCHITEKTUR.md](../ARCHITEKTUR.md).
Routing-Nähte (Ports/Registry/Latenz) im Detail: [PHASE2_SPEC.md](../PHASE2_SPEC.md).

#### Rezept: Klang-Baustein bauen (z. B. „ADSR und OSZ")

> Auslöser (@dpa 20260803): eine fremde KI (DeepSeek) hat für „bau mir ADSR und OSZ" 20+
> Dateien gelesen, sich mehrfach wortgleich im Kreis gedreht und am Ende die **komplette**
> Poly-Synth-Engine (Keyboard, Base-Frq, Chord-Memory) im Hintergrund mitlaufen lassen und nur
> zwei UI-Gruppen sichtbar geschaltet – genau das „ad hoc dazustellen", das die Kern-Regel
> oben verbietet. Dieses Rezept soll beides ersparen: das stundenlange Quer-Lesen UND den
> Reuse-Hack.

**Was schon da ist – DSP-Bausteine zum 1:1-Wiederverwenden** (kein UI, keine State-Kopplung,
einfach importieren):

| Baustein | Datei | Signatur |
|---|---|---|
| Oszillator (fertige Voice, Square/Saw/Sine/Tri, Poly-Limit + Voice-Stealing eingebaut) | [lib/polysynth/audio/SquareOsc.js](../lib/polysynth/audio/SquareOsc.js) | `class SquareOsc` |
| Oszillator (rohe Wellenform-Koeffizienten für `createPeriodicWave`, wenn SquareOsc.js zu viel mitbringt) | [lib/polysynth/audio/pulseWave.js](../lib/polysynth/audio/pulseWave.js) | `oscCoefficients(duty, phase, N)`, `harmonicsForFreq(...)` |
| ADSR (reine Hüllkurven-Mathematik, liefert Float32Array für `setValueCurveAtTime`) | [lib/polysynth/envCore.js](../lib/polysynth/envCore.js) | `msToSamples(ms, sampleRate)` + Kurvenbau |
| ADSR (GroupHost-Panel + Rechtsklick-Settings, 1..N Instanzen über EINEN Hook) | [lib/adsrPanel.js](../lib/adsrPanel.js) | `adsrKnobs()`, `adsrButtons(onAction)`, `adsrGroupDef(name, sfx)`, `adsrDefaultsFor(sfx)`, `createAdsrSettingsHook(state, {onCopy?, onDelete?})` |
| ADSR (vervielfältigbar mit +/‑, Routing-Registrierung + Output-PickMenu, echter AudioNode für Scope) | [lib/polysynth/multiEnv.js](../lib/polysynth/multiEnv.js) | `EnvEngine`, `createEnvManager()` — bezieht seine Panel-/Settings-Bausteine seinerseits aus `lib/adsrPanel.js` |
| Tonhöhe (MIDI↔Hz, Kammerton, Snap) | [lib/polysynth/pitch/Scaler.js](../lib/polysynth/pitch/Scaler.js) | `freqToMidi`, `midiToFreq`, `foldToBand`, `harmonicSnap`, `setConcertPitch/getConcertPitch` |
| Pitch-Slide-Mathematik | [lib/polysynth/dsp/holdSlide.js](../lib/polysynth/dsp/holdSlide.js) | `slidePlan(...)`, `slideFreqAt(...)` |
| Latenz-Vertrag fürs Routing | [lib/routing/latency.js](../lib/routing/latency.js) | `busLatencyMs()` |

`lib/adsrOsc/` ist inzwischen ein gebautes Beispiel für genau dieses Rezept (Amp-ADSR +
Pitch-ADSR + eigener Oszillator, alle ADSR-Bausteine aus `lib/adsrPanel.js` importiert, s.
`GROUPS` dort) – als Vorlage lesen, bevor ein neuer ähnlicher Ordner entsteht.

**Wichtig bei EIGENER ADSR-Gruppe (kein Copy-Paste!):** `lib/adsrPanel.js` ist die EINE
Quelle für Knobs/Buttons/Settings/Defaults einer ADSR-Gruppe – Werte-Knobs (A/D/S/R/Peak/
Len) UND die Rechtsklick-Settings (aktiv/Kurven/Skew/Nullpunkt) kommen von dort, nie
händisch nachgebaut. Jede Gruppe bekommt `groupKind:'ADSR'` (egal ob es EINE feste, ZWEI
feste wie bei `adsrOsc` Amp+Pitch, oder N vervielfältigbare Instanzen sind) + ein eigenes
`instanceSuffix` (z. B. `''`, `'_p'`, `'_0'`) – GroupHost reicht das Suffix bei jedem
Rechtsklick automatisch an EINEN gemeinsamen `groupKindSettings`-Hook durch
([GroupHost.js](../lib/group/GroupHost.js), Zeile ~2010), sodass ein einziger
`createAdsrSettingsHook(state)`-Aufruf beliebig viele ADSR-Gruppen bedient. **Zwei
verschiedene `groupKind`-Namen für zwei ADSRs desselben ISM sind ein Warnsignal**, dass der
Settings-Hook fehlt oder falsch verdrahtet ist, nicht die richtige Lösung.

**Bauregel:** Ein neues schlankes Klang-ISM bekommt eine **eigene** `engine.js`
(`createXEngine(state,...)`, s. Neues-ISM-Checkliste oben), die die Bausteine aus der Tabelle
**direkt** importiert. **Nicht erlaubt:** die Engine eines bestehenden großen ISM (z. B.
`createPolySynthEngine`) mit einem künstlich beschnittenen State füttern und nur einzelne
`GROUPS` ausblenden – das schleppt unsichtbaren State (Keyboard, Chord-Memory, Base-Frq) mit,
den niemand in der UI sieht und niemand eingebaut hat.

**Pflicht-Rückfragen, bevor/während gebaut wird** (nicht raten, s. Kern-Regel oben):

1. **Anschluss:** Soll das Modul für sich alleine hörbar sein (eigener Preview-/Gate-Button),
   oder soll es über `ports` ([lib/routing/Registry.js](../lib/routing/Registry.js),
   Typ-Tabelle in [lib/routing/types.js](../lib/routing/types.js)) mit anderen Modulen
   verbunden werden – z. B. ADSR-Ausgang moduliert einen vorhandenen Oszillator woanders,
   oder OSZ-Ausgang geht an ein Scope? Wenn Routing: welche `outputs`/`inputs` genau?
   **Default bei „bau mir X und Y" ohne genannte Verbindung (@dpa 20260803, „modular synth
   Sprache"):** Module UNVERBUNDEN hinstellen, jedes mit echten `ports` (Output-PickMenu wie
   `multiEnv.js`s `adsrOutput`), statt sie im Engine-Code fest zu verdrahten. So bleibt das
   Verbinden ein bewusster zweiter Schritt (durch @dpa selbst oder auf expliziten Zuruf) statt
   einer geratenen Verschaltung. Nur bei explizit genannter Verbindung („X moduliert Y") direkt
   fest verdrahten.
2. **Welcher Oszillator/welche Wellenform** aus dem Pool (Square/Saw/Sine/Tri via
   `SquareOsc.js`, oder eigene Wellenform über `pulseWave.js`-Koeffizienten)?
3. **Mono oder poly?**
4. **Wo soll es leben:** eigenes ISM (eigene `.wb-bench`-Sektion, eigener State,
   Neues-ISM-Checkliste oben) oder nur eine neue Gruppe in einem bereits bestehenden
   Instrument?

Antworten unklar → fragen, nicht die naheliegendste (oft aufwändigste) Variante annehmen.

#### Rezept: neuen Pool-Einstiegspunkt anlegen (Header-Baukasten)

> Auslöser (@dpa 20260804): `overcord/werkbank.js`, `werkbank-leer/werkbank-leer.js` und
> `pitchosc/pitchosc.js` sind eigenständige Dateien, die sich `lib/`+`css/` teilen, aber
> selbst nichts miteinander importierten – der Header (Tasten/MIDI-Knöpfe, Hilfe-Popover,
> Export/Reset, Ensemble-Menü) stand darum bis auf Kommentare **byte-identisch mehrfach**
> in allen dreien. Wer per `tools/new-entry.mjs` eine neue Kopie von `werkbank-leer/`
> anlegt, bekommt diese Bausteine jetzt automatisch aus `lib/` mit – nichts davon muss neu
> geschrieben werden.

**Was schon da ist – für den Header eines neuen Einstiegspunkts, fertig zum Importieren:**

| Baustein | Datei | Signatur | Wofür |
|---|---|---|---|
| Header-Umschalt-Button (⌨ Tasten, 🎹 MIDI, 💬 Hints, …) | [lib/headerBtn.js](../lib/headerBtn.js) | `makeHeaderToggle(wireHeaderBtnSettings)` → `mkHeaderToggle(id, label, title, onToggle)` | Baut den Button selbst (Klick schaltet `.active`, zwei Buttons können sich per `_radioPeer` gegenseitig ausschalten). **Welche Instrumente der Toggle erreicht (`onToggle`), bleibt Sache des Aufrufers** – diese Liste ist bei jedem Einstiegspunkt anders (s. Warnung unten) |
| Rechtsklick-Optik für Header-Buttons | [lib/headerBtn.js](../lib/headerBtn.js) | `makeWireHeaderBtnSettings({ hdrElemSettings, state })` → `wireHeaderBtnSettings(id, btn, defLabel)` | Macht einen Header-Button rechtsklickbar (Label-Position, Ein/Aus-Text, Farben) |
| [?]-Hilfe-Popover im Instrument-Header | [lib/benchHelp.js](../lib/benchHelp.js) | `mountBenchHelp(sectionId, state, benchHelpEn)` | Nimmt den Hilfetext aus dem `.wb-note`-Block der Sektion, macht Titel + Text editierbar (Markdown), zeigt EN-Übersetzung aus der übergebenen Tabelle |
| State-Export/Import als Datei + Auto-Backups | [lib/configIO.js](../lib/configIO.js) | `makeConfigIO(LS_KEYS, filenamePrefix)` → `{ buildConfig, applyConfig, exportConfig, doReset, backups }` | Kompletten localStorage-Stand als `.json` sichern/laden, "Alles zurücksetzen", automatische gestaffelte Backups |
| Ensemble-Snapshot-Menü im Header | [lib/EnsembleStore.js](../lib/EnsembleStore.js) | `createEnsembleStore(ensembleState, instruments)` (Speicherlogik) + `mountEnsembleMenu({ ensembleStore, ensembleState, hdrElemSettings, state })` (das PickMenu dazu) | Ein benannter Zustand über mehrere Instrumente hinweg speichern/laden |
| Rechtsklick-Settings fürs vervielfältigbare Scope | [lib/scope/multiScope.js](../lib/scope/multiScope.js) | `createScopeManager(...)` + `createScopeSettingsHook({ scopeManager, state, host })` | +➚ Kopie / 🚮 Löschen / ⟲ Reset im Gruppen-Rechtsklick-Panel |

**⚠️ EINE Sache bleibt bewusst NICHT in `lib/`, obwohl sie in allen drei Dateien vorkommt:**
welche Instrumente ein Header-Button erreicht (z. B. `keyBtn`s `onToggle`, das
`keyMidi.setKeyEdit(on)` auf JEDEM vorhandenen Instrument aufruft) UND die
`hintResolve`/`keydown`-Aufzählungen. Diese Listen sind bei jedem Einstiegspunkt
unterschiedlich (overcord hat Poly-Synth/Stepseq, die anderen nicht) und waren in der
Vergangenheit schon **lückenhaft** (ein neues Instrument eingebaut, aber hier zu ergänzen
vergessen – ein Button wirkte dann auf dem neuen Instrument einfach nicht). Beim Einbauen
eines neuen Instruments in einen Einstiegspunkt: JEDE dieser Listen in derselben Datei
durchgehen und das neue Instrument überall eintragen, wo es hingehört – nicht nur an einer
Stelle. Dieselbe Vorsicht gilt für `LS_KEYS` (s. `lib/configIO.js`-Kommentar) und für die
`instruments`-Liste bei `createEnsembleStore`.

## Was alle Controls gemeinsam haben

| | |
|---|---|
| **Rechtsklick** | öffnet seine Einstellungen. Das ist die eine Regel, die man wissen muss; ⚙-Icons gibt es nirgends. |
| **Klick** | wählt es aus (dezent markiert: leichte Färbung + feiner Rahmen = der „Selektionsrahmen", `--sel-*` in [main.css](../css/main.css)). |
| **Pfeiltasten** | bedienen das ausgewählte Control (Regler stufenlos). |
| **e-Mode** (Taste `e`) | frei verschiebbar, per Klick/Shift-Klick/Gummiband auswählbar. Dort wird **nichts** bedient (`arranging`-Sperre). 10px-Raster, Shift = 1px fein. |
| **Tasten / MIDI** | die zwei Header-Schalter legen ein Overlay über ALLE Controls: pro Control ein Feld zum Tastenbelegen bzw. ein 🎹 zum MIDI-Learn ([KeyMidi.js](../lib/keymidi/KeyMidi.js)). |
| **Optik** | Beschriftung, Farben und Maße liegen in der Optik-Ebene (`ctrlStyles` bzw. `knobMeta`) – sie überleben einen Snapshot-Recall unverändert. Settings verstellen **nie** einen Wert. |
| **Panel?** | Der Knopf oben in den Control-Settings entscheidet, **wo das Control wohnt**: auf dem Panel (frei designbar) oder nur in den Gruppen-Settings (s.u.). Umschalten wirkt sofort aufs Panel, das Settings-Fenster bleibt offen (ESC/✕ schließt). |

### Panel oder Gruppen-Settings (@dpa dd.md 20260801)

Jedes Control hat zwei mögliche Heimaten – der **Panel?**-Knopf in der Kopfzeile seiner
Settings schaltet um:

| | Wo | Aussehen |
|---|---|---|
| **A – auf dem Panel** (Default) | in seiner Gruppe auf der Fläche | frei designbar: Gestalt, Farben, Maße, Position |
| **B – in den Gruppen-Settings** | als Zeile in der Liste am Fuß der Gruppen-Settings | einheitlich und platzsparend: nur **Label + Wert** |

Das ist eine **andere Ebene als „Gestalt: Ohne"** (`viewSize:'none'`) beim Regler: die
Gestalt ist Paneldesign (Knob ohne Dial, aber weiterhin AUF dem Panel), Panel? entscheidet,
ob das Control überhaupt aufs Panel gehört. Beides ist frei kombinierbar.

Off-panel ist die Panel-Optik bedeutungslos – die rein grafischen Felder der Settings sind
darum abgegraut, bleiben aber bedienbar (man kann das Aussehen für die Rückkehr aufs Panel
vorbereiten). Die Tontechnik (Min/Max/Kurve/Einheit/Default/Modus) bleibt normal nutzbar,
erreichbar per Rechtsklick auf die Listenzeile. Persistenz: `ctrlOffPanel` (Optik-Ebene,
`id → true`), Teil der `LAYOUT_KEYS` – ein Sound-Snapshot fasst es nie an.

## Die Settings-Ebenen

Die Werkbank ist konsequent auf **Rechtsklick-Bedienung** ausgelegt. Es gibt vier Ebenen von Einstellungen:

### 1. Ensemble-Settings (Config)
Der Button **Config** im Haupt-Header öffnet die globalen Einstellungen.
*   **Inhalt:** Sprache (DE/EN), globale Label-Farbe/Größe, Wert-Hintergründe, Gruppen-Kopf-Optik.
*   **ISMs (ddw.md 20260803_135251):** Unterrubrik, die ausgeblendete Standard-Instrumente
    listet und je einen Knopf zum Wieder-Einblenden mitbringt — s. Punkt 2 unten.
*   **Daten:** Hier liegen auch die Knöpfe für Export, Import und den totalen Reset.

### 2. Instrument-Settings (ISM)
Rechtsklick auf den Namen eines Instruments (z.B. "Poly-Synth" oder "Takt/Metronom").
*   **Allgemein:** Jedes ISM hat seinen eigenen Namen, Hintergrundfarbe und Zoom-Faktor.
*   **Verschieben:** Über den Header können Instrumente frei auf der Seite platziert werden (Position wird gespeichert).
*   **ISM-Snapshot:** Speichert die Werte **aller** Gruppen dieses Instruments auf einmal.
*   **Sichtbar (ddw.md 20260803_135251):** derselbe Panel?-Knopf wie bei Controls (s.u.), nur
    eine Ebene höher — blendet das GANZE ISM aus (`.wb-bench`-Sektion, State-Key `ismHidden`
    im ISM-eigenen State). Ausgeblendete Standard-ISMs (Tempo&MM/Scope/Debug/Rec/Meter) tauchen
    in einer eigenen Unterrubrik der Haupt-Settings (⚙ „Einstellungen" → „ISMs") auf und lassen
    sich von dort wieder einblenden — sonst wären sie nicht mehr auffindbar.

### 3. Gruppen-Settings
Rechtsklick auf den Header einer Gruppe.
*   **Standard-Ansicht:** Gruppen bringen beim Erstellen eine Standard-Optik und Funktionen mit.
*   **Combos (Optik-Pool):** Speichert das Aussehen (Farben, Maße) einer Gruppe. Da Gruppen oft geklont werden (z.B. mehrere Oszillatoren), teilen sie sich einen Pool: Ein "Blaues Design" kann für alle Gruppen derselben Art abgerufen werden.
*   **Snapshots (Werte-Pool):** Speichert nur die Regler-Werte dieser einen Gruppe.

### 4. Control-Settings
Rechtsklick direkt auf ein Bedienelement.
*   **Knobs:** Nutzen den `KnobMetaEditor`. Hier werden technische Grenzen (Min/Max), die Kurvenform (Log/Exp) und das Design (Fader vs. Knob) festgelegt.
*   **Andere:** Nutzen die `ElementSettings`. Hier geht es um Label-Positionen, Button-Modi (Trigger/Gate/Toggle) und Farben.
*   **Design-Presets:** Wie bei den Gruppen-Combos können Designs (ohne den Textinhalt) gespeichert und auf andere Controls derselben Sorte übertragen werden.

## Die Sorten

Jedes Control trägt ein typ-präfixiertes `data-ctrl` – ein Selektor `[data-ctrl='bpm']`
trifft nie, es heißt `[data-ctrl='k:bpm']`.

| Präfix | Sorte | defs-Feld | Einstellungen (Rechtsklick) |
|---|---|---|---|
| `k:` | **Knob / Fader** – ein Zahlenwert | `KNOBS` | [KnobMetaEditor](../lib/KnobMetaEditor.js): Min/Max/Step/Dez., Kurve+Skew, **Default**, Einheit, Label-Position, **Value?** (Wertanzeige an/aus), Gestalt (Knob / Fader waagerecht / senkrecht / Ohne) + Ansicht bzw. Länge, Padding, VG/BG |
| `s:` | **Menü-Schalter** – Auswahl aus festen Optionen | `SELECTS` | Label (+ an/aus), Options-Namen, BG0/BG1/VG, Schriftgröße, Länge |
| `g:` | **Segment** – Stufen als Knopfreihe (registriert wie `select`) | `SEGMENTS` | wie Menü-Schalter |
| `t:` | **Schalter** – an/aus | `TOGGLES` | Label, Label-Position |
| `x:` | **Schrift-Eingabe** – freier Text | `TEXTS` | wie Menü-Schalter, dazu Höhe |
| `n:` | **Notiz** – reiner Text, trägt keinen Wert (Inhalt **ist** das Label) | `NOTES` | Label, Textgröße, Breite, Textfarbe |
| `b:` | **Button** – löst eine Aktion aus | `BUTTONS` | Label, Label-Position (inkl. **Ohne**), **Modus** (s.u.), Caption an/aus, VG/BG (aus/an), Breite/Höhe |
| `u:` | **Anzeige** – Readout/Eigenbau (frei platzierbar) | `displays` | je nach Typ |

### Button-Modi (`b:`)

Ein Button kennt vier Verhalten (Feld **Modus**, Default kommt aus `cfg.mode` in den defs):

| Modus | Verhalten | Optik |
|---|---|---|
| **Trigger** | Impuls, feuert einmal | Farbe snappt AN und **fadet** nach AUS (D-Env-Gefühl) |
| **Gate** | aktiv **solange gedrückt** (Maus-Halten) | AN während des Drucks, sonst AUS |
| **Umschalter** | an/aus je Klick, Zustand bleibt | AN/AUS |
| **nix** | Impuls wie Trigger, feuert beim Drücken/Aktivieren | **bleibt immer AUS** (kein ON-Flash, keine BG-Änderung) |

Der ON-Zustand hat **keinen Rahmen** mehr: er zeigt sich über den Hintergrund – ohne eigene
„BG an"-Farbe eine dezente Akzent-Tönung, sonst die gesetzte Farbe. Extern getriebene Buttons
(z.B. Start, solange das Metronom läuft) setzt der Aufrufer über `setCtrlOn(id, on)`.

## Die Settings-Panels

Drei schwebende, an ihrer Kopfzeile **verschiebbare** Panels; ✕/ESC/Außenklick schließt,
alle Felder wirken **live** (Fußzeile „Enter = Übernehmen · ESC = Verlassen"), sanfter Rahmen,
kleine Radien:

- **[KnobMetaEditor.js](../lib/KnobMetaEditor.js)** – für `k:` (Rechtsklick auf einen Regler).
- **[ElementSettings.js](../lib/ElementSettings.js)** – für alle Nicht-Knob-Controls
  (`s:`/`g:`/`t:`/`x:`/`n:`/`b:`/`u:`); rein optisch, verstellt nie Werte.
- **Gruppen-Settings** (inline in GroupHost, Rechtsklick auf einen Gruppen-Titel): Name,
  **BG** und **VG** (je mit Deckkraft-`%`), Breite/Höhe (leer = auto).

### Der Farbwähler ([colorPick.js](../lib/colorPick.js))

Jedes Farbfeld öffnet einen eigenen kompakten Wähler statt des nativen: SV-Mischfeld,
Regenbogen, **Pipette** (EyeDropper – Bildschirmfarbe aufnehmen), und ein Wertfeld, dessen
Format sich per Knopf umschalten lässt: **HEX → RGB → HSL** (Copy kopiert im aktuellen Format).
Klick ins Feld markiert immer den ganzen Inhalt.

## Tasten & MIDI ([KeyMidi.js](../lib/keymidi/KeyMidi.js) · [Midi.js](../lib/keymidi/Midi.js))

- Zwei Header-Schalter (**⌨ Tasten**, **🎹 MIDI**) – nur einer zugleich; solange aktiv **atmen**
  sie sanft (2 Hz), damit man den offenen Learn-Modus nicht vergisst.
- Tasten-Overlay: pro Control ein Feld, Klick → nächster echter Tastendruck ist die Belegung.
- MIDI-Learn: Klick aufs 🎹 → ein Banner **am Control** (nicht mehr unten mittig), der gelernte
  Control ist mit einer Akzent-Umrandung markiert. **ESC** verlässt den MIDI-Learn-Modus.
  Noten-Bindungen zeigen den **Tonnamen** (z.B. `C#4`).

## Ein neues Control einbauen

1. **Default in den State** (`DEFAULTS` der defs bzw. MiniState) – ohne ihn kein Recall und
   kein sinnvoller Doppelklick-Wert.
2. **In die passende defs-Sorte eintragen** (`KNOBS`/`SELECTS`/`SEGMENTS`/`TOGGLES`/`TEXTS`/
   `NOTES`/`BUTTONS`) und der Gruppe in `GROUPS` zuordnen. Damit ist es automatisch
   bidirektional gebunden, verschiebbar, benennbar, stylbar und tasten-/MIDI-belegbar.
3. **Aktion anschließen** (nur `BUTTONS`): `onClick`/`onAction(id)` – die Engine
   ([engine.js](../lib/taktmetro/engine.js)) reagiert auf die id, die defs kennen keinen Ton.
4. **Optische Keys** landen in `ctrlStyles`/`knobMeta`/`ctrlPos`/`groupStyles` – getrennt vom
   Wert-State, damit ein Recall die Optik nicht anfasst (s. Nähte in [ARCHITEKTUR.md](../ARCHITEKTUR.md)).
