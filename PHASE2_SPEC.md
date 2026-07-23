# PHASE2_SPEC.md — Port-/Routing-Fundament (Nähte für Sonnet)

> Opera/Opus 4.8, 20260723. Spezifikation zur Umsetzung von **Phase 2** aus
> [PLAN_OPERA.md](PLAN_OPERA.md) (Z. 87–113). Rollen: Opera legt hier die Nähte fest,
> Sonnet setzt Paket für Paket um, **Playwright-verifiziert, ein Change pro Hördurchgang**
> (kein Batchen, @dpa). Stand des Erledigten: `git log --oneline`.
>
> Kern-Entscheidung vorweg: **defs.js bleibt reine Deklaration (Metadaten), engine.js/werkbank.js
> liefern das Verhalten** — exakt die Naht, die BUTTONS schon haben (`defs` kennt die `id`,
> `engine.onAction(id)` das Verhalten). Ports sind dieselbe Idee für Aus-/Eingänge.

---

## 0. Leitentscheidungen (das Warum, bevor die API kommt)

1. **Zwei Port-Naturen, nicht eine.** Die bestehenden harten Verdrahtungen sind real zweierlei:
   - **Event/Puls** (push, synchron im Moment des Ereignisses): Stepseq-Trigger → Poly-noteOn
     (werkbank.js ~Z.303), Clock-Beat → Rec (werkbank.js ~Z.334). Feuert **nur bei `>0`**
     (Stepseqs `if (v>0) onTrigger(v)` ist genau das schon).
   - **Wert** (pull/sample, pro Frame gültig): Tempo → Poly-baseFreq (werkbank.js ~Z.126, poly
     zieht `_getBpm()` bei Bedarf), OSZ-F/OSZ-P, BaseFreq-Ton, Gate.

   Die Registry unterstützt **beide** über **eine** Verbindungs-Wahrheit. Ein Port deklariert
   seine `kind`. Kein Zwang, alles in per-Frame-Sampling zu pressen (das verschöbe die
   Timing-Charakteristik der Trigger). Semantik `0 = kein Einfluss` fällt bei Events aus
   „kein emit", bei Werten aus „Wert 0 = Gate aus / laufenlassen".

2. **Registry ist Wahrheit über *Verbindungen*, nicht Zwang über *Zustellung*.** Migrationsweg:
   erst deklarieren (Ports + bestehende Connections eintragen, alte Zustellung läuft weiter →
   Struktur-Ansicht Phase 3 zeigt echte Pfeile **ohne** Verhaltensrisiko), dann Zustellung
   **eine Verbindung nach der anderen** auf die Registry heben. Nicht alles auf einmal.

3. **Ports = Metadaten in defs.js, Bindung im engine/werkbank.js.** Phase 3 (read-only) liest
   nur die Deklaration + `latency()` — muss keine Engine anfassen.

4. **`latency()` ist additiv, optional, bricht die ISM-Checkliste nicht.** Ein gemeinsamer
   Helfer liest die Bus-Latenz, das ISM addiert seinen eigenen Lookahead. taktmetros
   `audioInfo()` (werkbank.js ~Z.68) wird dazu verallgemeinert.

---

## 2.1 Port-Schema pro ISM (Deklaration)

In **`defs.js`** jedes ISM, additiv zum bestehenden Objekt (neben `DEFAULTS/KNOBS/…`):

```js
ports: {
  outputs: [ { id, label, type } ],   // id ist ISM-lokal eindeutig
  inputs:  [ { id, label, type } ],
}
```

- **Nur Metadaten** — keine Funktionen hier (defs bleibt verhaltensfrei, wie GROUPS/BUTTONS).
- `id` ist innerhalb des ISM eindeutig; die globale Referenz ist `{module, port}` (s. 2.3).
- Fehlt `ports`, gilt das ISM als „ohne Anschlüsse" (Struktur-Ansicht zeigt es ohne Buchsen) —
  kein Fehler, kein Checklisten-Bruch für Alt-ISMs, die noch nichts routen.

### Typen-Tabelle (verbindlich)

