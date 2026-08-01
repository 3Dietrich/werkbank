# Bestand — was aktuell existiert

> Anders als [CONTROLS.md](CONTROLS.md) (erklärt die Sorten/Regeln) ist dies eine
> **Inventarliste des Ist-Zustands**: welche Controls, Gruppen und ISMs es aktuell im
> Werkbank-Pool gibt. Wird veraltet, sobald neue Module dazukommen — bei Zweifel gegen den
> Code prüfen, nicht blind vertrauen. Stand: 2026-08-01.

## Controls (Sorten)

Acht generische Sorten, gelten für jedes ISM gleich — Details, Rechtsklick-Settings und
Button-Modi in [CONTROLS.md](CONTROLS.md#die-sorten).

| Präfix | Sorte | defs-Feld |
|---|---|---|
| `k:` | Knob / Fader | `KNOBS` |
| `s:` | Menü-Schalter | `SELECTS` |
| `g:` | Segment-Knopfreihe | `SEGMENTS` |
| `t:` | Schalter (an/aus) | `TOGGLES` |
| `x:` | Schrift-Eingabe | `TEXTS` |
| `n:` | Notiz (kein Wert) | `NOTES` |
| `b:` | Button | `BUTTONS` |
| `u:` | Anzeige/Eigenbau (frei platzierbar) | `displays` |

Freistehende `u:`-Eigenbau-Controls, die wie ein Instrument aussehen, aber als Control bedient
werden (Rechtsklick-Settings, e-Mode, Tasten/MIDI): `lib/polysynth/ui/PlayKeyboard.js`
(Spiel-Tastatur), `lib/stepseq/ui/StepSeqGrid.js` (Step-Muster), `lib/LevelMeter.js` (Pegel-
Canvas), `lib/SignalScope.js` (einzelnes Scope). Sind keine eigenen ISMs, s. Erkennungsmerkmal
in [CONTROLS.md](CONTROLS.md#die-drei-modul-sorten-der-werkbank).

## Gruppen

Normale Gruppen entstehen aus `GROUPS` in einem ISM-`defs.js`, bekommen Header, BG,
Rechtsklick-Settings (Name/BG/VG/Breite/Höhe), Combos (Optik-Pool) + Snapshots (Werte-Pool).

| ISM | Gruppen |
|---|---|
| Takt/Metronom | `Transport / Tempo`, `Takt / Metronom` |
| Poly-Synth | `Base-Frq`, `Audio-Osz`, `Amp-Env`, `Keyboard`, `Multi-ADSR` |
| Stepsequenzer | `Stepsequenzer` |
| Rec | `Aufnahme` |

### Sonder-Gruppen (weichen von der normalen Gruppen-Logik ab)

| Sonderfall | Wo | Abweichung |
|---|---|---|
| **Meter** (LevelMeter/"Out-Meter") | `werkbank.js` (LevelMeter-Block), `css/werkbank.css` (`.wb-bare`, `#levelmeter`) | Eine einzige, leere Gruppe (`GROUPS:[{name:'Meter'}]`) — Header/BG per CSS weggestylt, `#bench-levelmeter{position:fixed;inset:0;pointer-events:none}` nimmt sie komplett aus dem `#app`-Grid-Fluss (nur der Pegel-Balken selbst ist klickbar). Kein `defs.js`/`engine.js`, keine eigene `InstrumentSettings`-Instanz — laut Checkliste kein vollwertiges ISM, nur eine Control-Hülle. |
| **Scope-Gruppen** (`Scope_0`, `Scope_1`, …) | `werkbank.js` (Signal-Scopes-Block), `lib/scope/multiScope.js` | Werden zur Laufzeit per Header `+`/`−` erzeugt/gelöscht (wie Multi-ADSR/Multi-Sq). Kein Routing-Output/Input-Port, keine `write()` — lesen passiv per `routing.getValue()`. Haben trotz fehlendem klassischem `engine.js` eine eigene `InstrumentSettings`-Instanz → zählen funktional als ISM. |

## ISMs

| ISM | defs.js / engine.js | Kurz | In |
|---|---|---|---|
| **Takt/Metronom** | `lib/taktmetro/defs.js` / `engine.js` (`createTaktEngine`) | Transport (Start/Bang/Tap-Tempo) + Metronom-Klang (`lib/taktgeber/audio/`: clock, metro, tapTempo). Liefert `onClockBeat`, das Rec/Stepseq für Sync brauchen. | `index.html`, `werkbank-leer.html` |
| **Poly-Synth** | `lib/polysynth/defs.js` / `engine.js` | Polyphone Voice-Engine: Base-Frq/Kammerton, Osc2/Detune, ADSR pro Stimme, Spiel-Tastatur (`u:playKb`), Chord-Memory, Multi-ADSR (`lib/polysynth/multiEnv.js`, vervielfältigbare Envelopes). | nur `index.html` |
| **Stepsequenzer** | `lib/stepseq/defs.js` / `engine.js` (`createStepSeqEngine`) | Eigener Trigger-Takt (an Takt-Tempo gekoppelt via Teiler/Multiplikator), feuert auf Poly-Synth. Step-Muster als `u:seqGrid`-Unikat-Control. | nur `index.html` |
| **Rec** | `lib/recInstrument/defs.js` / `engine.js` (`createRecEngine`) | Nimmt den gemeinsamen Master-Bus auf (alle Instrumente zusammen). Start/Stop synct auf den nächsten Downbeat von Takt/Metronom. Formate webm/mp3/wav über Header-Menü. | `index.html`, `werkbank-leer.html` |
| **LevelMeter / "Out-Meter"** | kein eigenes defs/engine — `lib/LevelMeter.js` + bare `mountGroups` (s. Sonder-Gruppe oben) | Senkrechter Canvas-Pegelbalken (RMS+Peak-Hold), zapft den Audio-Bus (`lib/audioBus.js`) nach dem Master-Fader ab. | `index.html`, `werkbank-leer.html` |
| **Signal-Scopes** | `lib/scope/multiScope.js` (`createScopeManager`) + `lib/SignalScope.js` (s. Sonder-Gruppe oben) | Vervielfältigbare schmale Oszilloskope, wählen per Menü eine beliebige Routing-Quelle (`routing.outputSources()`) und zeigen sie passiv an (Buffer/Auto-Range/Kurve/Meter). | `index.html`, `werkbank-leer.html` |

**Toter Code:** `lib/Scopes.js` (Master-Bus-Oszilloskop+Spektrum, aus teslacoil) wird nirgends
importiert — nicht verwechseln mit den aktiven Signal-Scopes oben.

Welche HTML-Einstiege es gibt und was sie jeweils enthalten: [ARCHITEKTUR.md](../ARCHITEKTUR.md#einstiegspunkte-pool).
