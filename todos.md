# Werkbank – TODOs / Ideen

## Combo-Factory mit Größe/Position + definierbarer Initial-Layout (@dpa 20260804)
Beobachtung (Screenshot pitchosc, Amp-/Pitch-ADSR nach Umbau): neu erstellte/wieder
aufgebaute Gruppen rendern zunächst groß/simpel/überlappend statt in der von @dpa mühsam
per Hand eingestellten kompakten Optik — nach jedem Umbau muss die Optik neu gesetzt
werden. Gewünscht: (1) vorgefertigte Combo-„Factory-Einstellungen" (Größe/Anordnung, nicht
nur Werte), die beim Ersteinrichten schon zur Auswahl stehen, s. lib/groupPresetFactory.js
(bisher NUR Snapshots/Werte, bewusst keine Combos — Begründung im Datei-Kopf: Combo-Payload
kommt aus LIVE-DOM, lässt sich nicht ohne Weiteres von außen vorbauen); (2) eine
definierbare Initial-Einstellung (Größe/Position), die eine Gruppe beim allerersten
Erstellen automatisch bekommt, statt am generischen Auto-Placement-Default zu hängen.
Der ursprünglich vermutete Zusammenhang mit dem Initial-Render-Overlap-Bug ist inzwischen
geklärt (Bug gefixt, `placeLateUnit()` in GroupHost.js, 20260804) — diese Idee bleibt
unabhängig davon offen.

## Smoke-Test-Altlast: noch rote Alt-Tests (Stand 20260804)
Wurzel: gewachsene `presets/werkbank-config.json` lässt hartcodierte Test-Annahmen altern
(Pool-Index/Default-Namen verschieben sich). Noch nicht einzeln root-gecaust:
adsrGateButtonClick_smoke, adsrGateTrigPhase_smoke, adsrGateVisibility_smoke,
adsrKette_smoke, adsrLenFest_smoke, chordMemorySnapshot_smoke, ddw_20260724_192304_smoke,
ddw_feedback_fixes_smoke, phase4a_seqsync_smoke, seqFillSet0_style_smoke, seqLenKnob_smoke,
seqOutput_smoke, signalScope_smoke, sqAddDefault_smoke, tempoStartContinue_smoke,
seqElementsMovable_smoke.

## Signal-Scope Sync/Freeze: Doku-Nachlauf + EN-Hints (20260804)
Kern gebaut und smoke-getestet (lib/SignalScope.js Sync-Tap/Trigger-Drag/Freeze,
lib/scope/triggerSync.js pure Trigger-Mathematik + node-Tests, lib/scope/multiScope.js
echte Sync-/Freeze-Buttons + Trigger-Pos-/Sync-Offset-Knobs, taktmetro/engine.js
onClockBeat als Listener-Liste, test/signalScopeSyncFreeze_smoke.py). Zwei Reste:
- `ARCHITEKTUR.md`/`docs/CONTROLS.md` erwähnen den neuen Sync-Tap-Mechanismus noch nicht
  (doc-sync-Skill als Nachlauf).
- Die deutschen Hover-Hints der vier neuen Controls (Sync/Freeze-Buttons, Trigger-Pos-/
  Sync-Offset-Knobs) haben keine EN-Entsprechung in lib/i18n.js — die Labels selbst sind
  bewusst rein englisch/technisch (kein Eintrag nötig, Projekt-Konvention), aber die
  längeren Hilfstexte (`title`/`info` in lib/scope/multiScope.js) bleiben im EN-Modus
  deutsch, bis dafür eigene i18n.js-Einträge ergänzt werden.

## Pre-Latenz-Budget über Modul-Ketten (20260804, aus Sync-Grill-Runde ausgekoppelt)
@dpa, aus der Signal-Scope-Sync-Diskussion weitergedacht: „Ich denke dabei an Inputs, die
auf der Zeitskala (mithilfe von Scope) verschoben werden können. Das Modul mit der
*höchsten* Pre-Latenz bestimmt dessen Ketten- oder Master-Mindest-Pre-Latenz." Eigenes,
großes Architektur-Thema (projektweite Latenz-Kompensation über Modul-Ketten, nicht nur
der lokale Sync-Offset-Knob am Scope, der nur den ANZEIGE-Referenzpunkt verschiebt) —
bewusst NICHT Teil des Sync/Freeze-Umbaus, noch nicht geplant.

## Scope-Sync: geteilter Ringpuffer pro Quelle (Perf-Optimierung, 20260804)
Aktuell bekommt JEDE Scope-Instanz im Sync-Modus ihren EIGENEN ScriptProcessorNode-Tap,
auch wenn mehrere Scopes dieselbe Quelle zeigen (bewusste Entscheidung der Grill-Runde,
„Mehrspur-Prinzip", weniger Lifecycle-Komplexität). Falls das mal CPU-relevant wird: ein
geteilter Ringpuffer pro Quelle (referenzgezählt) wäre die Optimierung — noch nicht nötig.

## Spezialgruppen: Panel↔Settings-Umschalter je Control (20260726_221800)
Eigenes Architektur-Thema (opera-Subagent?), aus ddw.txt: bei „Spezial-Gruppen" wie Seq
oder ADSR soll jeder Control per Icon-Button umschaltbar sein zwischen A) auf dem Panel
sichtbar und B) in den Settings (Rechtsklick-Popup) untergebracht. Heuristik für den
Ausgangszustand: was schon immer „Gruppensetting" war (Breite/Höhe/Größe, VG/BG-Farbe
usw.) bleibt in den Settings; alles andere ist „aufs Panel zuschaltbar", Default=off.
@dpa offen: erst an einem Standard-Fall durchprobieren, bevor es überall umgesetzt wird,
oder ist es dank Modularität gar nicht so viel Aufwand? Noch nicht bewertet/geplant.

## Maus-Wertänderung: horizontal UND vertikal (20260717_224105)
Die „Knob ohne Knob"-Werte (drag-Werte, z.B. Transport-Settings `max. BPM`, `Anschieben`,
`Anlauf`) verändern sich derzeit nur **horizontal** beim Ziehen. @dpa will die Werteänderung
**vor allem vertikal** – und hat eine konkrete Idee, wie man *beide* Richtungen (horizontal
UND vertikal) sinnvoll für dieselbe Maus-Geste nutzen kann. Details folgen von @dpa.

## Poly-Synth-Nacharbeiten (@dpa 20260721_144227)
Rest aus dem Poly-Synth-Strang (Kern/Voice-Engine/Amp-Env/Keyboard sind fertig). Kein
Batchen — ein Change pro Hördurchgang.

1. [Sonnet, Mittel] Vel-Bereich (ausklappbar, 0=off/1-127=on) als **gemeinsame
   Zustandsquelle** mit der Tastatur (Drag ändert Note, Tastenklick setzt den Balken).
2. [Sonnet, Mittel] Dyn-Knob: `seqDyn()`-Formel aus teslacoil (`js/dsp/stepSeq.js`) 1:1 auf
   Keyboard-Velocities übertragen.
3. [Sonnet, Mittel] AkIO-Button: volle Release/Retrigger-Logik für die unter Hold
   gehaltenen Noten (gleicher NoteOff/NoteOn-Mechanismus wie Speicher-Wechsel).
4. [Sonnet, Mittel] Speicher-Slots (3x3, Anzahl einstellbar): Schreibmodus-Umschalter
   (rötlich eingefärbt) + Rechtsklick zum Speichern, Klick zum Abrufen (kurz NoteOffs +
   neue NoteOns beim Wechsel). Interaktion nach Bau mit @dpa ausprobieren/justieren.
