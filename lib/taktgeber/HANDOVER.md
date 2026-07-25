# HANDOVER – Taktgeber (Stand 2026-07-17 ~18:30)

## Auftrag / Ziel
Umbau der **Transport-Settings** des Taktgebers nach [ddtakt.md](ddtakt.md) (Blöcke ab
`20260717_151145`, IDE-Auswahl Z. 49–79) sowie die anschließenden Test-Rückmeldungen von
@dpa. Der geplante **teslacoil-Transport-Port ist zurückgestellt** – stattdessen kommt die
Eltern-Integration in die **Werkbank** (s. unten „Nächste Schritte").

## Aktueller Stand (fertig + headless getestet, 4 Commits im Taktgeber-Repo)
Alles in `~/Music/KI_html/taktgeber/` (eigenes Git-Repo, Branch `main`, kein Remote gesetzt).

- **„Technik"-Überschrift → sanfter Strich** (`.p-div`).
- **max. BPM / Anschieben / Anlauf: gezogener Wert statt Fader** („Knob ohne Knob",
  `dragValue` in [ui.js](ui.js), Flag `drag:true` in [modules.js](modules.js)).
- **Hint auf jedem Settings-Teil** (`gridRow(..., info)`).
- **Shortcut-Belegung**: reine Modifikatoren werden beim Belegen durchgelassen (nicht
  gefangen) → Shift+1 belegt „!", „1" kommt durch, „meta" nicht mehr. **Case-sensitiv**:
  `Shift+S` = eigene Belegung „S", verschieden von „s" (roher `e.key`, kein `toLowerCase`
  – in ui.js UND `evKey` in [index.html](index.html)).
- **Anzeige**: Taste genau wie gespeichert (klein), **leer bleibt leer** (kein „—"), und
  `.kb` hält per `min-height` die Zeilenhöhe.
- **Kleines × neben jeder Belegung** löscht auf „nichts".
- **MIDI-Learn für ALLE Controls** ([midi.js](midi.js)): Bindungen im State
  (`midiBindings`), note/cc-Dekodierung, Flankenerkennung. Ziele = Wert-Controls (State-Key,
  CC→skaliert) und Knopf-Actions (`act`-id, steigende Flanke; Bremsen/Anschieben momentan).
  **UI: 🎹-Icon am Control** (Settings + Körper, erscheint beim Überfahren, belegte bleiben
  sichtbar) öffnet ein **Banner**, das der ganze Editor ist: Bindung, **Kanal als ziehbarer
  0–16-Wert (0=alle, später verstellbar)**, „neu", Löschen. **Kein MIDI mehr im
  Rechtsklick-Popover** (@dpa: „Untermenü … kann weg"). ESC nimmt eine Ebene nach der
  anderen (erst Banner, dann Fenster).

## Tests
- `python3 test/smoke.py` (Playwright headless, Server auf Port 8137) – **grün**. Deckt
  Strich, dragnum, MIDI-Icons/Banner, case-sensitive Shortcut, leere-Höhe, kein
  Popover-Untermenü ab. **Hard-Kill nach 45 s** (kein Pollen, s. Memory).
- `node test/state.test.mjs` (12) + `node test/tapTempo.test.mjs` (16) – grün.
- **Echtes MIDI-Routing ist headless nicht fahrbar** – braucht @dpas Gerät.

## Offen / nächste Schritte
1. **@dpa hört/prüft den Taktgeber** (Audio nur im echten Browser:
   `cd ~/Music/KI_html/taktgeber && python3 -m http.server 8000` → localhost:8000).
2. **Werkbank-Integration** (`~/Music/KI_html/werkbank/`): die Taktgeber-Gruppe als
   Baustein hosten, „so wie es in teslacoil eingebaut wird", **Takt/Metronom als
   Test-Verbraucher**. Nahtstelle liegt vor: `state.js` (SSOT, exportValues/exportSettings)
   + `modules.js` (Manifest) + generisches `ui.js`. Offen laut Werkbank/README: „die Gruppe
   als eigener Baustein". Memory: `project-taktgeber-werkbank-port`.
3. **teslacoil-Transport-Port** (Rechtsklick auf [Start,!,!!] → Settings ohne Rahmen/Ansicht,
   „Rest s.o.") – **bewusst zurückgestellt**, teslacoil bleibt unangetastet.
4. Bewusst offen gelassen: MIDI-Trigger für „Beats/Takt" (Präfix-Taste, kein `act`).

## Entscheidungen/Fakten (nicht aus Code ableitbar)
- Taktgeber ist das „Netzteil an der Werkbank" (steht daneben, liefert Takt, ist aber auf
  der Werkbank bearbeitbar) – Werkbank/README, @dpa 20260717.
- Kein Speicher/Persistenz im Taktgeber selbst ist OK, solange die Grundlagen modular für
  vollständigen Recall im Eltern-System vorliegen (@dpa).

## Start-Prompt für den Folgechat
„Taktgeber ist fertig + getestet (HANDOVER.md). Nächster Schritt: die Taktgeber-Gruppe als
Baustein in die Werkbank (`~/Music/KI_html/werkbank/`) integrieren, so wie sie später in
teslacoil säße, mit Takt/Metronom als Test-Verbraucher. teslacoil dabei NICHT anfassen."
