# PHASE4_SPEC.md — Modularer Stepsequenzer + editierbares Patchfeld, Nähte für Sonnet

> Opera/Opus 4.8, 20260723. Spezifikation zu **Phase 4** aus [PLAN_OPERA.md](PLAN_OPERA.md)
> (Z. 139-150), erweitert um @dpas Feedback [ddw.md](ddw.md) 20260723_124045. Baut auf der
> Phase-2-Registry ([PHASE2_SPEC.md](PHASE2_SPEC.md)) + Phase-3-Struktur-Ansicht
> ([PHASE3_SPEC.md](PHASE3_SPEC.md)) auf. Rollen: **Opera** legt die Nähte fest, **Sonnet** setzt
> um — **Playwright-verifiziert, ein Change pro Hördurchgang**. Stand des Erledigten: `git log --oneline`.
>
> **@dpas Kern-Vorwurf (ernst nehmen):** der Sequenzer ist „Null mit Tempo, Start, Sync
> verbunden — soll er natürlich, bei Design". Der Teiler läuft „verkehrt" (Multiplikator macht
> nicht erkennbar schneller, 1/1 trifft nicht den Beat). Das ist kein Kosmetik-Fix, das ist der
> Kern von Phase 4: der Stepseq muss ein **Transport-Kind** werden, nicht ein Insel-Puls.

---

## 0. Zuschnitt & Reihenfolge (drei Pakete, je einzeln verifiziert + gehört)

Phase 4 ist zu groß für einen Durchgang. Drei Pakete, in dieser Reihenfolge — **4A zuerst**,
weil es @dpas lauteste Beschwerde ist und sofort hörbar:

- **4A — Teiler/Sync-Umbau** (1 Instanz): Tempo als Clock-Quelle, 1/1 = exakt Beat, Sequenzer
  an Transport-Start/Stop gekoppelt. Kleinster hörbarer Schritt, löst die drei genannten Fehler.
