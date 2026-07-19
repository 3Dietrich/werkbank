# Werkbank – Code Review (frische Augen)

**Stand:** 2026-07-19  
**Scope:** werkbank.js, GroupHost.js, defs.js, engine.js, KeyMidi.js, Midi.js, MiniState.js

---

## 🔴 Echte Ungenauigkeiten (Bugs)

### 1. BPM-Anzeige folgt nicht: Tap/Nudge ändern den Wert, die UI nicht

**Ort:** [GroupHost.js:914](lib/group/GroupHost.js#L914)

**Problem:**  
State-Callbacks füllen nur `ctrlBindings` nach — das sind Select/Toggle/Segment/Text. `makeKnob` trägt sich dort nie ein. Wenn die Engine `state.set('bpm', …)` macht (Tap/Nudge), läuft die Uhr richtig (live über `bpmFn`), aber der gezogene BPM-Regler zeigt den alten Stand.

**Fallbeispiel:**
1. BPM-Regler auf 120 stehen
2. Tap drei Mal im Tempo 140 → Engine setzt `state.set('bpm', 140)`
3. Uhr läuft 140, aber Regler-Anzeige bleibt bei 120

**Reparatur (Vorsicht Schleife!):**  
`Knob.set value` feuert `onChange` → `state.set` auslösen = Feedback-Schleife. Lösung: `Knob` intern mit Flag `_fromState` versehen oder die Knobs ins `ctrlBindings`-System aufnehmen (Setter in `makeKnob`, Bedingung `if (key === k) knob.value = data[key]` ohne `onChange`-Trigger).

---

### 2. `metroCutoffOffset` hat keinen Default

**Orte:**  
- [defs.js:59](lib/taktmetro/defs.js#L59) — Regler definiert
- [defs.js:31](lib/taktmetro/defs.js#L31) — `DEFAULTS` aber nicht gefüllt

**Problem:**  
Der Cutoff-Offset-Regler existiert, bekommt aber initial `value: undefined`. Engine rettet sich mit `|| 0` ([engine.js:36](lib/taktmetro/engine.js#L36)), aber Kommentar in [engine.js:16](lib/taktmetro/engine.js#L16) behauptet „aus DEFAULTS 4000" — stimmt nicht.

**Reparatur:**  
```javascript
// In defs.js DEFAULTS
metroCutoffOffset: 4000,  // oder was @dpa hört
```

---

### 3. `metro2OnDownbeat` ist ein Geisterschalter

**Ort:** [engine.js:43](lib/taktmetro/engine.js#L43)

**Problem:**  
Engine liest `state.get('metro2OnDownbeat')`, aber es gibt weder ein Control noch einen Default. Der Wert ist immer `undefined` → Teil 2 klingt nie auf der 1 mit, `metroParts` gibt `p2: true` nur für `beatInBar !== 0`.

**Reparatur — eine von zwei:**
- **Option A (aus):** Den State-Key rausnehmen, `metroParts` auf festes `on2Downbeat: false` oder den echten Wert hardcoden
- **Option B (an):** Toggle in defs TOGGLES + Default in DEFAULTS setzen

---

## 🟡 Ordnungswidrigkeiten (technische Schulden)

### 4. Doppelte Wahrheit: `lib/taktgeber/` vs. `lib/taktmetro/audio/` vs. `lib/keymidi/`

**Problem:**  
Vollständige Kopien (`clock.js`, `metro.js`, `midi.js`) und die sind bereits **divergiert**:

| Datei | Status |
|-------|--------|
| `tapTempo.js`, `svf.js`, `metroClick.js` | byte-identisch |
| `clock.js`, `metro.js` | **divergiert** (unterschiedliche Struktur/Kommentare) |
| `midi.js` | **divergiert** |

Gleichzeitig: [defs.js:18](lib/taktmetro/defs.js#L18) importiert `DEFAULTS` noch aus `../taktgeber/state.js`.

Ein Bugfix in einer Version landet garantiert nicht in der anderen. **Ein Wartungs-Alptraum.**

**Reparatur:**  
- `TAKT_DEFAULTS` nach `lib/taktmetro/state.js` verschieben
- `lib/taktgeber/` als toten Referenz-Ordner markieren / löschen
- Oder: alle lebenden Dateien nach `lib/taktmetro/audio/` & `lib/keymidi/` umziehen, taktgeber-Kopien strikethrough

---

### 5. Taktgeber-Leichen im Werkbank-State

**Ort:** [defs.js:31](lib/taktmetro/defs.js#L31) — `...TAKT_DEFAULTS`

**Problem:**  
Der Spread schleppt Dinge mit, die hier nicht mehr gelten:

```javascript
// Alte Tastenbelegungen (taktgeber-Schema)
keyStart, keyBang, keyBang2, …, keyBeats

// Neue Tastenbelegungen (werkbank-Schema, P3)
keyBindings  // {id → key}

// Alte Gruppen-Einstellungen (taktgeber)
groupColors, groupBgs, groupScales, hiddenControls, closedGroups

// Neue Gruppe-Einstellungen (werkbank)
groupStyles  // {name → {bg, headColor, width, height, collapsed, …}}
```

Zwei konkurrierende Schemata im selben localStorage = Konfusion, wenn später jemand denkt, eines wäre noch aktiv.

**Reparatur:**  
```javascript
// In defs.js DEFAULTS: taktgeber-Leichen rausnehmen
DEFAULTS: {
    ...TAKT_DEFAULTS,
    // — ENTFERNEN: keyStart, keyBang, …, keyBeats
    // — ENTFERNEN: groupColors, groupBgs, groupScales, hiddenControls, closedGroups
    
    // — HINZUFÜGEN (werkbank-spezifisch):
    keyBindings: { /* erprobte Defaults */ },
    metroLevel: 0.8,  // Pegel umbenannt
    metroCutoffOffset: 4000,  // fehlender Default
    metro2OnDownbeat: false,  // oder true, per Ohr bestätigen
}
```

---

## 🟠 Struktur-Beobachtungen

### GroupHost.js ist eine 925-Zeilen-Funktion

**Nachvollziehbar**, als treuer Port aus teslacoil. Aber als „Baustein zum Rüberkopieren" wäre eine Dreiteilung sauberer:
1. **Control-Fabriken** (makeKnob, makeSelect, …)
2. **e-Mode + Free-Canvas** (arranging, freezeGroup, Gummiband)
3. **Persistenz-Recall** (applyAll, subscribe)

**Spaghettigste Stelle:** `freezeGroup()` ([lib/group/GroupHost.js:512–565](lib/group/GroupHost.js#L512-L565)) — Hidden-Element-Messtanz, um natürliche Positionen zu erfassen.

---

### Kein Unmount/Destroy

- `mountGroups`, `makeDisplay`, Engine und KeyMidi hängen sich an `window` und `state.subscribe`
- MiniState kennt kein Abmelden
- Für die einmal geladene Demo-Seite OK, aber der Baustein wirbt damit, wiederverwendbar zu sein

**Reparatur (nicht dringend):** `unmount()` → alle Listener entfernen, Worker terminate

---

## 🔵 Kleinkram

| Fund | Ort | Auswirkung |
|------|-----|-----------|
| Versteckte Benches laufen weiter | werkbank.js:114, 140 | Readout-`setInterval` (80 ms) und Seq-rAF ticken unsichtbar |
| `dispatchKey` filtert kein `repeat` | KeyMidi.js:104 | Gehaltene Taste feuert Autorepeat; Tap-Serie verfälscht |
| **e** ist reserviert, aber belegbar | KeyMidi.js | Beide Handler feuern; Kollisionswarnung kennt Reserviertes nicht |
| MIDI-CC linear auf Log-Knob | GroupHost.js:425 | `metroCutoff` (log) folgt 0..127 linear; untere Hälfte = winziger Bereich |
| Blob-URL wird nicht `revokeObjectURL`t | clock.js:46 | Mini-Leck: pro Start eine neue URL ohne Cleanup |
| Nach `stop()` bleiben Timeouts stehen | engine.js | `scheduleBeat`-Timer laufen, letzter Beat-Punkt leuchtet weiter |

---

## ✅ Was gut läuft

- **Nähte** (defs → Fabriken → Engine) sauber, gut dokumentiert
- **Treuer Port** von teslacoils Architektur erhalten
- **MiniState-Interface** smart: nur `get/set/subscribe`, keine Kopie von teslacoils Zustandsverwaltung
- **Tastenbelegung P3** ist sauber umgesetzt (1:1 aus taktgeber, neu strukturiert)
- **Kommentare** erklären Absicht + Probleme (z.B. MAX_PER_TICK, Hidden-Elements-Trick)

---

## 📋 Priorität-Reparatur-Reihenfolge

| Prio | Bug | Aufwand | Hörbar |
|------|-----|--------|--------|
| **P1** | #1: BPM-Regler folgt nicht | mittel | ja |
| **P2** | #2: metroCutoffOffset-Default | klein | ja |
| **P3** | #3: metro2OnDownbeat-Schatten | klein | ja (je nach Entscheidung) |
| **P4** | #4: Doppelte Wahrheit (Dateien) | groß (Refactor) | nein |
| **P5** | #5: Taktgeber-Leichen | mittel | nein |

---

## Fragen für @dpa

1. **BPM-Update:** Soll der Regler nach Tap/Nudge visuell folgen? Wenn ja: interner `_fromState`-Flag in Knob oder in `ctrlBindings` anmelden?
2. **metro2OnDownbeat:** An oder aus? Wenn aus: Zeile [engine.js:43](lib/taktmetro/engine.js#L43) kann raus. Wenn an: Toggle + Default nötig.
3. **taktgeber-Ordner:** Löschen oder behalten als Archiv/Referenz?
4. **Taktgeber-State:** Vor der nächsten Änderung die alten Keys aus DEFAULTS rausnehmen?

