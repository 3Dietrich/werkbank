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

## Signal-Scope: Genauigkeit (AnalyserNode) + Sync/Freeze-Buttons (20260727_111500)
Aus ddw.md, @dpa: „Die Darstellung scheint mir hin und wieder auch etwas ungenau: […]
sehr kurze Env. sie zeigt bei jedem Trigger anders, meist vergleichsweise lange Attacks,
das Dec auch, ist kaum von lin zu unterscheiden." Root Cause gefunden (lib/SignalScope.js
`sample()`): der Scope liest den Env-Wert nur EINMAL PRO FRAME (~16ms, via
`routing.getValue()` im rAF-Takt) — bei sehr kurzen Attack/Decay/Release (wenige ms, wie
@dpas reale ADSR-Configs) kann ein KOMPLETTER Envelope-Zyklus zwischen zwei Sample-Punkten
durchlaufen sein. Der Scope zeigt dann nur 1-2 zufällig getroffene Punkte der wahren Kurve
— sieht deshalb bei jedem Trigger anders aus und verwischt Kurvenformen (lin/log kaum
unterscheidbar). DAS „große" Oszilloskop (lib/Scopes.js:173) macht es richtig: ein echter
`AnalyserNode` (audio-rate, `getFloatTimeDomainData`) statt Frame-Polling. Fix wäre:
SignalScope pro Quelle (wenn es ein Audio-Node ist, z.B. die ADSR-ConstantSourceNode) an
einen eigenen AnalyserNode hängen statt nur `routing.getValue()` zu pollen — größerer
Umbau (SignalScope kennt aktuell KEINEN Audio-Graph, nur den generischen `read()`-Getter).

Zusätzlich zwei neue Panel-Buttons für den Scope (@dpa):
- **Sync**: zeigt bei jedem Beat-Schlag eine schwache senkrechte Linie im Scope; kann auch
  die Zeitbasis/Trigger-Phase des Scopes auf den Beat synchronisieren.
- **Freeze**: friert die aktuelle Scope-Ansicht ein (kein Weiterlaufen), Mouse-Over auf dem
  eingefrorenen Bild liest die Werte an der Mausposition aus.

Noch nicht geplant/umgesetzt — eigener Umbau (SignalScope.js + evtl. multiEnv.js/engine.js
für den Audio-Node-Zugriff), sizable genug für einen eigenen Anlauf.

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
