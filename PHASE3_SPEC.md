# PHASE3_SPEC.md — Struktur-Ansicht (read-only), Nähte für Sonnet

> Opera/Opus 4.8, 20260723. Spezifikation zu **Phase 3** aus [PLAN_OPERA.md](PLAN_OPERA.md)
> (Z. 128-135). Baut direkt auf der Phase-2-Registry auf ([PHASE2_SPEC.md](PHASE2_SPEC.md),
> [lib/routing/Registry.js](lib/routing/Registry.js)). Rollen: Opera legt hier die Nähte fest,
> Sonnet setzt um, **Playwright-verifiziert, ein Change pro Hördurchgang**. Stand: `git log --oneline`.
>
> **Der Kern-Zweck dieser Phase (@dpa 20260723):** Phase 2 war absichtlich unsichtbar/unhörbar
> („ich sehe davon NICHTS"). Phase 3 ist das Fenster, das die unsichtbare Verkabelung endlich
> **sichtbar** macht — Struktur UND, dass wirklich etwas fließt. Das ist kein Nice-to-have,
> das ist der Punkt.

---

## 0. Leitentscheidungen (von Opera gesetzt — beim Umsetzen per Auge korrigierbar)

1. **Darreichung: schwebendes Fenster in der `special-pop`-Familie.** Gleiche Hülle wie das
   ⚙ Tab-Sonderfenster (GroupHost.js `makeSpecial`, `.special-pop`): Kopf mit Titel + ✕, am
   Kopf **verschiebbar** ([lib/dragPanel.js](lib/dragPanel.js) wiederverwenden), **ESC** +
   **Außenklick** schließt, sanfter Rahmen, kleine Radien (@dpa-Optik: [[feedback-sanfte-rahmen]],
   [[feedback-ecken-radien-klein]], [[feedback-panel-kompaktheit]]). **Kein** Vollflächen-Overlay
   (Fremdkörper), **keine** Dauer-Sektion (Plan sagt Header-Button-Öffnen). Eigene Größe, größer
   als das Tab-Fenster, aber kein Vollbild.
2. **Rendering: DOM-Kästen + ein SVG-Overlay für die Kabel.** Kästen/Buchsen/Badges als DOM+CSS
   (Werkbank-Optik, Hover/Titel billig). Kabel = beliebige Punkt-zu-Punkt-Kurven → das kann CSS
   nicht, dafür ein `<svg>`-Layer. Zukunftsfest: das editierbare Patchfeld (Phase 3b) zieht dann
   Kabel im schon vorhandenen SVG.
3. **Read-only heißt read-only.** Das **Fenster** ist verschiebbar, die **Kästen darin nicht**,
   Kabel nicht umsteckbar. Keine `connect/disconnect`-UI (das ist Phase 3b, die Registry-API
   steht dafür schon).
4. **Sichtbarer Fluss (der @dpa-Punkt), semantisch ehrlich:**
   - **Value-Kabel** (OSZ-F, BaseFreq-Ton, Gate …) fließen per Definition *dauernd*, sobald
     verbunden → sie werden **ruhig „aktiv" gefärbt** (dezentes Leuchten), kein Geflacker.
   - **Event-Kabel** (AmpEnv, Keyboard …) tragen *Impulse* → sie **blitzen kurz auf**, wenn ein
     Ereignis durchgeht (Stepseq-Trigger). So sieht man den Puls-Synth wirklich pulsen.
   - **Nur deklarierte** Verbindungen (Zustellung noch klassisch, z.B. Takt→Rec) = **gestrichelt
     + gedimmt**, Tooltip erklärt warum. Ehrlich statt so tun als liefe schon alles über die Registry.

---

## 3.1 Header-Anschluss

Ein `pb-btn` **„⧉ Struktur"** in `.topbar-right` (neben „↺ Reset", werkbank.js ~Z.543),
Klick **togglet** das Fenster (auf/zu), wie der Config-Knopf. **Kein** Radio-Peer der
Tasten/MIDI-Schalter. Aufbau in werkbank.js nach der Registry-Verdrahtung (die Registry
existiert dort schon als `routing`).

---

## 3.2 Neue Datei `lib/routing/StructureView.js`

Factory, gleiche Naht wie die Engines/die Registry:

```js
export function createStructureView(registry, opts = {})
// → { openBtn?, open(), close(), isOpen() }   // Aufbau des Header-Buttons kann in werkbank.js bleiben
```

- Liest **ausschließlich** über die Registry (`registry.modules()`, `registry.connections()`,
  `registry.onActivity(...)`) — kennt kein einzelnes ISM direkt. Das ist die ganze Entkopplung,
  die Phase 2 erkauft hat.
