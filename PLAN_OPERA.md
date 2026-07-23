# PLAN_OPERA.md — Werkbank-Sanierung + modularer Ausbau

> Erstellt 20260723 (Opera/Opus 4.8) als Antwort auf ddw.md-Auftrag 20260723_004305 +
> 20260722_233428. Weichen von @dpa gesetzt: **(1)** Port-Modell als gemeinsames Fundament ·
> **(2)** erst aufräumen, dann Bugs, dann Features · **(3)** Struktur-Ansicht read-only zuerst.
> Arbeitsteilung: **Opera** = Architektur/Design (dieses Dokument + Nähte), **Sonnet** = klar
> spezifizierte Umsetzungspakete pro Phase gegen die geschärfte ISM-Checkliste, Playwright-verifiziert.

## Leitgedanke

Fast alle offenen Wünsche sind **ein** Thema: ein modulares **Port-/Routing-Modell**
(typisierte Aus-/Eingänge pro ISM). ISM-Latenz, Struktur-Ansicht, Stepseq-In/Out,
Oszillator/Spektrometer-Module setzen alle darauf auf. Darum erst das Fundament, damit
nicht wieder Insellösungen entstehen (das war die Ursache der jetzigen Unordnung).

---

## Phase 0 — Fundament in Ordnung bringen (zuerst)

**Ziel:** saubere, konsistente ISM-Basis; Altlasten raus; werkbank.js zurück Richtung „dünn".

### 0.1 ISM-Konstrukt vereinheitlichen (der Kern-Vorwurf)
- **Befund:** [docs/CONTROLS.md](docs/CONTROLS.md) definiert ISM = `defs.js` + **`engine.js`**
  (Factory `createXEngine()`). taktmetro/polysynth/recInstrument halten sich daran; **stepseq
  bricht aus**: `lib/stepseq/StepSeqEngine.js` ist eine Klasse (`new StepSeqEngine`) mit
  abweichendem Dateinamen.
- **Fix:** `lib/stepseq/StepSeqEngine.js` → `lib/stepseq/engine.js` mit
  `export function createStepSeqEngine(state, opts)` — gleiche Naht wie die anderen drei.
  Aufruf in werkbank.js angleichen.

