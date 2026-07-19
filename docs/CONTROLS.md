# Die Control-Sorten der Werkbank

> Schwester zu [teslacoils CONTROLS.md](../../teslacoil/docs/CONTROLS.md). Die Werkbank
> ist eine Sammlung wiederverwendbarer Bausteine zum Rüberkopieren; die Controls entstehen
> **generisch** aus einer deklarativen `defs`-Quelle (`mountGroups(root, state, defs, opts)`
> in [GroupHost.js](../lib/group/GroupHost.js)). Wer die Architektur-Karte braucht:
> [ARCHITEKTUR.md](../ARCHITEKTUR.md).

## Was alle Controls gemeinsam haben

| | |
|---|---|
| **Rechtsklick** | öffnet seine Einstellungen. Das ist die eine Regel, die man wissen muss; ⚙-Icons gibt es nirgends. |
| **Klick** | wählt es aus (dezent markiert: leichte Färbung + feiner Rahmen = der „Selektionsrahmen", `--sel-*` in [main.css](../css/main.css)). |
| **Pfeiltasten** | bedienen das ausgewählte Control (Regler stufenlos). |
| **e-Mode** (Taste `e`) | frei verschiebbar, per Klick/Shift-Klick/Gummiband auswählbar. Dort wird **nichts** bedient (`arranging`-Sperre). 10px-Raster, Shift = 1px fein. |
| **Tasten / MIDI** | die zwei Header-Schalter legen ein Overlay über ALLE Controls: pro Control ein Feld zum Tastenbelegen bzw. ein 🎹 zum MIDI-Learn ([KeyMidi.js](../lib/keymidi/KeyMidi.js)). |
| **Optik** | Beschriftung, Farben und Maße liegen in der Optik-Ebene (`ctrlStyles` bzw. `knobMeta`) – sie überleben einen Snapshot-Recall unverändert. Settings verstellen **nie** einen Wert. |

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

Ein Button kennt drei Verhalten (Feld **Modus**, Default kommt aus `cfg.mode` in den defs):

| Modus | Verhalten | Optik |
|---|---|---|
| **Trigger** | Impuls, feuert einmal | Farbe snappt AN und **fadet** nach AUS (D-Env-Gefühl) |
| **Gate** | aktiv **solange gedrückt** (Maus-Halten) | AN während des Drucks, sonst AUS |
| **Umschalter** | an/aus je Klick, Zustand bleibt | AN/AUS |

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