- Baut beim **Öffnen** den Graphen einmal auf (Kästen + Buchsen + Kabel-Geometrie), hält
  danach nur noch **Zahlen/Fluss** live (s. 3.5). Beim Schließen: Listener/Timer abmelden.

### Modul-Kasten

Pro `registry.modules()`-Eintrag ein Kasten:
```
┌ Poly-Synth        ~12 ms ┐   ← Kopf: label + Latenz-Badge (3.5)
│ ○ trig      baseFreq ●   │   ← inputs links (○), outputs rechts (●)
│             baseTone ●   │      je: Punkt + Label + dezente Typ-Signatur
└──────────────────────────┘
```
- Buchsen-Reihen: **inputs linksbündig, outputs rechtsbündig**. Jede Buchse ist ein kleines
  DOM-Element mit stabiler `data-port="<module>:<port>"` (die Kabel-Endpunkte finden sich
  darüber per `getBoundingClientRect`).
- **Typ-Signatur dezent**, nicht 7 Knallfarben (@dpa-Optik): ein kurzes Kürzel (`OSZ-F`,
  `AmpEnv`, `Gate` …) klein/gedimmt an der Buchse, optional eine sehr zurückhaltende Typ-Farbe
  am Buchsen-Punkt. Feinschliff per Auge.
- Modul **ohne Ports** (falls später eins) trotzdem als Kasten zeigen (leer), nicht verschlucken.

### Kabel (SVG-Overlay)

- Ein `<svg>` deckt den Kästen-Container (`position:relative`) vollflächig ab,
  `pointer-events:none`, liegt **unter** den Kästen (Buchsen bleiben oben lesbar) oder darüber
  mit ausgespartem Pointer — Umsetzung nach Augenschein.
- Pro `registry.connections()`-Eintrag ein `<path>` (weiche Kubik-Bézier) von der Mitte der
  Output-Buchse zur Mitte der Input-Buchse. Koordinaten = Buchsen-`getBoundingClientRect`
  **relativ zum SVG-Container**, nach dem Kästen-Layout gemessen.
- Klassen fürs Aussehen (3.4): `.wire`, `.wire--value` / `.wire--event`, `.wire--declared`,
  transiente `.wire--pulse`.
- **Neu zeichnen** bei Container-Resize (`ResizeObserver`) — nicht bei jedem Frame. Das reine
  Verschieben des Fensters ändert die *relativen* Koordinaten nicht, braucht also kein Redraw.

### Kästen-Layout

Feste, automatische Anordnung — **kein** Force-Layout, **kein** Verschieben:
- Kästen in **Registry-Reihenfolge** (= Mount-Reihenfolge: takt, polysynth, stepseq, rec) in
  einem Flex/Grid-Wrap. Für die aktuellen 4 Module reicht eine Reihe (bei Enge umbrechend).
- Prinzip „Quellen eher links, Senken eher rechts" ist wünschenswert, aber **nicht** über einen
  Graph-Algorithmus erzwingen — die Bézier-Kabel dürfen sich kreuzen. Phase 4 (mehr Module)
  darf das verfeinern; für read-only zählt Ehrlichkeit, nicht Schönheit der Kantenführung.

---

## 3.3 Registry-Erweiterungen (klein, additiv — nötig für eine EHRLICHE Ansicht)

Zwei Ergänzungen in [lib/routing/Registry.js](lib/routing/Registry.js), beide additiv (brechen
Phase 2 nicht):