| type | kind | Wertebereich / Payload | Semantik `0` |
|---|---|---|---|
| `AmpEnv` | event | `1..99` (Hüllkurven-Höhe/Velocity-Skalierung) | kein Trigger (emit unterbleibt) |
| `Gate` | value | `0` \| `>0` (Level) | Gate aus |
| `OSZ-F` | value | Hz `>0` | — (0 = kein Signal) |
| `OSZ-P` | value | Phase `0..1` | Phase 0 |
| `BaseFreq-Ton` | value | `0..12` (0 = kein Ton, 1..12 = Tonklasse) | kein Ton |
| `Keyboard` | event | `{note, vel, on}` (Note-On/Off) | — |
| `Keyboard-Speicher` | event | `{slot, note, vel, on}` (0 = leer, 1..n Slot) | leerer Slot |

`kind` ist **aus dem type ableitbar** (eine zentrale `TYPES`-Tabelle in `lib/routing/types.js`
hält `{ id, kind, range }`) — der Port deklariert nur den `type`, nicht die `kind`.

---

## 2.2 ISM-Latenz-Vertrag

Neu `lib/routing/latency.js`:

```js
import { getContext } from '../audioBus.js';
// Bus-Anteil in ms: Basis- + Ausgabelatenz des gemeinsamen Contexts (audioBus).
export function busLatencyMs() {
  const c = getContext();               // baut NICHT auf (kein ensureAudio) — 0 bis Context da ist
  if (!c) return 0;
  return ((c.baseLatency || 0) + (c.outputLatency || 0)) * 1000;
}
```

Jedes engine.js ergänzt seine öffentliche API um **`latency()` → ms**:

```js
latency() { return busLatencyMs() + OWN_BUFFER_MS; }
```

- `OWN_BUFFER_MS` = der ISM-eigene Lookahead/Puffer:
  - **taktmetro**: `clock.lookaheadFn()` (0.15 s + Vorlauf) × 1000, plus `latencyOffset`
    (Vorzeichen wie in `latOff()`, engine.js ~Z.54). taktmetro liefert das Bus-Roh schon über
    `audioInfo()` — dort **nicht doppeln**: `audioInfo()` bleibt fürs Tab-Fenster, `latency()`
    ist der neue Vertrag; beide dürfen `busLatencyMs()` teilen.
  - **polysynth**: `ampAttack` ist Teil der wahrnehmbaren Latenz? Nein — Latenz ist die
    **Signalweg**-Verzögerung, nicht die Hüllkurve. `OWN_BUFFER_MS = 0` (rein Bus).
  - **stepseq**: rAF-getrieben, kein eigener Scheduler → `OWN_BUFFER_MS = 0` (Bus + eine
    rAF-Frame-Unschärfe, die man **nicht** in `latency()` hineinlügt).
  - **recInstrument**: Bus + evtl. Encoder-Puffer, vorerst `0`.
- `latency()` ist **optional** in der Struktur-Ansicht: fehlt sie, zeigt Phase 3 „—".

**Checklisten-Wirkung:** `latency()` wird als **Punkt 7 (optional)** in
[docs/CONTROLS.md](docs/CONTROLS.md) „Neues-ISM-Checkliste" ergänzt — additiv, macht kein
bestehendes ISM ungültig.

---

## 2.3 Zentrale Routing-Registry

Neu `lib/routing/Registry.js` — Factory (kein `new`, gleiche Naht wie die Engines):

```js
export function createRoutingRegistry({ stateKey = 'werkbank_routing' } = {})
```

### API

```js
// — Anmeldung beim Mount (werkbank.js, pro ISM einmal) —
reg.registerModule(moduleId, {
  label,                 // Anzeigename (Struktur-Ansicht)
  latency,               // () => ms  (optional, s. 2.2)
  outputs: {             // key = port.id aus defs.ports.outputs
    [portId]: {
      type,              // muss zum defs-Eintrag passen (Registry warnt bei Divergenz)
      read,              // () => value   — NUR value-ports (pull); event-ports lassen read weg
    }
  },
  inputs: {              // key = port.id aus defs.ports.inputs
    [portId]: {
      type,
      write,             // (value, meta) => void   — Ziel-seitige Wirkung
    }
  },
});
reg.unregisterModule(moduleId);        // Phase 4: dynamische Instanzen wieder abmelden

// — Verbindungen (persistiert unter stateKey) —
reg.connect(src, dst);                 // src/dst = {module, port}; validiert Typ; false wenn inkompatibel
reg.disconnect(src, dst);
reg.connections();                     // → [{src, dst, type, adapter}]  (Struktur-Ansicht)
reg.modules();                         // → [{id, label, latency, inputs[], outputs[]}]  (Struktur-Ansicht)

// — Zustellung —
reg.emit(src, value);                  // EVENT-push: an alle verbundenen inputs (Adapter angewandt) → input.write
reg.getValue(ref);                     // pull: aktueller Wert eines value-ports (für Anzeige/Struktur)
reg.flush();                           // pro Render-Frame: alle verbundenen value-outputs samplen → input.write
```

