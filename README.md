# Werkbank

Sammlung der wiederverwendbaren Bausteine aus [teslacoil](../teslacoil/) – plus eine
Seite, die sie live zeigt und bedienbar macht.

## Wofür

@dpa (2026-07-15): *„die Gruppe würde ich aus teslacoil nehmen. Ich habe derzeit wenig
daran zu meckern. Also bleibt alles. Auch die Knobs/Fader sind hier (teslacoil)
entwickelt und werden 'rüber kopiert'. alles außer 'taktgeber' kommt erstmal in die
Werkbank."*

Also:

- **teslacoil bleibt die Quelle.** Dort wird entwickelt, dort klingt es, dort wird gehört.
- **Die Werkbank sammelt**, was auch ohne teslacoil Sinn ergibt – zum Rüberkopieren in
  neue Projekte und zum Verfeinern in Ruhe (ohne Takt, ohne Sound drumherum).
- **Der Taktgeber bleibt draußen** (`Clock.js`, `TriggerDivider.js`): eine Werkbank
  braucht keine Zeit.

## Starten

Nur über einen lokalen Server (ES-Module, kein `file://`):

```
python3 -m http.server 8000
```

→ <http://localhost:8000/>

## Was drin ist

| Baustein | Datei | Hängt ab von |
|---|---|---|
| Knob / Fader (3 Gestalten, Länge, Farben, Label-Position) | `lib/Knob.js` | – |
| Settings für Knob/Fader (Range, Kurve, Gestalt, Farb-Presets) | `lib/KnobMetaEditor.js` | `Knob.js` |
| Settings für Select/Toggle/Readout (Label, Farben, Größe) | `lib/ElementSettings.js` | – |
| Oszilloskop / Spektrum | `lib/Scopes.js` | – |
| Step-Sequenzer | `lib/StepSeqUI.js`, `lib/stepSeq.js` | `Knob.js` |
| Tasten-Zuständigkeit (Space/'e'/Pfeile) | `lib/keyRoute.js` | – |

`css/main.css` ist noch **1:1 aus teslacoil** und enthält deshalb auch Regeln, die hier
niemand braucht (Kette, PresetBar, Gruppen …). Bewusst ungekürzt: solange die Bausteine
in beiden Projekten gleich aussehen sollen, ist eine identische Datei ehrlicher als eine
handgetrimmte, die still auseinanderläuft. Kürzen, wenn klar ist, was wirklich bleibt.

## Die Nahtstellen (das Interessante)

Was ein Baustein von außen braucht, ist genau das, was man beim Kopieren mitliefern muss:

- **`Knob`** – nichts. Reines DOM + SVG.
- **`KnobMetaEditor` / `ElementSettings`** – ein Objekt mit `get(key)` / `set(key, val)`.
  Der teslacoil-State kann das, muss es aber nicht sein → `lib/MiniState.js` zeigt das
  Minimum.
- **`StepSeqUI`** – dazu eine Engine mit `running`, `seqPos(which)`, `resetSeq(which)`.
  Mehr nicht. In `werkbank.js` ist das eine Attrappe mit laufendem Abspielkopf.

`MiniState.js` und `werkbank.js` sind **nicht** zum Kopieren gedacht – sie sind das
Gerüst der Werkbank, nicht ihr Inhalt.

## Noch offen

- **Die Gruppe** ist noch kein eigener Baustein: Aufbau, Einfrieren (`freezeGroup`),
  Gruppen-Settings und der Anordnen-Modus stecken in teslacoils `js/app.js`. Sie
  herauszulösen ist der nächste sinnvolle Schritt – dann sind Oszilloskop, Spektrum und
  die Crossfade-Anzeige je ein kurzer Fall davon statt drei Sonderlocken.
- `Scopes.js` liegt zwar hier, hat auf der Seite aber noch keinen Platz (braucht eine
  Audio-Quelle zum Anzeigen).
