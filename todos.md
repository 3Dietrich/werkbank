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
2. [x] Voice-Engine (`lib/polysynth/engine.js`): `noteOn(note,velocity)`/`noteOff(note)`
   (note = MIDI-Nr., natürlich für die spätere Tastatur/MIDI-Anbindung in Schritt 5) mit
   Map note→Voice, sodass noteOff GENAU die eigene Voice freigibt. Einstellbare Polyphonie
   (`polyMax`) + Voice-Stealing-Toggle (`voiceSteal`: AN = ältestes sanft stehlen, AUS =
   neue Note ignorieren; Default „stehlen" = bisheriges SquareOsc-Verhalten, finaler
   Default noch @dpa nach dem Hören). 1 Osc EXAKT auf der Note, ODER (Toggle `osc2On`) 2
   Oszillatoren symmetrisch ±detune/2 Cent verstimmt (`detune` 0-99 ct) — bei Osc2=aus
   wirklich nur EIN Node. Gate-Amp-Env (Anti-Klick-Attack → Sustain bis noteOff → kurzes
   Release), bewusst KEIN volles ADSR (das ist Schritt 4). Wellenform gebacken mit denselben
   Bausteinen wie SquareOsc (`audio/pulseWave.js`). Neue Controls in `defs.js` (Audio-Osz).
   Headless per Playwright/AnalyserNode verifiziert: noteOn RMS≈0.20 → noteOff→0; 3 Noten
   gleichzeitig held=3 (RMS≈0.36); polyMax=2 stehlen → held=2 (ältestes im Release);
   ignorieren → held=2, 3. noteOn=null; Osc2 aus=1 Node/Voice, an=2 Nodes/Voice, keine
   Konsolenfehler. Commit d809197.
3. [x] BaseFreq-Quantisierung: gespielte Noten rasten per `harmonizeMix` (0=roh, 1=voll) aufs
   Harmonie-Raster um die effektive BaseFrq — Überblendung `raw*(1-mix)+harmonicSnap(raw,baseHz)*mix`
   EXAKT wie teslacoils `quantizeToScale` (kein neuer Toggle: `harmonizeMix=0` IST das A/B-„aus";
   `harmonizeMix` war schon da, jetzt verdrahtet). `spawnVoice` greift die quantisierte statt der
   rohen Frequenz. Globaler LP-Smooth gegen Klick/Zipper: ändert sich BaseFrq (`baseSrc`/`baseHz`/
   `baseBand`/`baseNote`) oder `harmonizeMix` LIVE, zieht `retuneHeld()` alle GEHALTENEN Voices per
   `setTargetAtTime` weich auf die neue Zielfrequenz nach (Osc2-Verstimmung bleibt) — neuer Knob
   `pitchSmooth` (Base-Frq-Gruppe, 0–1 s, τ=Wert/3), `0` = harter Sprung. Auslaufende Voices und der
   initiale Anschlag bleiben unberührt. Headless per Playwright (Osc-`frequency` direkt gemessen):
   harmonizeMix 0→261.6 Hz roh, 1→275 Hz gerastet; baseHz 55→40 live: `pitchSmooth=0.2` @50ms 277.8 Hz
   (Rampe), @350ms 280 Hz angekommen; `pitchSmooth=0` @50ms schon 280 Hz (Sprung); keine Fehler. Commit 67612b9.