- **Referenzformat:** intern `{module, port}`; im State kompakt als String `"module:port"`.
- **`emit`** ist synchron im Ereignismoment (Stepseq-Trigger, Clock-Beat) — Timing = heute.
- **`flush()`** hängt **einmal** in den Render-Loop (werkbank.js ~Z.364) hinter `stepSeqEngine.tick`.
  Sampelt nur **verbundene** value-outputs (keine Verbindung = kein `read` = keine Kosten).
- **Persistenz:** Connections als Array `[{src, dst}]` unter `werkbank_routing` (eigener
  State-Key, **nicht** Teil eines ISM-Snapshots — Routing überspannt ISMs). Beim Laden **nach**
  allen `registerModule` erneut `connect()`; **stale Refs** (Port existiert nicht mehr) still
  verwerfen — dasselbe Muster wie `ctrlPos` mit fehlenden Controls (nicht crashen).

### Typ-Kompatibilität & Mapping (Antwort auf Frage 2)

`connect(src, dst)` prüft in `lib/routing/types.js`:

1. **Identität**: `srcType === dstType` → immer erlaubt, Wert 1:1.
2. **Adapter**: Eintrag in `ADAPTERS["srcType->dstType"] = (value, meta) => value'` → erlaubt,
   Wert wird beim Zustellen transformiert. Startsatz (nur was wir real brauchen):
   - `"AmpEnv->Gate"` : `v => v > 0 ? v : 0`  (Trigger als Gate-On)
   - `"BaseFreq-Ton->OSZ-F"` : `(t, meta) => toneToHz(t, meta)`  (Tonklasse → Hz; Kammerton aus meta)
   - `"Gate->AmpEnv"` : `v => v > 0 ? clampEnv(v) : 0`
3. **Sonst inkompatibel**: `connect` gibt `false`, Struktur-Ansicht zeigt die Buchse grau /
   verweigert das Kabel. **Kein** implizites Raten.

Adapter-Tabelle bleibt bewusst **klein und explizit** — jede neue Kreuzung ist eine bewusste
Zeile, kein generischer Zahlen-Cast.

---

## Konkrete Port-Deklarationen (so eintragen)

**polysynth/defs.js** `ports`:
```js
outputs: [
  { id: 'baseTone', label: 'BaseFreq-Ton', type: 'BaseFreq-Ton' },  // 0..12
  { id: 'baseFreq', label: 'BaseFrq (Hz)',  type: 'OSZ-F' },
],
inputs: [
  { id: 'trig', label: 'Trigger', type: 'AmpEnv' },   // Stepseq-Ziel (Note aus baseFreq, s.u.)
],
```
**stepseq/defs.js** `ports`:
```js
outputs: [
  { id: 'amp', label: 'AmpEnv+OSZ', type: 'AmpEnv' },  // ersetzt den `seqOutput`-Selector-Zweig
],
inputs: [],   // Phase 4: BaseClock-Quelle wird ein Eingang (Tempo/BaseFreq wählbar)
```
**taktmetro/defs.js** `ports`:
```js
outputs: [
  { id: 'beat', label: 'Clock-Beat', type: 'Gate' },   // roher Scheduler-Beat (Rec-Ziel)
],
inputs: [],
```
**recInstrument/defs.js** `ports`:
```js
outputs: [],
inputs: [
  { id: 'clock', label: 'Clock', type: 'Gate' },   // Downbeat-Arming
],
```

