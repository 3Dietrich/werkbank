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

1. [x] BaseFreq-Gruppe + Osc-Baustein aus teslacoil nach `werkbank/lib/polysynth/`
   portiert (dsp/fft+holdSlide, audio/pulseWave+SquareOsc unverändert; pitch/Scaler
   getrimmt auf reine BaseFreq-Funktionen; ui/BaseKeyboard portiert, noch nicht
   gemountet — braucht die Voice-Engine). `polysynth/defs.js` + neue Instrument-Sektion
   `#bench-polysynth`. Portierte Mathematik headless gegen bekannte Werte getestet,
   Mount per Playwright geprüft (Controls, State-Bindung, Reload-Persistenz,
   Header-Tasten/MIDI-Schalter). Commit 4cae0a5.
   **Korrektur @dpa 20260721 (ddw.md Z.481-499):** „das Thema hier ist Audio, stumm ist
   nur die Fassade — sinnlos" — Chat-Stopp direkt danach war falsch (s.
   [[feedback_nicht_zu_frueh_stoppen]]). Nachgezogen: `lib/polysynth/engine.js` macht
   den Test-Ton (baseTestOn/baseTestLevel) zu echtem, hörbarem Sinus auf der effektiven
   BaseFreq — headless per AnalyserNode verifiziert (RMS>0, echtes Signal). Commit d80799d.
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

## Gruppen-UI: Größen-Änderungs-Hinweis (20260721_144227, korrigiert 20260721_162648)
1. [x] Erster Versuch (Commit cfed679, flüchtige Blase AM Control bei der Skalierungs-
   ÄNDERUNG) war **falsch** — @dpa: „Der Hinweis soll in den control settings
   erscheinen, und zwar immer wenn man control settings aufruft (bis man es global
   dismissed hat)." ASR-Timing [0.5,2,0.5]s war schon richtig, nur der Ort/Auslöser
   nicht. Korrigiert: Hinweis erscheint jetzt IM Settings-Panel (KnobMetaEditor/
   ElementSettings), bei JEDEM Öffnen erneut, solange Gruppe ODER Instrument skaliert
   ist (`opts.instrumentScaled()`). Doppelklick = global „zeig nicht mehr"
   (`sizeHintDismissed`). Headless getestet (kein Hinweis ohne Skalierung, Hinweis bei
   jedem erneuten Öffnen, nicht bei unbetroffenen Controls, Dismiss dauerhaft+Reload-fest).
   Commit 6aec5b3.

## Instrumente allgemein (@dpa 20260721_162648)
1. [x] Instrument-Settings generalisiert: BG-Farbe + Größe % wie bei Gruppen
   (`lib/InstrumentSettings.js`, ersetzt den taktgeber-Einzelbau), für alle drei
   Instrumente (Takt/Metronom, Poly-Synth, Rec). Commit 4680648.
2. [x] Verschieben via Header: erster Drag hebt das Instrument aus dem Grid-Fluss in
   position:absolute (an der aktuellen Stelle, kein Sprung), Position überlebt den
   Reload. Gleicher Commit (4680648).
3. [x] Rec ist jetzt ein EIGENES Instrument, nicht Teil von Poly-Synth oder
   Takt/Metronom (`lib/recInstrument/`) — Grund: Rec soll „alles Hörbare" aufnehmen,
   nicht nur ein Instrument. Dafür neuer gemeinsamer Audio-Bus (`lib/audioBus.js`,
   EIN AudioContext für alle Instrumente statt je einem eigenen). Start/Stop-Sync
   hängt weiterhin am Takt (`taktEngine.onClockBeat()` nach außen gereicht). Headless
   verifiziert: alle Instrumente teilen denselben Context/Master (Identitätsvergleich),
   Rec-Zyklus (webm+MP3) funktioniert nach der Extraktion unverändert. Commit b39a57a.

(Header-Farbe vs. Eingabefarbe aus ddw.md Z.449: kein Bug, war Opazität — erledigt, kein Task.)

## Offen aus ddw.md Z.481-499 (noch nicht angegangen)
- Maus-Wertänderung horizontal+vertikal (siehe oben, wartet weiter auf @dpas Idee-Details).
