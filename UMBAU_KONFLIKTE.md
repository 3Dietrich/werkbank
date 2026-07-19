# Umbau: Takt + Metronom → Werkbank — offene Entscheidungen

> Angelegt 20260718 auf Prompt in [ddw.md](ddw.md) (20260718_105726).
> **Werkbank soll der neue Pool für die Module werden.** Takt (Transport/Tempo) und
> Metronom kommen aus [taktgeber](../taktgeber/) rein, aber die **Gruppen- und
> Control-Definitionen von [teslacoil](../teslacoil/) sind das Kanon** — an denen hat @dpa
> lange gefeilt, taktgebers Nachbau davon ist „eigener Scheiß" geworden.
>
> **So benutzt du diese Datei:** jeder Konflikt hat drei Zeilen zum Ankreuzen. Setz ein `x`
> in **eine** Klammer, oder schreib hinter „anders:" deine eigene Vorgabe. Erst wenn hier
> überall ein Haken steht, baue ich die Integration — sonst müsste ich raten und es wird
> wieder „eigener Scheiß".
>
> Reihenfolge = grob von „entscheidet alles Weitere" nach „Detail".

---

## Warum es überhaupt Konflikte gibt

teslacoil und taktgeber bauen dasselbe (Gruppen mit Controls, e-Mode zum Anordnen) auf
**zwei unvereinbare Arten**:

| | **teslacoil** (Kanon) | **taktgeber** (der „Scheiß") |
|---|---|---|
| Controls definiert in | `KNOBS`/`SELECTS`/`TOGGLES`/`TEXTS`/`NOTES`/`BUTTONS`-Arrays ([app.js](../teslacoil/js/app.js)) | **ein** Manifest [modules.js](../taktgeber/modules.js), Control an State-Key gebunden |
| Control-Sorten | 7 (`k s t x n b u`) + `data-ctrl`-Präfix | 4 (`range toggle segment keybind`) + Flags |
| Wert-ohne-Fader | Regler-Gestalt „Fader" via `knobMeta` | Flag `drag:true` („Knob ohne Knob") |
| Settings öffnen | Rechtsklick pro Control, **ein** Panel | teils Rechtsklick, teils Gruppen-Settings zweigeteilt „Ansicht"/„Technik" |
| e-Mode | Free-Canvas, Multi-Select-Menge, Gummiband, `freezeGroup` ([app.js](../teslacoil/js/app.js#L1357)) | eigener Arrange-Modus über `data-key`-Items in einem Body ([ui.js](../taktgeber/ui.js#L264)) |
| Persistenz-Trennung | `LAYOUT_KEYS` (Optik) vs Snapshot (Klang) | `VALUE_KEYS` vs `SETTINGS_KEYS` (nachgebaut) |

Das Manifest-Modell (taktgeber) ist eigentlich das *elegantere* für einen Modul-Pool (eine
deklarative Quelle, generische UI). Das teslacoil-Modell ist das **ausgereiftere** (mehr
Sorten, polierter e-Mode, echte Optik/Snapshot-Trennung). Die folgenden Entscheidungen
legen fest, welches gewinnt — und wo gemischt wird.

---

## K1 — Welches Control-Modell wird der Standard der Werkbank?

Das ist die Grundsatzentscheidung, alles Weitere hängt daran.

- **taktgeber:** deklaratives Manifest (`MODULES`), Control = Zeile mit `key/type/…`. Neue
  Module = Manifest ergänzen, UI baut sich selbst. Aber nur 4 Sorten, kein Free-Canvas.
- **teslacoil:** Fabriken + `GROUPS`, `data-ctrl`-Präfixe, 7 Sorten, reifer e-Mode. Aber
  imperativ, ein neues Control anzulegen ist mehr Handarbeit (State → Fabrik → Gruppe).
- **anders:** teslacoils Sorten/e-Mode/Optik-Ebene ALS BASIS, aber Gruppen weiterhin aus
  einem Manifest wie taktgebers `modules.js` gespeist (Manifest → teslacoil-Fabriken). Das
  wäre die Fusion: deklarative Quelle, teslacoil-Qualität. Mehr Bauaufwand einmalig.

```
[ ] wie taktgeber  (Manifest-Modell bleibt, teslacoil-Details nachrüsten)
[ ] wie teslacoil  (Fabrik-Modell, Takt/Metro als GROUPS eintragen)
[ ] anders: ________________________________________________
```

## K1 Antwort
etwas länger:  
(
  ist mit dem launischen Apple Diktat diktiert, deswegen gibt's Fehler:   
  teslakeule = tesla Call = tesla Coin  **= telscoil**   
  c-lab = **klein**
)  
Die Konflikttabelle scheint mir fast überall Teslakeule die Wahl zu sein. Danach hast du aber geschrieben:
"Das Manifest-Modell (taktgeber) ist eigentlich das *elegantere* für einen Modul-Pool (eine deklarative Quelle, generische UI)."
Lass mich unsicher zurück lässt.. (Das hab ich vorhin besser geschrieben, aber es war auch nur der Hinweis, das muss jetzt so reichen)
zu K1: jein: teslakeule, wobei dein "anders" auch irgendwie gut klingt, habe ich aber nicht richtig verstanden..
 Wenn du wissen willst, welchen Control standardmäßig einbauen sollst ist meine Antwort auch klar: wie in Tesla Coin knob(/fader) mit Ansicht="ohne knob"
---

## K2 — e-Mode: welcher?

Du willst den e-Mode „**genauso** hier haben" und „**zwei Gruppen, die man beliebig
verschieben kann**". Beide Projekte haben einen e-Mode, aber verschieden:

- **taktgeber:** e-Mode ordnet **Controls innerhalb einer Gruppe** um (`data-key`-Items),
  Capture-Handler schluckt Bedienung. Ob ganze Gruppen frei im Raum verschiebbar sind:
  begrenzt.
- **teslacoil:** Free-Canvas — jede Gruppe UND jedes Control ist eine frei ziehbare Einheit
  (`freezeGroup` friert die Gruppe zu absoluten Positionen ein), Multi-Select als Menge,
  Gummiband-Auswahl, Tab läuft durch die Auswahl nach Bildschirmlage, Pfeiltasten 10px
  (Shift 1px). Genau das „zwei Gruppen beliebig verschieben" ist hier zuhause.

„Genauso wie [Kanon = teslacoil]" spricht stark für teslacoil — bitte bestätigen, damit ich
den Free-Canvas + `freezeGroup` + Gummiband als Baustein aus teslacoil ziehe (das ist der in
[README.md](README.md#L Noch offen) genannte „noch offene" Gruppen-Baustein).

```
[ ] wie taktgeber  (Arrange-in-Gruppe)
[ ] wie teslacoil  (Free-Canvas, Gruppen+Controls frei, Gummiband, freezeGroup)  ← vermutet
[ ] anders: ________________________________________________
```
## K2 Antwort
wie in Teslacoil  

---

## K3 — „Wert ohne Fader" (Knob ohne Knob)

Für Werte wie `max. BPM`, `Anschieben`, `Latenz-Offset` will taktgeber keinen Fader,
sondern einen gezogenen Zahlenwert.

- **taktgeber:** deklaratives Flag `drag:true` am Control im Manifest.
- **teslacoil:** dasselbe optische Ergebnis über die **Regler-Gestalt** (`knobMeta`, Gestalt
  = „nur Wert"), also pro Control in den Settings einstellbar statt im Code fest.

Beide erreichen dasselbe. Frage ist nur, ob es eine Code-Vorgabe (`drag:true`) oder eine
Settings-Sache (Gestalt) ist.

```
[ ] wie taktgeber  (Flag im Manifest, fest)
[ ] wie teslacoil  (Gestalt in den Control-Settings, umstellbar)
[ ] anders: ________________________________________________
```
## K3 Antwort:
auch hier wie in K1 beschrieben: Tesla Coin knob(/fader) mit Ansicht="ohne knob"  

---

## K4 — Gruppen-Settings: zweigeteilt oder pro Control?

- **taktgeber:** Gruppen-Settings sind in **„Ansicht"** (Farbe/Größe/Sichtbarkeit, auto
  gebaut) und **„Technik"** (`tech:true`-Controls) geteilt; dazu `section:'Tab'` für
  Unter-Abschnitte. Viele Parameter (Keybinds, Tap-Details) leben im Technik-Teil.
- **teslacoil:** **kein** zweigeteiltes Gruppen-Panel — Settings kommen pro Control per
  Rechtsklick; „⚙ an Gruppen gibt es nicht mehr" (@dpa 20260716). Technische Parameter sind
  einfach eigene Controls in der Gruppe.

Hier prallt viel aufeinander: taktgebers ganzes Transport-Modul steckt Keybinds/Tap in den
„Technik"-Teil. Nach teslacoil-Art würden das sichtbare oder eigene Controls.

```
[ ] wie taktgeber  (Gruppen-Settings „Ansicht"/„Technik" + section)
[ ] wie teslacoil  (alles pro Control per Rechtsklick, kein Gruppen-Panel)
[ ] anders: ________________________________________________
```
## K4 Antwort
 stimmt. Das ist ein Problem. Wie wär's wie folgt: du setzt die ganze "Technik" (mit Standard Controls) in die Gruppe, ich kann das dann ordnen und schauen was nötig ist (wie beim Modul entwickeln halt) und sag dir dann später, ob es ein eigenes Fenster kriegen soll, oder ein Ausklappbar sein soll, oder oder oder… Wie wär das? Fünf
---

## K5 — Control-Sorten `segment` und `keybind`

taktgeber hat zwei Sorten, die teslacoil so nicht kennt:

- **`segment`** (z.B. Tap-Modus „1 · konstant / 2 · folgend"): in teslacoil wäre das ein
  `SELECT` (`s:`) oder ein Toggle. Segment-Optik (nebeneinanderliegende Knöpfe) gibt es dort
  nicht als eigene Sorte.
- **`keybind`** (Tastenbelegung + MIDI-learn, `act`): teslacoils Transport ist anders
  geschnitten; die Tastenbelegung ist dort kein generisches Control.

Vorschlag zur Auswahl: `keybind` und `segment` **aus taktgeber übernehmen** (sie tragen echte
Funktion, die teslacoil-Sorten nicht abdecken) und als **neue `u:`-Eigenbauten** in
teslacoils Sorten-System einhängen — dann bleiben sie im Kanon konsistent.

```
[ ] wie taktgeber  (eigene Sorten segment/keybind bleiben)
[ ] wie teslacoil  (segment→SELECT, keybind neu bauen/weglassen)
[ ] anders: ________________________________________________  (Vorschlag: als u:-Eigenbau)
```
## K5 Antwort
Warum nicht für **Segment** einfach ein neues Control..?
**Keybind** (Tastenbelegung + MIDI-learn,..) das ist in Taktgeber lange erarbeitet, ist gut geworden und soll unbedingt übernommen werden! Eigentlich für alle Controls (an den unterschiedlichen Controller Details müsste man aber jeweils noch arbeiten..) Tastenbelegung soll am besten in den Haupt-Header ein Schalter (neben "Helphints?" z.B.), der, in angeschaltet, alles etwas dunkler wird und über allen (für Tastatur Bedienung sinnvollen) Controls die Tastenbelegung angezeigt wird und spontan an Ort und Stelle verändert werden kann. Das selbe für Medilearn und die beiden Buttons sollen zusätzlich auch jeweils einen Shortcut und oder MIDI Lern erhalten.
 Okay?
---

## K6 — State/Persistenz: welcher State-Kern?

- **taktgeber:** [state.js](../taktgeber/state.js) — flach, `get/set/on/off`,
  `VALUE_KEYS`/`SETTINGS_KEYS`. Trägt schon alle Takt/Metro-Defaults.
- **teslacoil:** `State.js` + `LAYOUT_KEYS`, plus 3-Ebenen-Presets (Snapshot/Skala/Optik) in
  `PresetManager`.
- **Werkbank aktuell:** `MiniState` (Minimal-Naht) — der Taktgeber mountet dort **mit seinem
  eigenen** state.js daneben, isoliert.

Für einen Pool sollten die Module **einen** State teilen. taktgebers state.js ist bewusst
teslacoil-kompatibel gebaut. Vorschlag: taktgebers state.js als Werkbank-State-Kern nehmen
(er kennt Takt+Metro schon) und teslacoils LAYOUT_KEYS-Disziplin darauf anwenden.

```
[ ] wie taktgeber  (state.js wird der Werkbank-Kern)
[ ] wie teslacoil  (State.js-Port, Takt/Metro-Keys eintragen)
[ ] anders: ________________________________________________
```
# K6 Antwort
Ich weiß nicht was State/Persistenz bedeutet, ich verstehe nicht was du beschreibst. Entweder du beschreibst es mir noch mal in anderen, einfacheren Worten, oder ich vertrau dir einfach.. mach wie du es für gut hältst, man kann ja immer noch mal ändern.
---

## K7 — Metronom-DSP (das eigentliche „Modul")

Das ist **nicht** wirklich strittig, nur zur Bestätigung: der Metronom-**Klang** (2 Teile,
Amp/Cutoff/Offset/Morph/Reso, Vadim-SVF) existiert **nur in taktgeber** ([metro.js](../taktgeber/metro.js))
— teslacoil hat kein Metronom. Der DSP kommt also 1:1 aus taktgeber. Offen ist nur, ob die
Werkbank ihn **live klingen** lässt (braucht AudioContext) oder erstmal **nur die UI** zeigt
(wie jetzt: „[Audio nicht verfügbar]").

```
[ ] nur UI zuerst  (Struktur prüfen, kein Ton — schneller, wie bisher)
[ ] gleich mit Ton  (metro.js + clock.js live einhängen)
[ ] anders: ________________________________________________
```
# K7 Antwort
Ganz klar: Metronom kommt von Taktgeber
---

## K8 — Der Control-Name in den Settings (aus ddw.md Z.18)

Du willst „in die Settings immer (irgendwo, klein) der Name des [Controls]". Das ist
unstrittig — nur die Frage, welcher Name:

- der **technische Key** (`metroCutoff`, `k:cutoff`) — eindeutig, aber kryptisch, oder
- der `data-ctrl`-Bezeichner mit Präfix (`k:metroCutoff`) — zeigt auch die Sorte.

```
[ ] technischer Key  (z.B. „metroCutoff")
[ ] mit Sorten-Präfix (z.B. „k:metroCutoff")
[ ] anders: ________________________________________________
```
## K8 Antwort
Mit Kontrollnamen meinte ich:  `KNOBS`/`SELECTS`/`TOGGLES`/`TEXTS`/`NOTES`/`BUTTONS`/`User` wobei ich mit User noch nicht sicher bin.. fällt dir ein besserer Name ein? Auf jeden Fall gefällt mir der Gedanke, dass diese Namen (wenn auch klein), in dieser `Terminal Schrift` oben rechts unauffällig stehen.. was meinst du?
---

## Was NICHT strittig ist (mache ich ohne Rückfrage, sobald K1/K2 stehen)

- Modularität mit klaren Nähten bleibt (ddw.md Z.15) — kein Modul greift heimlich in ein
  anderes.
- Der Metronom-Klang kommt aus taktgebers `metro.js` (teslacoil hat keinen).
- Kommentare aus beiden Quellen bleiben erhalten (dein Prinzip: warum, nicht nur was).
- Panel-Kompaktheit: Controls/Settings klein & dicht (dein `>remember` 20260718).
- Die Werkbank bleibt über Port **8002** erreichbar (ddw.md Z.4) — aktuell startet die
  README noch mit 8000, das ziehe ich mit nach.

---

### Deine Notizen / weitere Punkte
_(freies Feld — was hier noch fehlt oder anders soll:)_
## K9 Antowrt
- Nach dem nochmaligen Antworten bin ich jetzt durch — keine weiteren Notizen!

---

# ═══ ERGEBNIS / BESCHLOSSEN (20260718, aus @dpas Inline-Antworten) ═══

> Auf Platte gesichert, damit es kein Editor-Crash mehr frisst.

## Beschlossene Vorgaben

- **K1/K3 — Control-Modell:** teslacoil ist die Basis. Standard-Control = teslacoil
  **Knob/Fader mit Ansicht „ohne Knob"** für gezogene Werte (max.BPM, Anschieben, Latenz…).
  Modul-Definitionen intern als *eine* deklarative Liste, die teslacoils Fabriken füttert
  (die „Fusion" — für @dpa sichtbar ist nur teslacoil-Stil).
- **K2 — e-Mode:** teslacoil **Free-Canvas** (Gruppen UND Controls frei ziehbar,
  Multi-Select-Menge, Gummiband, `freezeGroup`, Tab nach Bildschirmlage, Pfeile 10px/Shift
  1px). Zwei Gruppen (Transport/Tempo + Takt/Metronom) beliebig verschiebbar.
- **K4 — Technik:** alle technischen Parameter als **normale Controls in der Gruppe**.
  @dpa ordnet später und entscheidet dann über eigenes Fenster / Ausklappbar / etc.
- **K5 — Sorten:** `segment` wird eine **neue Control-Sorte**. `keybind` **1:1 aus taktgeber
  übernehmen** (dort lange erarbeitet, gut). Der *Daten*-Teil (jedes Control kann Taste/MIDI
  tragen) kommt gleich mit; die **Header-Schalter-Overlay-UI** (siehe unten) ist eine eigene
  spätere Phase.
- **K6 — State:** taktgebers `state.js` wird der Werkbank-Kern (kennt Takt+Metro), mit
  teslacoils Optik/Klang-Trennung (LAYOUT_KEYS-Disziplin).
- **K7 — Metronom:** Klang 1:1 aus taktgebers `metro.js`. **UI zuerst, Ton als eigener
  Hördurchgang danach** (headless klingt eh nichts; @dpa hört jeden Klang-Schritt selbst).
- **K8 — Sorten-Name:** klein, oben rechts, `monospace`, unauffällig:
  `Knob` · `Select` · `Toggle` · `Text` · `Note` · `Button` · **`UNIKAT`** (für die `u:`-Sorte,
  @dpas Wahl 20260718 — „Eigenbau" gefiel nicht).

## Bestätigt von @dpa (20260718)
- K8: Sorten-Name für `u:` = **„UNIKAT"**.
- Reihenfolge: **P0 → P1 → P2 → P3 → P4**, go.

## Die große neue Baustelle (K5, eigene Phase): Tastenbelegung/MIDI als Header-Overlay
Schalter im Haupt-Header (neben „Helphints?"). Angeschaltet → alles etwas dunkler, über
jedem tastatur-sinnvollen Control erscheint die aktuelle Tastenbelegung und ist **an Ort und
Stelle** änderbar. Dasselbe für **MIDI-learn**. Gilt möglichst für **alle** Controls (die
Controller-Details je Sorte müssen noch erarbeitet werden). Die beiden Buttons (Start/Stop
und !/!!) bekommen zusätzlich je einen Shortcut und/oder MIDI-Learn.

## Phasenplan (ein Schritt pro Hördurchgang, kein Batchen)
- **P0 ✅ ERLEDIGT (20260718) — Fundament:** teslacoils Gruppen-Baustein + Free-Canvas-e-Mode
  treu portiert nach [lib/group/GroupHost.js](lib/group/GroupHost.js) (**kopiert, nicht
  nachgebaut**). Deklarative Naht `mountGroups(root, state, defs, opts)`. Domäne
  (Skaler/Reverb/BaseFrq/Seq) blieb draußen. Gruppen-Settings lean (Name/BG/Head/Breite/Höhe);
  teslacoils Combo-Presets + Gruppen-Snapshots bewusst später. Headless verifiziert
  ([lib/group/_selftest.html](lib/group/_selftest.html)): 2 Gruppen, `e`-Mode, Gruppe im
  10px-Raster verschiebbar, keine JS-Fehler.
- **P1 ✅ ERLEDIGT — Module:** Transport/Tempo + Takt/Metronom als teslacoil-Gruppen
  definieren (Knob/Fader, Select, Toggle, Button, neue `segment`-Sorte), an `state` gehängt,
  als zwei frei verschiebbare Gruppen im Canvas. UI-first, kein Ton.
- **P2 ✅ ERLEDIGT (20260718) — Sorten-Name** oben rechts (`monospace`, unauffällig) in den
  Settings-Panels: `.kme-sorte` in [KnobMetaEditor.js](lib/KnobMetaEditor.js) (fest „Knob")
  und [ElementSettings.js](lib/ElementSettings.js) (`SORTE`-Map je Typ:
  Select·Toggle·Text·Note·Button·UNIKAT). Headless grün (scratchpad `p2_test.py`).
- **P3 ✅ ERLEDIGT (20260718) — Keybind/MIDI-Overlay** (die große K5-Baustelle): Header-
  Schalter „⌨ Tasten/MIDI"; an → alles dunkler, über jedem Control ein Badge mit
  Tastenbelegung + 🎹, an Ort und Stelle belegbar (Mechanik 1:1 aus taktgeber:
  Klick→nächste Taste, ESC/Entf, Shift+1=„!", Doppelbelegungs-„!", MIDI-Learn mit Kanal).
  Neue Dateien [lib/keymidi/KeyMidi.js](lib/keymidi/KeyMidi.js) +
  [lib/keymidi/Midi.js](lib/keymidi/Midi.js) (Port aus taktgeber/midi.js), eingehängt in
  GroupHost; Dispatch außerhalb des Overlays löst Controls aus. Erprobte Belegungen
  (Space/1/2/[/]/t/r/b) in defs geseedet. Headless grün (`p3_test.py`, Web-MIDI läuft
  headless sogar mit). **@dpas Auge fehlt noch:** Badge-Dichte in der engen Transport-Zeile,
  Farbwahl, Kanal-Nachziehen — Feinschliff nach Sicht.
### Feinschliff-Runde 20260718_2033 (aus [ddw.md](ddw.md)) — ✅ erledigt + headless grün
- **Ansicht reduziert:** nur noch die Übergruppe „Takt + Metronom"; die anderen Benches
  bleiben im DOM (Tasten-Regel „soll nicht weg! nur unsichtbar") via `.wb-hidden`.
  **Einklapp-Icon** links an der Headline (`#taktCollapse`), Zustand persistent.
- **Knob/Fader:** Wert-**Schriftgröße** + **Padding** in den Regler-Settings (Knob.js
  `valueFontSize`/`pad`, KnobMetaEditor „Textgr."/„Padding"). Für BPM & Co.
- **Button:** **ON-Farbe** (`BG aus` / `BG an` / `Text`), Breite+Höhe in eine Reihe. ON-Zustand
  über `GroupHost.setCtrlOn(id,on)`; der Start-Knopf trägt ihn, solange das Metronom läuft
  (`engine.onRunning`).
- **Beat-Anzeige** (neue `u:`-UNIKAT-Sorte `beatView` in GroupHost/defs, aus taktgeber): ein
  Punkt je Beat, Hauptbeat markiert, laufender Beat leuchtet (`engine.onBeat` →
  `GroupHost.setBeat`). Settings: Haupt-/Neben-/BG-Farbe, Beat-Größe, Abstand, Radius
  (0=eckig…1=rund), Padding, Breite/Höhe (0=auto). Kleiner Default-Radius (@dpa mag dezente
  Rundungen → [[core-memories]] / ~/Music/.remember).
- **Offen für @dpas Auge:** Feinlage/Position der Beat-Anzeige in der Gruppe, Radien-Sweep der
  bestehenden Elemente (bisher nur neue Teile dezent), Button-ON-Farbe pro Knopf setzen.

### Runde 20260718_2342 (aus [ddw.md](ddw.md)) — Select/Segment-Settings ✅
- **Inhalt als Kurzschrift** ([lib/optionNotation.js](lib/optionNotation.js)): `Name = [1 - konstant,
  2 - folgend]`, leerer Eintrag = „nichts" (`= [,,3]`). Vergrößerbares Textfeld, Live-Beispiel,
  **`?`-Popover** mit Erklärung. Der Name wird zum Label → keine extra Label-Angabe nötig.
  Optionen werden live neu gebaut (Select `<option>`s bzw. Segment-Knöpfe), Wert bleibt wenn möglich.
- **„letzten aus"** (`lastOff`): erneutes Wählen des letzten (aktiven) Eintrags schaltet ab (Wert leer).
- **Farben BG0 / BG1 / VG:** BG0 = Grund, BG1 = aktive Stufe (beim Segment der gewählte Knopf), VG = Text.
- ElementSettings-`select`-Felder umgestellt, GroupHost `makeSelect`/`makeSegment` bauen Optionen aus
  `ctrlStyles.options` neu (via neuem `registerCtrlStyle(...,extra)` mit `defOptions` fürs Vorbefüllen).
- Wächter: scratchpad `p6_test.py`. (Achtung Fallstrick, gefixt: ein verirrtes frühes `return` in
  ElementSettings._collect hatte size/boxSize/gap/beatSize/… tot gelegt — von p5-Regression gefangen.)

### Runde 20260719_0305 — Select-Modell umgestellt + Button an/aus + Mitte raus ✅
- **@dpa-Wende:** die Formel-Bearbeitung war unpraktisch (er kann Optionen nicht ohne KI ändern).
  → **Optionen sind fest** (Anzahl aus dem Code), in den Settings nur **umbenennen** über eine
  Reihe schmaler Inline-Textfelder (eins pro Option, dünne Trenner). Formel/Kurzschrift + `lastOff`
  **entfernt** (`~`-„alles aus" später). optionNotation.js nur noch für `normOptions`.
- **Button-Inhalt ≠ Label:** Button hat jetzt **zwei Texte „an"/„aus"** (je Zustand, via ctrl-on),
  kein generisches Label. Selector: ein Name pro Option (die Inline-Felder).
- **`Mitte`/center** aus Label-Positionen raus (nie funktioniert). **`Länge` weg** bei Select,
  dafür **Schriftgröße + Padding**. Wächter: `p6_test.py` (neu).

### Runde 20260719_0336 — Tab/Tempo als Sonderfenster + Latenz ✅
- Neue **`unikat`-Sorte „Sonderfenster-Opener"** (`grp.specials` in defs, `makeSpecial` in GroupHost):
  ein ⚙-Knopf öffnet ein schwebendes Panel mit ECHTEN Controls. Die Tab/Tempo-Technik (Modus,
  max.BPM, Anschieben, Anlauf, wait, ±Fenster, Fenster M2) + **Latenz** liegen jetzt dort statt im
  Haupt-Transport (der zeigt nur noch Buttons + BPM). Außenklick schließt — außer man bedient ein
  Control-Settings-Panel (die schweben außerhalb, werden ignoriert).
- **Latenz** (`latencyOffset`, aus taktgeber) neu: Knob (gezogener Wert, −1000…+1000 ms) + Engine
  wendet den Offset auf Ton UND Anzeige an (metroTick/scheduleBeat + größeres Lookahead bei Vorlauf).
  Wächter: `p7_test.py`.

### Runde 20260719_0401 — Buttons/Opener/Header ✅ (Wächter `p8_test.py`)
- **„Zurücksetzen" entfernt** („wie eine Bombe"). Reset nur noch via Konsole (MiniState.reset).
- **Button:** Schriftgröße + Padding neu; **self-toggle „aktiv"** (Klick schaltet isOn um, ctrl-on
  sichtbar); **Text an/aus** schaltet mit dem Aktiv-Zustand; Default beide Texte = Manifest-Label;
  labelPos verschiebt den INNEREN Text. Extern getriebene Knöpfe (Start) richtet setCtrlOn gerade.
- **Sonderfenster-Opener:** neuer Settings-Typ `opener` = Button-Settings **ohne Label/L.Pos**;
  Text an/aus ändert die Opener-Beschriftung sichtbar (offen/zu).
- **Tasten/MIDI = ZWEI Header-Buttons** (`#keyedit` „⌨ Tasten", `#midiedit` „🎹 MIDI"): getrennte
  Overlay-Modi (`KeyMidi.setKeyEdit/setMidiEdit`), Badge zeigt nur den jeweils aktiven Teil.
- **Noch offen:** die zwei Header-Buttons SELBST tasten/MIDI-zuweisbar machen (@dpa 0401) — noch
  nicht umgesetzt (Henne-Ei: Overlay schaltet sich selbst). Separat angehen.

### Runde 20260719_120425 — Korrektur-Liste ✅ (Wächter `p9_test.py` + `p5b_regress.py`)
- **Button-Modell endgültig:** Label = AUSSEN ([aus,über,unter,neben] via labelPos, neues
  `span.btn-label` + CSS `btn-label-*`), **Caption** (ehem. „Text an/aus") = immer zentriert
  IM Button. Settings-Ordnung nach Vorgabe; `open()` sortiert die Grid-Zeilen jetzt generisch
  in `_fieldsFor`-Reihenfolge (= die Liste IST die Panel-Ordnung).
- **KnobMetaEditor:** „Ohne Knob" von *Ansicht* zur **Gestalt** („Ohne"), „Ansicht"→**„Größe"**
  (ohne none-Option); intern bleibt viewSize:'none' (Gestalt „Ohne" mappt darauf). Kurven-Graph
  dünner + weniger hell (1px, rgba .55).
- **Eigener Farbwähler** (colorPick.js `upgradeColorInputs` + `.cp-pop`): der native
  Chrome-Picker war nicht stylebar → kompaktes Popover (SV-Feld ~56px = 2/3 kleiner,
  Hue-Leiste 16px = so hoch wie der Farbpunkt daneben, **Hex**-Feld statt RGB, **⧉ Copy**
  links). Übernimmt ALLE `input[type=color]` (KME/ElementSettings/MiniSettings/
  Gruppen-Settings) via input-Event — bestehende Listener unberührt. `colorPickerBusy`
  deckt das Popover mit ab.
- **Knob-Lücke oben:** der feste `.knob-size-none::before`-4px-Platzhalter ist raus —
  Innenabstand gehört allein dem Padding-Setting.
- **e-Mode-Selektion** überlebt jetzt den e↔p-Toggle (Aufräumen: ESC / Klick ins Leere).
  **Shift+Klick-Multiselect im p-Mode** + Klick woanders löst auf. Selektierte Knobs
  bewegen sich beim Ziehen EINES Knobs **parallel** (gleiches Norm-Delta, `_knobSync`-Guard).
- **Header Tasten/MIDI = Radio** (einer schaltet den anderen aus). Haupt-Buttons SELBST
  belegbar: `keyMidi.register(..., {self:true})` → kein Badge über dem Button, Learning-Panel
  `.km-self` DARUNTER; Taste erst PENDING, Übernahme per **[↵]** (Henne-Ei gelöst);
  `dispatchKey` bedient self-Targets auch im Edit-Modus (Modus per Taste wieder AUS).
- **Sanfte Rahmen** (feedback_sanfte_rahmen): `.pb-btn:hover` → `--sel-line`;
  `.arrange-hint` unten mittig (stritt oben mit dem Inhalt), gedämpfte Farben.
- **Hilfe-Feld** (beide Editoren): 3 Zeilen, `resize: both`, ✕-Reset-Knopf weg —
  **Leeren = Auslieferungstext** (Override wird gelöscht, nicht eingefroren).
- **Offen:** Caption-Icon-Satz für den User (Unicode-Emoji gehen heute schon in der Caption;
  Wingdings sind nicht portabel — lib/icons.js als mitgelieferter SVG-Satz wäre der Weg,
  @dpa entscheidet). Klang P4 weiter @dpas Ohr.

- **P4 ✅ VERDRAHTET (20260718) — Metronom-Ton** live: [lib/taktmetro/engine.js](lib/taktmetro/engine.js)
  treibt die Buttons (start/stop/bang/bang2/slow/fast/tap/tapReset) + Klang-Regler mit den
  aus taktgeber übernommenen Bausteinen ([lib/taktmetro/audio/](lib/taktmetro/audio/):
  clock.js, metro.js, tapTempo.js, dsp/). Struktur headless End-to-End belegt (`p4_test.py`:
  Start baut AudioContext, Metronom feuert Klicks über die Kette Clock→onBeat→Metro, Stop
  hält). **Der KLANG selbst braucht @dpas Ohr (K7) — headless ist stumm.** Modell-Angleich:
  metro.js kennt kein l/m mehr → `metroL`/`metroM`-Regler raus, EIN `metroLevel` (0..1),
  `metroCutoffOffset` als Regler ergänzt. slow/fast = einmaliger Nudge (Halten-zum-Biegen
  ist eine spätere GroupHost-Erweiterung).