### 0.2 Kopplung ans Altteil lösen
- **Befund:** `lib/stepseq/defs.js` importiert `makeSeqSteps` aus der alten `lib/stepSeq.js`
  (teslacoil „Filter & Amp"). `engine.js` importiert `SEQ_MAX`, `seqAdvance` von dort.
- **Fix:** die genutzten Helfer nach `lib/stepseq/seqCore.js` ziehen (nur was das ISM braucht),
  Importe umbiegen. Danach ist `lib/stepSeq.js` verwaist.

### 0.3 Leichen entfernen
- `lib/StepSeqUI.js` (alt) + `fakeEngine`-Attrappe (werkbank.js ~Z.162-172) + Sektion
  `#bench-seq` — Schaukasten-Rest, durch das echte Stepseq-ISM ersetzt. **Raus.**
- `lib/stepSeq.js` — nach 0.2 verwaist. **Raus.**
- Tote versteckte Demo-Sektionen (`wb-hidden`): `#bench-knob`, `#bench-ctrls`, `#bench-keys`,
  `#bench-scratch` + zugehöriger Demo-Code in werkbank.js (DEMO_KNOBS/Select/Toggle/Readout,
  ~Z.62-154). **→ RÜCKFRAGE R2 (dürfen die als Schaukasten-Doku weg?).**
- Erwartetes Ergebnis: werkbank.js von **913 Z. → ~350-450 Z.** (ARCHITEKTUR.md nennt 224 als
  Soll — realistisch nicht mehr ganz, aber wieder „dünn").

### 0.4 ISM-Checkliste verbindlich schärfen
- In [docs/CONTROLS.md](docs/CONTROLS.md) die Namens-/Muster-Konvention hart machen:
  `engine.js` + `createXEngine()`-Factory ist Pflicht, keine Klassen-Sonderform.
  Kurze „Neues-ISM-Checkliste" ergänzen, damit Sonnet nicht wieder abweicht.
- ARCHITEKTUR.md-Zeilenangaben aktualisieren (stimmen nicht mehr).

**Verifikation Phase 0:** `node --test lib/taktgeber/test/` grün + Playwright-Smoke gegen
index.html (alle ISMs mounten, keine Konsolenfehler).

---

## Phase 1 — Sichtbare Bugs (nach dem Aufräumen)

### 1.1 Metronom wieder hörbar
- **Befund:** Audio ist verdrahtet (taktmetro/engine.js → audio/metro.js/clock.js), aber du
  hörst nichts. Verdacht: Routing seit MasterVolume/audioBus-Umbau (Metro hängt evtl. nicht
  am gemeinsamen Bus / Limiter schluckt / eigener vs. Bus-Context).
- **Vorgehen:** per Playwright reproduzieren, `git log` des taktmetro-Audiopfads prüfen
  (Regression eingrenzen), EIN Change, dann **dein Hördurchgang** (nicht „gefixt" ohne dein Ohr).

### 1.2 Echtes MIDI-Learn für die Keyboards
- **Befund:** der „besondere" Learn (werkbank.js ~Z.389-404) lernt eine Note, kalibriert das
  Offset und **löscht die Bindung sofort** → kein Kanal gelernt, kein Bereich gefiltert.
  Heißt Learn, ist nur Offset-Kalibrierung. Dein Vorwurf trifft.
- **Fix:** die gelernte Bindung **behalten** als `{type:'note', ch, ...}` → damit wird der
  **MIDI-Kanal** tatsächlich gelernt. Bereich (min/max Note) wird zum **aktiven Filter** auf
  eingehende Notes. Offset-Kalibrierung bleibt zusätzlich erhalten. Betroffen: `u:playKb`,
  `u:baseKb`; Naht in `lib/keymidi/Midi.js` (Ch-Lernen ist dort schon generisch vorhanden).

### 1.3 Header-Reset-Button
- **Befund:** Reset existiert versteckt unter ⚙ Config → ↺ Reset (werkbank.js ~Z.617).
- **Fix:** sichtbarer Header-Button „↺ Reset" (nutzt dieselbe `LS_KEYS.forEach(remove)+reload`-
  Logik), Bestätigungsdialog behalten. Config-Menü-Reset kann bleiben oder darauf verweisen.

---

## Phase 2 — Port-/Routing-Fundament (das gemeinsame Modell)

**Ziel:** eine Abstraktion, auf der Struktur-Ansicht, Stepseq-Modularität und Latenz aufsetzen.

### 2.1 Port-Schema pro ISM
Jedes ISM deklariert in seiner `defs.js`:
```
ports: {
  outputs: [ { id, label, type } ],   // z.B. AmpEnv, OSZ-F, OSZ-P, Keyboard, BaseFreq, Gate
  inputs:  [ { id, label, type } ],
}
```
- **Typen:** `AmpEnv` (0..99) · `OSZ-F` · `OSZ-P` · `Keyboard`/`Keyboard-Speicher` (0,1..n) ·
  `BaseFreq-Ton` (0,1..12) · `Gate/Wert`.
- **Semantik (aus ddw.md):** `0` = kein Einfluss / laufenlassen · `>0` = Ausgabe/GateOn/Wert.

### 2.2 ISM-Latenz-Vertrag
- Jedes ISM bekommt `latency()` → ms (aus `context.outputLatency`/`baseLatency` + eigenem
  Puffer/Lookahead). taktmetro liefert `audioInfo()` schon fast (werkbank.js ~Z.210) — als
  Muster verallgemeinern. **Antwort auf deine Frage „Kann jedes ISM seine Latenz angeben?":
  ja — über diesen Vertrag.**

### 2.3 Zentrale Routing-Registry
- Neu `lib/routing/Registry.js`: sammelt alle ISM-Ports beim Mount, hält Verbindungen als
  eigenen State-Key (`werkbank_routing`), verteilt Werte Quelle→Ziel. Bestehende harte
  Verdrahtungen (z.B. Stepseq→Poly noteOn, werkbank.js ~Z.444) laufen künftig hierüber.

---

## Phase 3 — Struktur-Ansicht (read-only zuerst)

- Neu `lib/routing/StructureView.js`: liest die Registry, zeigt Module + bestehende
  Verbindungen + `latency()` je ISM. **Nur ansehen**, kein Umstecken.
- Öffnen über Header-Button „⧉ Struktur". Layout: Module als Kästen, Pfeile = aktive
  Verbindungen, Latenz-Badge pro ISM.
- **Editierbares Patchfeld** (Kabel ziehen/lösen) ist der geplante **zweite** Schritt — die
  Registry (2.3) ist schon darauf ausgelegt, damit der Umbau klein bleibt.

---

## Phase 4 — Modularer Stepsequenzer (3 Instanzen)

- Stepseq auf das Port-Modell heben: Aus-/Eingangs-Listen werden **automatisch** aus den
  Registry-Ports angeboten (AmpEnv · OSZ-F · OSZ-P · Keyboard/Speicher 0..n · BaseFreq 0..12).
- **Teiler reparieren:** funktioniert aktuell nicht. **→ RÜCKFRAGE R1** (du hast eingeladen):
  meine Vermutung — `seqDiv` war als Clock-Untersetzung gedacht (Trigger-Hz = BaseFreq·Mult÷Div),
  wirkt im UI aber nicht. Was soll der Teiler im modularen Kontext genau tun?
- **3 Sequenzer-Instanzen** statt einer (Instanz-fähig machen: eigener State-Namespace je Seq).

---

## Phase 5 — Oszillator + Spektrometer als eigene Module

- `lib/Scopes.js` existiert bereits → als eigenständige ISMs/Module herauslösen (eigene
  `.wb-bench`-Sektion, eigener State, Port-Anschluss: Spektrometer = Eingang „alles Hörbare"
  wie Rec, Oszillator = eigener OSZ-Ausgang).
- Reihenfolge innerhalb Phase 5 klärt sich aus dem Port-Modell (beide sind reine Verbraucher/
  Erzeuger von Ports).

---

## Offene Rückfragen (blockieren nur ihre Phase, nicht den Start)

- **R1 (Phase 4):** Was soll der **Teiler** im Stepsequenzer genau bewirken?
- **R2 (Phase 0.3):** Dürfen die versteckten Demo-Sektionen (`bench-knob/ctrls/keys/scratch`)
  raus, oder sind sie bewusst als Bausteinschaukasten-Doku behalten?

## Reihenfolge kompakt

`0 (aufräumen) → 1 (Bugs) → 2 (Port-Fundament) → 3 (Struktur read-only) → 4 (Stepseq modular) → 5 (Osz/Spek)`

Stand des Erledigten: `git log --oneline`.