1. **`connect(src, dst, { active = true })`** + `connections()` gibt `active` mit aus.
   `active:false` = „deklariert, Zustellung läuft noch klassisch". werkbank.js markiert die
   **Takt.beat→Rec.clock**-Verbindung als `{ active: false }` (die echte Zustellung bleibt
   `taktEngine.onClockBeat`, s. PHASE2_SPEC.md offene Mikro-Entscheidung). Stepseq→Poly bleibt
   `active` (Default). Ohne dieses Flag müsste die Ansicht lügen (alles gleich „verbunden").
2. **`onActivity(fn)`** — Aktivitäts-Hook für den Live-Puls. `fn({src, dst, type})` wird aus
   **`emit()`** gerufen (Event-Ports, im Ereignismoment), einmal je erreichtem Ziel.
   - **Wichtig fürs Budget:** feuert **nur, wenn mindestens ein Listener registriert ist** (die
     Struktur-Ansicht registriert beim Öffnen, meldet beim Schließen ab) → zugeklappt **null**
     Overhead. `flush()` (Value-Ports, pro Frame) meldet **nichts** — Value-Kabel sind statisch
     „aktiv" (s. 3.4), kein 60/s-Feuerwerk nötig.
   - Rückgabe: ein `off()`-Deregistrierer, oder `offActivity(fn)`. Umsetzung frei, Hauptsache
     sauber abmeldbar.

---

## 3.4 Optik-Regeln (verbindlich, @dpa-Präferenzen)

- **Sanfte Rahmen** wie die Settings-Fenster, **nicht** kontrastreich wie Hover/e-Mode
  ([[feedback-sanfte-rahmen]]). **Kleine Radien** ([[feedback-ecken-radien-klein]]).
  **Kompakt** ([[feedback-panel-kompaktheit]]) — Buchsen-Punkte klein, Kabel dünn, keine
  Riesen-Kästen.
- CSS in [css/main.css](css/main.css), Präfix `.structure-*` / `.wire*`. Farb-Variablen aus dem
  bestehenden Set (`--muted`, `--accent`, `--sel-*` …), keine neuen Knallfarben.
- **Kabel-Zustände:**
  | Klasse | Bedeutung | Optik |
  |---|---|---|
  | `.wire--value` | Value-Verbindung, fließt dauernd | ruhige, dezent leuchtende Linie |
  | `.wire--event` | Event-Verbindung, Impulse | ruhige Linie, blitzt bei Aktivität |
  | `.wire--pulse` | transient (~150 ms nach `onActivity`) | kurzer heller Blitz, dann zurück |
  | `.wire--declared` | nur deklariert (`active:false`) | gestrichelt + gedimmt, Tooltip |

---

## 3.5 Live-Verhalten (Snapshot-Struktur + tickende Zahlen)

- **Struktur** (Kästen, Buchsen, Kabel-Geometrie): einmal beim Öffnen. In Phase 3 read-only
  ändern sich Verbindungen nicht, also kein Rebuild nötig (Phase 3b baut das dann auf).
- **Latenz-Badge** pro Kasten: `registry.modules()[i].latency` (ms, gerundet). Vor dem ersten
  Ton ist der Bus-Anteil 0 → Badge zeigt dann „— (bereit nach erstem Ton)", exakt wie die
  Audio-Zeile im Tab-Fenster (GroupHost.js `refreshAudio`). **Tickt live** per
  `setInterval(refresh, 1000)`, solange offen (dasselbe Muster wie `audioTimer`).
- **Event-Puls:** `onActivity` → dem betroffenen Kabel kurz `.wire--pulse` geben, nach ~150 ms
  entfernen (CSS-Transition). So blitzt Stepseq.amp→Poly.trig bei **jedem** aktiven Step.

---

## 3.6 Verifikation (Playwright, hart begrenzt — Muster wie test/phase2_routing_smoke.py)

Neu `test/phase3_structure_smoke.py`, Watchdog ~40 s, kein Pollen:
- Header-Button „⧉ Struktur" existiert; Klick öffnet `.structure-pop`, nochmal schließt.
- Alle **4 Module** als Kästen (`data-module` o.ä.), jede in `registry.modules()` genannte
  Buchse als `data-port`-Element vorhanden.
- **Kabel:** Anzahl `<path class="wire">` == `registry.connections().length`. Takt→Rec trägt
  `.wire--declared`, Stepseq→Poly nicht.
- **Latenz-Badges** vorhanden (Zahl **oder** „—"-Platzhalter).
- **Puls:** `window.__routing.reg.emit({module:'stepseq',port:'amp'}, 0.8)` → das Stepseq→Poly-
  Kabel bekommt kurz `.wire--pulse` (kurz nach dem emit prüfen). Danach `allNotesOff()`.
- **ESC** schließt; kein `<path>`/Listener bleibt hängen (erneutes Öffnen zeigt weiter 4 Kästen).
- Der Phase-2-Smoke bleibt grün (Registry-Erweiterungen sind additiv).

---

## Was Phase 3 NICHT tut (Abgrenzung)

- **Kein** Umstecken/Kabelziehen, **kein** verschiebbarer Kasten — das ist **Phase 3b**
  (editierbares Patchfeld). Die Registry-API (`connect/disconnect`) steht dafür schon.
- **Keine** neuen Ports/ISMs. **Keine** Migration weiterer harter Verdrahtungen (Takt→Rec bleibt
  klassisch, hier nur ehrlich als „deklariert" dargestellt).
- **Kein** Auto-Layout-Algorithmus.

## Reihenfolge der Umsetzung (verifiziert je Schritt)

1. Registry-Erweiterungen 3.3 (`active`-Flag + `onActivity`) + Takt→Rec als `{active:false}`
   markieren. Phase-2-Smoke muss grün bleiben.
2. `StructureView.js` + Header-Button + CSS: Kästen/Buchsen/Latenz-Badge (noch ohne Kabel).
3. SVG-Kabel + Zustände (value/event/declared).
4. Live-Puls (`onActivity`) + Latenz-Tick.
5. `test/phase3_structure_smoke.py` grün, dann @dpas Auge.