- **4B — 3 Instanzen**: Stepseq instanz-fähig (eigener State-Namespace, eigene Registry-Module).
- **4C — editierbares Patchfeld**: Struktur-Ansicht von read-only → Kästen verschieben, Kabel
  ziehen/lösen. (Das aus PHASE3_SPEC.md „Phase 3b" vertagte Stück, jetzt vorgezogen.)

Jedes Paket hat unten seinen eigenen Abschnitt + eigene Verifikation. **Nicht batchen** — 4A
muss @dpa gehört und bestätigt haben, bevor 4B beginnt.

---

## Paket 4A — Der Sequenzer wird ein Transport-Kind

### 4A.1 Das eigentliche Problem (warum „~etwa")

Heute rechnet [lib/stepseq/engine.js](lib/stepseq/engine.js) `intervalMs()` aus
`getBaseFreq() * seqMult / seqDiv` (werkbank.js Z. 337: `getBaseFreq = () =>
polySynthEngine.baseFreq()`) und läuft frei über `performance.now()` im Render-Loop. Das ist
**doppelt entkoppelt** vom Metronom: falsche Quelle (BaseFreq statt Tempo) **und** freie Phase
(driftet gegen den AudioContext-Scheduler in [lib/taktmetro/audio/clock.js](lib/taktmetro/audio/clock.js)).
Darum „~etwa der Beatschlag" — es ist Zufall, kein Sync.

### 4A.2 Clock-Quelle: Tempo statt BaseFreq (die Semantik)

`getBaseFreq`-Closure entfällt als Trigger-Quelle. Neue Rate:

```
beatDurMs = 60000 / max(1, taktState.bpm)
intervalMs = beatDurMs * seqDiv / seqMult
```

- **seqMult=1, seqDiv=1 → intervalMs = beatDurMs** = exakt ein Beat. Das ist @dpas harte
  Referenz „1/1 GENAU dem Beat". ✓
- **seqMult ↑** → kürzeres Intervall → **schneller / vervielfacht** (@dpa: „Multiplikator soll
  vervielfachen"). ✓
- **seqDiv ↑** → längeres Intervall → langsamer.

`seqMult/seqDiv` werden also zu **Zähler/Nenner der Beat-Rate** (PLAN_OPERA.md Z. 146-148).
Die alte `MIN_HZ/MAX_HZ`-Notbremse bleibt als reiner Sicherheits-Clamp (Endlosschleifen-Schutz),
ist aber bei Tempo-Quelle praktisch nie aktiv — **kein stiller musikalischer Deckel**
([[teslacoil_filter_stand]]-Ethos: keine versteckten Limits).

> **Notenwert-Frage (per Ohr, nicht jetzt entscheiden):** @dpa denkt teils in Noten (1/1, 1/16).
> Die zwei freien Knobs bleiben (minimal-invasiv), Tooltip erklärt „1/1 = Beat". Falls @dpa den
> **Teiler** lieber als Noten-Unterteilung *schneller* laufen lassen will (1/16 = 16tel = schnell
> statt langsam), ist das der Rollentausch `beatDurMs * seqMult / seqDiv` — eine Zeile, bewusst
> @dpas Ohr überlassen. Optionaler Ausbau (NICHT Pflicht in 4A): ein Noten-Preset-Select
> (1/1·1/2·1/4·1/8·1/16) das mult/div setzt.

### 4A.3 Phasen-Bindung: an den Transport-Beat ankern (das „GENAU")

Rate allein reicht nicht — ohne Phasen-Anker driftet auch die richtige Rate gegen das Metronom.
Der Stepseq muss seine Beat-Grenze **vom Transport** beziehen, nicht von `performance.now()`:

- taktEngine liefert bereits `onClockBeat(time, beatInBar)` (roher Scheduler-Beat). Der Stepseq
  hängt sich dort ein und **setzt bei jedem Beat seinen Anker neu** (`nextAt` = diese Beat-Zeit).
  Zwischen den Beats feuert `tick()` im Render-Loop die Subdivisions-Trigger (bei seqMult>1).
  Bei 1/1 fällt jeder Trigger genau auf die Beat-Grenze → **deckungsgleich mit dem Metronom-Klick**.
- **Naht-Problem:** `taktEngine.onClockBeat` ist ein **Einzel-Callback**, schon von Rec belegt
  (werkbank.js Z. 373). Nicht überschreiben. **Lösung: Fan-out in werkbank.js** (minimal-invasiv,
  Muster wie `_onTaktRunning` Z. 92):
  ```js
  taktEngine.onClockBeat((t, beat) => {
      recEngine.handleClockBeat(t, beat);
      stepSeqEngine.handleClockBeat(t, beat);   // 4B: for (seq of seqs) seq.handleClockBeat(...)
  });
  ```
  Engine bekommt eine neue Naht `handleClockBeat(time, beatInBar)` (Anker setzen); `getBaseFreq`
  wird durch `getBeatDurMs = () => 60000 / Math.max(1, taktState.get('bpm'))` ersetzt.

### 4A.4 Start/Stop/Sync-Kopplung (Design-Entscheidung — von Opera gesetzt)

@dpas Frage „startet er automatisch mit dem Transport, oder bleibt seqEnabled ein eigener
Schalter?" — **beides, sauber getrennt:**

- **`seqEnabled` bleibt** ein eigener Arm-Schalter („An"). Musikalisch nützlich: man will einen
  Sequenzer gezielt dazuschalten, während der Transport (Metronom) schon läuft.
- **Der Sequenzer feuert NUR, wenn `seqEnabled && taktEngine.running()`.** Kein Transport → kein
  Trigger, auch bei „An". Das ist die Kopplung, die heute fehlt („Null mit Start/Sync verbunden").
- **Transport-Start** (onRunning true, eingehängt im `_onTaktRunning`-Fan-out werkbank.js Z. 92):
  jeder armed Sequenzer **resettet Position auf Step 0** (Downbeat-Start, phasengleich).
- **Transport-Stop** (onRunning false): Sequenzer hält, Position zurück auf -1 (nächster Start
  beginnt wieder vorn). `nextAt`-Anker verfällt (wird beim nächsten `handleClockBeat` neu gesetzt).

Ergebnis: der Stepseq ist mit **Tempo** (4A.2), **Start** (onRunning) und **Sync** (Beat-Anker
4A.3) verbunden — genau die drei Fäden aus @dpas Vorwurf.

### 4A.5 Betroffene Dateien 4A

- [lib/stepseq/engine.js](lib/stepseq/engine.js): `getBaseFreq`→`getBeatDurMs`; `intervalMs()`
  neu; `handleClockBeat(time,beat)` (Anker); `tick()` respektiert Transport-Running.
- [lib/stepseq/defs.js](lib/stepseq/defs.js): `seqMult`/`seqDiv` Labels + Tooltip
  („1/1 = Beat"), `seqEnabled`-Tooltip („läuft nur bei laufendem Transport"). Default `seqDiv`
  von 16 → **1** (damit die Referenz 1/1 out-of-the-box stimmt), `seqMult` bleibt 1. Die
  Kommentare zur BaseFreq-Kopplung in defs.js/engine.js **umschreiben** (nicht stehen lassen —
  sie beschreiben dann den alten Zustand).
- [werkbank.js](werkbank.js) Z. 337 (Engine-Konstruktion: `getBeatDurMs` reichen statt
  `polySynthEngine.baseFreq`), Z. 92 (`_onTaktRunning`-Fan-out: Sequenzer-Arm/Reset), Z. 373
  (`onClockBeat`-Fan-out: `handleClockBeat`).

### 4A.6 Verifikation 4A (Playwright, Watchdog ~40 s, Muster wie test/phase2_routing_smoke.py)

Neu `test/phase4a_seqsync_smoke.py`:
- seqEnabled **an**, Transport **gestoppt** → **kein** `routing.emit`-Puls auf `stepseq:amp`
  (Zähler bleibt 0). Beweist die Start-Kopplung.
- Transport **start**, bpm bekannt (z.B. 120 → beatDurMs=500), seqMult=1/seqDiv=1, ein voller
  Step-Puffer → gemessener mittlerer Trigger-Abstand ≈ beatDurMs (Toleranz ±1 Frame). Beweist
  1/1 = Beat.
- seqMult=2 → mittlerer Abstand ≈ beatDurMs/2 (schneller). seqDiv=2 → ≈ 2·beatDurMs (langsamer).
- Transport **stop** → Puls hört auf, Position zurück; erneuter Start beginnt bei Step 0.
- `allNotesOff()` am Ende. Phase-2/3-Smokes bleiben grün.

---

## Paket 4B — Drei Sequenzer-Instanzen

### 4B.1 Instanz-Modell

Feste **3 Instanzen** `stepseq1 / stepseq2 / stepseq3` (kein dynamisches Add/Remove in 4B — das
kann später, `registry.unregisterModule` steht schon dafür bereit). Je Instanz:

- eigener `MiniState` mit eigenem LS-Key `werkbank_stepseq_1|2|3` (heute: ein `werkbank_stepseq`).
- eigene Engine + eigenes `StepSeqGrid`.
- eigenes Registry-Modul `stepseq1|2|3` mit Port `amp` (Label z.B. „Seq 1 · AmpEnv+OSZ").
- alle drei hängen im `onClockBeat`- und `_onTaktRunning`-Fan-out (4A.3/4A.4, jetzt Schleife).

**Umsetzung als Factory-Schleife** in werkbank.js (der heutige Stepseq-Block Z. 316-353 wird
zu `[1,2,3].map(n => buildStepSeq(n))`). Alte State-Migration: der bestehende
`werkbank_stepseq` wird beim ersten Lauf zu `werkbank_stepseq_1` (einmaliger Rename, damit @dpas
aktuelles Muster nicht verloren geht) — sonst frische Defaults.

### 4B.2 DOM/UI

Drei Panels statt einem `#stepseq`. Optionen (Opera-Empfehlung: **A**, per Auge korrigierbar):
- **A (empfohlen):** eine Sektion, die den Grid-Block dreimal rendert (gestapelt, kompakt,
  [[feedback_panel_kompaktheit]]) — je mit eigenem Header „Seq 1/2/3". Kleinster UI-Umbau.
- B: drei separate `.wb-bench`-Sektionen (mehr Chrome, mehr Platz).

Nur **stepseq1.amp → polysynth.trig** wird als Default-Verbindung angelegt (wie heute). Seq 2/3
sind zunächst **unverbunden** — sie über das Patchfeld (4C) auf Ziele stecken ist genau der
modulare Nutzen. (Bis 4C steht, sind Seq 2/3 also bewusst „still verkabelbar, aber leer".)

### 4B.3 Verifikation 4B

`test/phase4b_instances_smoke.py`: 3 Grids im DOM, 3 Module in `registry.modules()`
(`stepseq1/2/3`), unabhängige States (Step in Seq 1 setzen ändert Seq 2 nicht), nur Seq 1 in
`connections()`. Alt-State-Rename greift (vorbelegter `werkbank_stepseq` landet in Seq 1).

---

## Paket 4C — Editierbares Patchfeld (Struktur-Ansicht wird modular)

### 4C.1 Scope-Klärung (WICHTIG — ehrlich abgrenzen, @dpa-Beispiel „Rec an OSZ")

Die Registry routet **Steuerwerte + Events** (Zahlen: AmpEnv, Gate, OSZ-F, BaseFreq-Ton,
Keyboard — s. [lib/routing/types.js](lib/routing/types.js)), **nicht Audio-Signale**. @dpas
Beispiel „Rec direkt an OSZ-Ausgang stecken" ist **Audio-Signal-Routing** (`AudioNode.connect`) —
eine **andere Domäne**. Das ist keine Ausrede, sondern die saubere Grenze:

- **4C leistet jetzt:** editierbares Patchen im vorhandenen Wert/Event-Modell — z.B.
  Stepseq-Output umstecken, die 3 Seqs auf verschiedene Ziele verteilen, BaseFreq-Ton→OSZ-F,
  Kabel lösen. Das ist echtes modulares Patchen, sichtbar + wirksam.
- **Audio-Signal-Patchen** (Rec ⇆ OSZ ⇆ Master als AudioNodes) bekommt ein **eigenes Port-Kind
  `Audio`** und gehört zu **Phase 5** — dort entstehen Osz/Spektrometer als Module mit echten
  Audio-Aus/Eingängen erst. Vorher gibt es keinen OSZ-Ausgang zum Anstecken. In 4C wird das im
  Patchfeld ehrlich dargestellt (Audio-Ports später, jetzt nur Wert/Event-Buchsen).

@dpa im Fazit klar sagen: „Rec an OSZ" kommt mit Phase 5 (dann gibt's den OSZ-Ausgang), 4C macht
zuerst das Wert/Event-Patchen editierbar.

### 4C.2 Von read-only zu editierbar (Umbau [lib/routing/StructureView.js](lib/routing/StructureView.js))

Die Datei ist heute strikt read-only (PHASE3_SPEC.md 0.3). 4C hebt das gezielt auf — **direkt
editierbar, kein separater Modus** (@dpa will patchen, nicht umschalten):

1. **Kästen verschiebbar:** jeder `.structure-box` am Kopf ziehbar (`makeDraggable` ist schon
   importiert). Position je Modul persistieren (neuer LS-Key `werkbank_structure_layout`,
   `{moduleId: {x,y}}`). `drawWires()` bei jedem Move neu (das SVG ist schon da, PHASE3_SPEC.md
   3.2 „zukunftsfest"). Layout absolut positioniert statt Flex-Wrap, sobald gespeicherte Pos da.
2. **Kabel ziehen:** `mousedown` auf einen Output-Dot startet ein **Vorschau-Kabel** (Bézier zur
   Maus). `mouseup` auf einem **kompatiblen** Input-Dot → `registry.connect(src, dst)`. Während
   des Drags kompatible Ziele hervorheben, inkompatible ausgrauen — Kompatibilität über
   `canConnect(srcType, dstType)` (types.js, schon vorhanden). Selbst-/Doppelverbindung abweisen.
3. **Kabel lösen:** Klick auf ein `<path class="wire">` selektiert es (dicker/hell), `Entf`/
   `Backspace` oder ein kleines ✕ am Kabel → `registry.disconnect(src, dst)`. Danach `drawWires()`.
4. **Persistenz:** Verbindungen persistieren schon (`werkbank_routing` in Registry). Nur die
   Kästen-Positionen sind neu (Punkt 1). Nach Reload identisches Patch-Bild.
5. **Ehrlichkeit bleibt:** `active:false` (Takt→Rec, nur deklariert) weiter gestrichelt/gedimmt.
   Ein neu gezogenes Kabel ist `active:true`. Zieht man zwischen Ports, deren Zustellung noch
   klassisch läuft (kein `write`/`read`/`emit` gebunden), **verhindert** die UI das nicht, aber
   das Kabel bleibt sichtbar „deklariert" — nicht so tun als flösse schon etwas.

### 4C.3 Mehr Platz (@dpa: „dem Struktur-Fenster ruhig mehr Platz geben")

`.structure-pop` deutlich größer defaulten (breiter + höher) und **resizable** (CSS `resize:both`
am Body oder eine Ziehecke). Weiterhin schwebend/verschiebbar, kein Vollbild-Overlay
(PHASE3_SPEC.md 0.1). Kästen-Stage bekommt Scroll, wenn das Patch über die Fenstergröße wächst.

### 4C.4 Optik (@dpa-Präferenzen, wie PHASE3_SPEC.md 3.4)

Sanfte Rahmen ([[feedback_sanfte_rahmen]]), kleine Radien ([[feedback_ecken_radien_klein]]),
kompakt ([[feedback_panel_kompaktheit]]). Der **e-Mode-artige Kontrast** (kräftige Ränder) ist
hier passend als **aktiver Drag-/Hover-Zustand** der Buchsen (nur während des Patchens), nicht als
Dauerbild. Selektiertes Kabel + kompatible Ziele dürfen deutlich hervortreten (Aktion), Ruhe-Bild
bleibt sanft.

### 4C.5 Verifikation 4C

`test/phase4c_patchbay_smoke.py`:
- Kasten verschieben (Drag am Kopf) → gespeicherte Position überlebt Reload; Kabel folgen.
- Output-Dot → kompatibler Input-Dot ziehen legt eine `connections()`-Verbindung an; Kabel
  erscheint. Inkompatibles Ziel (z.B. AmpEnv→OSZ-F ohne Adapter) wird **abgewiesen** (keine neue
  Verbindung).
- Kabel selektieren + `Entf` → `connections()` um eins kürzer, Puls-Test (emit) trifft es nicht mehr.
- Fenster resizen; `active:false`-Kabel (Takt→Rec) bleibt gestrichelt.
- Nach Reload: identische Verbindungen + Positionen. Phase-2/3/4A/4B-Smokes grün.

---

## Was Phase 4 NICHT tut (Abgrenzung)

- **Kein Audio-Signal-Routing** (Rec/OSZ/Master als AudioNodes) — das ist Phase 5 (4C.1).
- **Kein** dynamisches Add/Remove von Sequenzer-Instanzen (feste 3, 4B.1) — `unregisterModule`
  bleibt für später bereit.
- **Kein** Auto-Layout-Algorithmus fürs Patchfeld (Kästen werden von Hand gezogen, 4C.2).
- **Keine** neuen ISMs. Osz/Spektrometer als Module = Phase 5.

## Reihenfolge kompakt

`4A (Sync-Umbau, hören!) → 4B (3 Instanzen) → 4C (Patchfeld) → Phase 5 (Osz/Spek + Audio-Ports)`

Jedes Paket: Sonnet setzt gegen diese Spec um, Playwright-verifiziert, **dann @dpas Ohr/Auge**,
erst dann das nächste. Stand des Erledigten: `git log --oneline`.