4. [x] Amp-Env: echtes ADSR pro Voice (`ampAttack`/`ampDecay`/`ampSustain`/`ampRelease`, neue
   Gruppe „Amp-Env") statt der alten festen Anti-Klick-Rampe. Attack linear (0→Peak), Decay/
   Release log/exponentiell (`exponentialRampToValueAtTime`, wie SquareOsc-Release/teslacoil-ASR).
   `releaseVoice` greift per `cancelAndHoldAtTime` den AKTUELLEN Gain-Wert ab (egal ob noch im
   Attack/Decay oder schon im Sustain) und rampt von dort — kein Sprung. Peak UND Sustain-Level
   hängen an DERSELBEN Velocity-Skalierung (`velScale`), kein zweiter Vel-Bezug für Sustain.
   Defaults (0.01/0.15/0.7/0.3) ein plausibler Startpunkt, @dpa stellt nach dem Hören ein.
   Headless per Playwright (AnalyserNode-RMS über die ADSR-Phasen): Attack steigt (RMS 0→0.087→
   0.242), Decay landet nahe Sustain-Anteil (0.127 ≈ 0.242·0.5), Release fällt exponentiell
   (0.0076 bei 33 % der Release-Zeit, deckt sich mit der Rechnung) und endet bei 0; heldCount
   nach noteOff = 0; keine Konsolenfehler.
5. [x] Keyboard-UI (`lib/polysynth/ui/PlayKeyboard.js`, neue Gruppe „Keyboard"): eigenständiges
   Widget (kein GroupHost-Control, wie BaseKeyboard — als weiteres Kind in `#polysynth`
   gehängt, skaliert/bewegt sich mit den Gruppen). `kbOctaves` (1-9, Start C4=MIDI 60
   aufwärts, Zeilen gestapelt statt einer 12×N-breiten Zeile — nutzt die 12-Spalten-Grid-CSS
   unverändert). Klick = Gate mit fester Velocity 127. `kbHold`-Toggle: `_gateOff()` hält
   `engine.noteOff()` zurück, solange Hold an ist (Note klingt weiter) — läuft erst nach,
   wenn Hold wieder ausgeht (`_onHoldChange`). Rohe Performance-MIDI (eigener, von
   `keymidi/Midi.js` unabhängiger `requestMIDIAccess()`) läuft durch DIESELBEN
   `_gateOn`/`_gateOff` → Hold-bewusst für Maus UND MIDI gleichermaßen. Globaler
   `window`-mouseup fängt das Loslassen auch außerhalb der Taste (Drag-Release).
   Headless per Playwright: 36/60 Tasten bei kbOctaves 3/5; mousedown→heldCount 1 +
   `kb-active`; globales mouseup→heldCount 0; bei Hold AN bleibt heldCount nach Loslassen
   bei 1 (klingt weiter); Hold AUS→heldCount 0, `kb-active` weg; keine Konsolenfehler.
   MIDI-Hardware-Eingang selbst ist headless nicht simulierbar (wie beim bestehenden
   Control-Learn) — Code-Pfad ist aber identisch zum verifizierten Maus-Gate.
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

## Instrumente vereinheitlichen + Poly-Synth-Nacharbeiten (@dpa 20260721_203557)
Reihenfolge unten einhalten (1+2 legen die Regeln/Doku fest, auf denen 3 aufbaut).
Kern-Regel dahinter (unbedingt merken, gilt ab jetzt für ALLES in Werkbank, s. ddw.md):
„Bitte nichts mehr einfach so dazustellen. Wenn Du nicht weißt, ob Control oder ism
(=Instrument), oder… frag mich. Aber alles hat hier seine Module." Hauptsatz fürs ganze
Projekt: „Eine der Hauptaufgaben ist in Werkbank: modulare Synthesizer gebären."

1. [ ] [Sonnet] Instrument-Header vereinheitlichen (`lib/InstrumentSettings.js`), Vorbild
   Takt/Metronom: Name fett/weiß + BG (schon ok) bleiben, die Zeile mit der Datei-Info
   (z.B. „taktmetro/defs.js · group/GroupHost.js") kommt WEG und wandert stattdessen in
   das `[?]` oben rechts (das bleibt). Gilt für ALLE drei Instrumente gleich. Neue
   Settings am Instrument: Name (umbenennbar), Breite/Höhe (0 = auto). Wunsch zusätzlich
   im `[?]`: ein Edit-Symbol, das die Hilfe direkt als Markdown editierbar macht.
2. [ ] [Doku] `werkbank/CONTROLS.md` anlegen, Vorbild `teslacoil/docs/CONTROLS.md`
   (Control-Sorten k:/s:/t:/x:/n:/b:/u: + was jede Sorte an Settings mitbekommt). Zusätzlich
   ergänzt um Werkbanks eigene Modul-Taxonomie: **Control** (generisches Bedienelement,
   Rechtsklick-Settings via `registerCtrlStyle()`), **Instrument** (von @dpa „ism"
   abgekürzt — eigener State+defs+engine+GroupHost-Mount, z.B. `lib/polysynth/`), **DSP-
   Baustein** (audio/dsp-Ordner, 1:1 kopierbar, kein eigenes UI). Ergänzt die bestehende
   `ARCHITEKTUR.md`-Karte um genau diese Typ-Frage — Ziel: die Klassifizierung eines neuen
   Teils muss nachschlagbar sein, nicht geraten werden (s. Kern-Regel oben).
3. [ ] [Sonnet] Poly-Synth-Keyboard zu einem echten Control nachziehen (aktuell
   `lib/polysynth/ui/PlayKeyboard.js` ist ein freistehendes Widget OHNE Rechtsklick-
   Settings — das war der Auslöser für die Kern-Regel oben, muss korrigiert werden):
   - `u:`-Präfix + `registerCtrlStyle()` wie teslacoils `u:baseKeys`/`u:keyboard`,
     Settings analog Base-Frq-Keyboard (Größe/Farben je Taste, Tastenabstand).
   - Gehört strukturell in die GroupHost-Gruppe „Keyboard" (aktuell nur lose als
     Geschwister-Element neben dem Panel gehängt).
   - Neuer Control: Oktav-Start (welches C fängt die unterste Taste an — aktuell hart
     auf C4/MIDI 60 verdrahtet in `PlayKeyboard.js`/`BASE_MIDI`).
   - Bugfix Hold: bei `kbHold`=an soll ein Klick auf eine bereits klingende (gehaltene)
     Note sie AUSSCHALTEN (Toggle), nicht retriggern — `_gateOn`/`_gateOff` brauchen dafür
     eine Fallunterscheidung „ist diese Note gerade durch Hold gehalten?".
4. [ ] [Sonnet] Base-Frq-Gruppe: Test-Ton-Schalter + Test-Vol-Knob (und die Technik
   dahinter, `applyTestOsc`/`refreshTestFreq`/`refreshTestLevel`/`testOsc` in
   `lib/polysynth/engine.js`, `baseTestOn`/`baseTestLevel` in `defs.js`) komplett entfernen
   — war die Schritt-1-Übergangslösung („stumm ist nur die Fassade"), jetzt durch die
   echte Voice-Engine (Schritt 2-5) überflüssig.

## Offen aus ddw.md Z.481-499 (noch nicht angegangen)
- Maus-Wertänderung horizontal+vertikal (siehe oben, wartet weiter auf @dpas Idee-Details).