> Poly-`trig` bleibt Typ `AmpEnv`: die heutige Logik (Note = `freqToMidi(baseFreq())`,
> `_seqHeldNote`-Verwaltung, werkbank.js Z.303–309) wandert als **Input-Bindung** in
> polysynth — empfohlen als neue Methode `polySynthEngine.triggerFromEnv(env)` (kapselt Note +
> Held-Note), dann ist `write: (v) => polySynthEngine.triggerFromEnv(v)` und das
> Modul-globale `_seqHeldNote` in werkbank.js entfällt. **Optional**, nicht Pflicht für Phase 2.

---

## Migrationsweg (Antwort auf Frage 3 — schrittweise, verifiziert)

**Paket A — Deklaration (kein Verhalten):**
1. `ports` in die vier defs.js (s.o.). `lib/routing/types.js` (TYPES + ADAPTERS + `toneToHz`).
2. `lib/routing/latency.js` + `latency()` in die vier engines.
3. docs/CONTROLS.md: Checklisten-Punkt 7 (optional `latency()`) + Port-Deklaration erwähnen.
   *Verify:* Playwright-Smoke — alle ISMs mounten, keine Konsolenfehler, `ports`/`latency()`
   über `window.__*`-Haken lesbar. **Kein hörbares/sichtbares Verhalten ändert sich.**

**Paket B — Registry + Deklaration der Ist-Verbindungen (Zustellung bleibt alt):**
4. `lib/routing/Registry.js`. In werkbank.js pro ISM `registerModule(...)` (read/write-Closures
   aus den vorhandenen Engine-Methoden). `reg.flush()` in den Render-Loop.
5. Die **drei bestehenden** Verbindungen als Connections eintragen (Stepseq.amp→Poly.trig,
   Takt.beat→Rec.clock, Poly.baseFreq intern) — aber die **alten** direkten Aufrufe laufen
   weiter. `window.__routing = { reg }`.
   *Verify:* `reg.connections()` zeigt die drei Pfeile; Verhalten unverändert (Stepseq triggert
   Poly wie bisher, Rec armt wie bisher). Das ist der Stand, auf dem Phase 3 aufsetzt.

**Paket C — Zustellung migrieren, EINE nach der anderen:**
6. **Zuerst Stepseq.amp → Poly.trig** (Phase 4 braucht genau diese dynamisch): den harten
   `onTrigger`-Callback (werkbank.js Z.303–309) durch `reg.emit({module:'stepseq',port:'amp'}, v)`
   ersetzen; Poly.trig-`write` macht, was der Callback tat. Alte Verdrahtung raus.
   *Verify:* Stepseq an → Poly klingt identisch (Playwright: `voiceCount()`/`heldCount()` wie vorher).
7. Später (nicht Phase-2-Pflicht): Takt.beat→Rec, Tempo→Poly.baseFreq analog. Bis dahin bleiben
   sie „declared, alt zugestellt".

**Reihenfolge-Prinzip:** A und B sind risikoarm (nur Zusatz), C ist der einzige echte
Verhaltens-Umbau und geht **einzeln** mit Ohr/Playwright. Passt zu „ein Change pro Hördurchgang".

---

## Was Phase 2 NICHT tut (Abgrenzung)

- **Keine** Struktur-Ansicht (Phase 3) — Registry liefert nur `modules()/connections()/latency()`.
- **Kein** editierbares Patchfeld — `connect/disconnect` existieren als API, aber ohne UI.
- **Keine** Stepseq-Instanziierung (Phase 4) — `unregisterModule` ist schon da, wird aber noch
  nicht mehrfach genutzt. Teiler-Reparatur (n/m) bleibt Phase 4.
- **Keine** Oszillator/Spektrometer-Module (Phase 5).

## Offene Mikro-Entscheidungen für @dpa (blockieren Sonnet nicht)

- **Poly.baseFreq als Output-Port:** brauchen wir ihn jetzt schon (Paket A) oder erst mit dem
  ersten echten Verbraucher? Vorschlag: **jetzt deklarieren** (Struktur-Ansicht zeigt ihn),
  Zustellung erst bei Bedarf.
- **`triggerFromEnv` in polysynth** (Held-Note-Kapselung): mitnehmen in Paket C oder separat?
  Vorschlag: **mit Paket C**, weil es dieselbe Stelle anfasst.
