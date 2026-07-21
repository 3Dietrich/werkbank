# Werkbank – TODOs / Ideen

## Maus-Wertänderung: horizontal UND vertikal (20260717_224105)
Die „Knob ohne Knob"-Werte (drag-Werte, z.B. Transport-Settings `max. BPM`, `Anschieben`,
`Anlauf`) verändern sich derzeit nur **horizontal** beim Ziehen. @dpa will die Werteänderung
**vor allem vertikal** – und hat eine konkrete Idee, wie man *beide* Richtungen (horizontal
UND vertikal) sinnvoll für dieselbe Maus-Geste nutzen kann. Details folgen von @dpa.

## Rec-Instrument: Format-Konvertierung + Takt-Sync (20260721_144227)
Aus Grill-Session zu ddw.md Z.423-474. Reihenfolge unten einhalten (5+6 bauen auf 1-4 auf).
Bei 5/6 kein Batchen — eigener Hördurchgang, isoliert testen (Audio-Timing-Code).

1. [x] Zeitstempel-Fix: `lib/taktmetro/engine.js` von `toISOString()` (UTC) auf lokale
   Zeit umgestellt (`fileStamp()` aus `lib/fileIO.js`). Commit 9866a59.
2. [x] Settings-Button + Panel (webm/MP3/WAV-Auswahl) im Header (`⚙ Rec-Format`, analog
   zu `⚙ Config`). Globaler App-Default in taktState (`recFormat`), nicht pro Rec-Instanz.
   Commit 62a49bb.
3. [x] MP3-Encoder: lamejs vendored (`lib/vendor/lame.js`) + ESM-Fassade
   `lib/mp3Encoder.js::encodeMp3()`. **Nur CBR** (Presets 64/128/192/256/320, Mono/Stereo,
   Qualität fest=3) — **VBR bewusst nicht gebaut** (@dpa-Entscheidung 20260721): lamejs
   implementiert VBR/ABR strukturell gar nicht (fehlende IterationLoop-Klassen →
   ReferenceError), auch der Fork @breezystack/lamejs hat dieselbe Lücke; ein echter
   VBR-Algorithmus fehlt der ganzen lamejs-Familie, wäre ein eigenständiges Projekt.
   UI-Erweiterung im Rec-Format-Panel (Bitrate + Kanäle, nur bei MP3 sichtbar).
   Headless mit synthetischem Sinuston getestet (alle 5×2 Presets). Commit da1aea4.
   Encoder ist noch NICHT an recStart/recStop angeschlossen — folgt mit Schritt 6.
4. [x] WAV-Encoder: `lib/wavEncoder.js::encodeWav()` — PCM-Writer (16/32 Bit), linearer
   Resampler (22.05/24/44.1/48/88.2/96 kHz), kein Dithering. UI-Erweiterung im
   Rec-Format-Panel (Samplerate + Bittiefe, nur bei WAV sichtbar). Headless getestet.
   Commit b1b81c1.
5. [x] Start/Stop-Sync: Rec bleibt „armed" (blinkend) bis zum nächsten 0C vom Taktmetro,
   auch wenn der Takt noch gar nicht läuft. `checkRecArm()` in engine.js, `setCtrlBlink()`
   in GroupHost.js. Headless mit deterministischem Taktraster getestet. Commit 74a1190.
6. [x] Sample-genaues Trimmen: `lib/audio/trimBars.js` (reine Off-by-one-getestete Sample-
   Arithmetik, ab Sample 0 behalten/am Ende kappen) + `lib/recPostProcess.js`
   (webm→PCM→Trim→Encode-Orchestrierung), in `engine.js`s `recorder.onstop` verdrahtet.
   Als [Opus] eingestuft, mit Sonnet umgesetzt + end-to-end gegen Off-by-one abgesichert
   (@dpa-Entscheidung 20260721). Commit dbcb470.

**Rec-Instrument komplett (Schritte 1-6, Commits 9866a59..dbcb470).**

## Neues Poly-Synth-Instrument (20260721_144227)
Größter Strang, DSP-lastig. Kein Batchen — ein Change pro Hördurchgang (wie teslacoil,
[[feedback_teslacoil_arbeitsweise]]). Reihenfolge unten: 2+3 sind das Herzstück, davor macht
UI-Arbeit (5/6) wenig Sinn.

1. [Sonnet, Mittel] BaseFreq-Gruppe + Osc-Baustein aus teslacoil nach werkbank/lib/
   portieren (Pfade umschreiben, onApply(knob)-Naht, wie bisheriges Sync-Muster).
2. [Opus] Voice-Engine: Polyphonie (einstellbar), Voice-Allocation inkl. Stealing-Toggle
   (ältestes-stehlen / ignorieren, Default später @dpa), 2 Oscs/Voice mit symmetrischem
   Detune (0-99 Cent, nur bei aktivem Osc2 — sonst Osc1 exakt).
3. [Opus] BaseFreq-Quantisierung + ein globaler LP-Smooth-Knob in die Oscillator-Pitch-Kette
   einbauen (Klick-/Zipper-Vermeidung bei BF-Live-Änderungen).
4. [Sonnet, Hoch] Amp-Env: ADSR (Attack linear, Decay/Release log), Peak UND Sustain
   proportional Vel-abhängig (gleicher Faktor).
5. [Sonnet, Hoch] Keyboard-UI: mehrere Oktaven (1-9 einstellbar, Start C), Klick=Gate
   Vel127, Hold-Toggle (NoteOffs erst beim Ausschalten), MIDI-Eingabe Hold-bewusst.
6. [Sonnet, Mittel] Vel-Bereich (ausklappbar, 0=off/1-127=on) als **gemeinsame
   Zustandsquelle** mit der Tastatur (Drag ändert Note, Tastenklick setzt den Balken).
7. [Sonnet, Mittel] Dyn-Knob: `seqDyn()`-Formel aus teslacoil (`js/dsp/stepSeq.js`) 1:1 auf
   Keyboard-Velocities übertragen.
8. [Sonnet, Mittel] AkIO-Button: volle Release/Retrigger-Logik für die unter Hold
   gehaltenen Noten (gleicher NoteOff/NoteOn-Mechanismus wie Speicher-Wechsel).
9. [Sonnet, Mittel] Speicher-Slots (3x3, Anzahl einstellbar): Schreibmodus-Umschalter
   (rötlich eingefärbt) + Rechtsklick zum Speichern, Klick zum Abrufen (kurz NoteOffs +
   neue NoteOns beim Wechsel). Interaktion nach Bau mit @dpa ausprobieren/justieren.

## Gruppen-UI: Größen-Änderungs-Hinweis (20260721_144227)
Klein, mit anderen UI-Backlog-Punkten aus ddw.md batchbar.

1. [x] Control-Hint (lineare Gate-ASR-Anzeige [0.5,2,0.5]s, `lib/SizeHint.js`) bei
   Größenänderung durch Gruppe/Instrument, NICHT bei manuellem Resize. Doppelklick =
   global „zeig nicht mehr" (ein State-Flag `sizeHintDismissed`, kein pro-Control-Flag).
   Headless getestet. Commit cfed679. Hinweis: bei vielen Controls gleichzeitig
   überlappen sich die Blasen sichtbar — ggf. auf Sammel-Blase umstellen, @dpas Ohr/Auge.

(Header-Farbe vs. Eingabefarbe aus ddw.md Z.449: kein Bug, war Opazität — erledigt, kein Task.)
