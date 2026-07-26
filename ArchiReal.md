# ArchiReal.md — Erkenntnisse aus der Praxis (Multi-ADSR-Umbau, 20260725/26)

> Ergänzung zu ARCHITEKTUR.md: Dinge, die beim Bau der Multi-ADSR **tatsächlich**
> schiefgingen oder überraschend waren. Keine Spezifikation — gelernte Fallstricke.

## Web Audio Fallstricke

- **`setValueCurveAtTime` mit negativer Startzeit wirft `RangeError`** („Time must be a
  finite non-negative number") — wenn `t + startOffset < 0` (frischer AudioContext,
  `currentTime` < 0.5 ms). Der Outin-Fade-Vorgriff muss auf 0 geklemmt werden:
  `Math.max(0, t + startOffset)`. Der Fehler schlägt lautlos durch (try/catch fehlt
  im Trigger-Pfad) → „nichts zu hören" ohne Console-Hinweis. (20260726, multiEnv.js)
- **Unverbundene Nodes rendern ihre AudioParams nicht.** Ein `GainNode`, der nirgends
  angeschlossen ist, aktualisiert `.value` nicht — bleibt starr auf dem Initialwert.
  Lösung (multiEnv.js): über einen 0-Gain an `destination` hängen → unhörbar, aber der
  Param läuft und `.value` liefert den echten Verlauf (für Routing-`read()`/flush).
- **`setValueCurveAtTime` mit Startzeit in der Vergangenheit ist erlaubt** und setzt die
  Kurve sofort an der richtigen Position fort (Outin-Fade-Trick: Fade 0.5 ms vor den
  eigentlichen Trigger vorverlegen → in-time statt 0.5 ms zu spät).
- **`Math.max(...float32Array)`** spreadet TypedArrays nicht zuverlässig für Min/Max-
  Tests mit negativen Werten — in Tests `Math.min(...Array.from(curve))` verwenden.

## Playwright-Tests gegen die Werkbank

- **Hintergrund-Tabs drosseln rAF UND setTimeout massiv** (gemessen: 40 ms-Poll wurde
  zu ~1 s). Eine 0.31 s-Envelope ist vor dem ersten Poll durch → Messung zeigt fälschlich
  „funktioniert nicht". Zeitmessung im Test gegen `ctx.currentTime` (Audio-Clock) statt
  gegen Timer, oder Werte synchron direkt nach dem Auslösen lesen.
- **ES-Module werden aggressiv gecacht** — `page.reload()` reicht NICHT, auch kein
  `?cb=`-Query-String (der ändert nur die HTML-URL, nicht die Modul-URLs). Zuverlässig:
  CDP `Network.clearBrowserCache` vor dem Reload.
- Der Python-`http.server` schickt keine Cache-Header — trotzdem cached der Browser
  Module hartnäckig. Beim Debuggen immer erst prüfen, ob der neue Code überhaupt
  angekommen ist (z.B. `Object.keys(engine)` auf neue Methoden prüfen).

## Routing (lib/routing/)

- **`inputTargets(type)` filtert Ports ohne `min`/`max` weg** („Nur Ports, die eine
  Wertspanne DEKLARIEREN, sind als Sq-Ziel gemeint"). Ein neuer Input-Port OHNE min/max
  taucht in keinem Ziel-Menü auf — auch nicht im eigenen. Gate-Inputs brauchen
  `min:0, max:1, stepSize:1, offAllowed:true`.
- **Port-Typ bestimmt die Zielliste**: `OSZ-F` hatte im Ensemble null kompatible Ziele
  (kein Input dieses Typs mit min/max). Für generische Modulationswerte `Value` nehmen.
- **`registerModule`-Inputs in `modules()` tragen KEIN `write`** — `modulesList()`
  mappt nur id/label/type. Wer `write` prüfen will, muss `deliver()` aufrufen oder
  sich einen Test-Wrapper bauen.
- `deliver(srcRef, dstRef, value)` braucht den Output-Port nur für Typ-Adaption;
  `srcRef.instance` erzeugt die `srcId` (`modul#instanz`) fürs Legato-Gedächtnis
  pro Klon (multiSq-Bugfix „lautes Getöse").

## GroupHost / Controls

- **`mountInGroup` allein registriert KEINE Element-Settings.** Rechtsklick auf ein so
  gemountetes Control bubbelt zur GRUPPE durch. Erst `registerCtrlStyle(id, art, el,
  applyStyle, label)` stoppt die Propagation und öffnet die echten Settings
  (Vorbild: `s:seqOutput` in multiSq.js — 1:1 kopierbar).
- **`data-ctrl`-Selektor statt Label-Matching**: Controls tragen `data-ctrl="k:key_i"`.
  Sichtbarkeit/Ansprechen einzelner Controls immer darüber, nie über sichtbare Texte
  (Klassennamen der Label-Elemente sind anders als erwartet).
- **`PickMenu.current()` muss den ANZEIGENAMEN zurückgeben** (Listeneintrag-Name),
  nicht den persistierten Wert (`'modul.port'`) — sonst zeigt der Button trotz
  gesetztem State „— kein Ziel —".
- PickMenu-Fußzeilen-Icons müssen in `icons.js` existieren (`load` ja, `reload` nein —
  Fehler fällt erst beim Öffnen des Menüs auf, als `pageError`).
- **Neue Panel-Elemente gehören in defs** (KNOBS/BUTTONS/…), NICHT als loses DOM in die
  Gruppe — nur defs-Controls bekommen KeyMidi, Element-Settings und e-Mode gratis.
  Indizierte Instanz-Buttons: Template in defs (`adsrGate`), Manager schreibt
  `defs.BUTTONS[key+sfx]`, `addGroup({buttons: [...]})`, Klick läuft über
  `onAction('adsrGate_i')` → Manager-Methode (TDZ-sichere Closure, Vorbild
  polySynthKeyboard in werkbank.js).

## PolySynth-Engine

- **Modulation wirkt sonst nur beim Anschlag**: `noteFreq()` wird bei noteOn/retune
  aufgerufen. Ein laufender Ton ändert seine Frequenz durch preMod/postMod NICHT —
  Wert-Setter müssen bei Änderung `retuneHeld()` auslösen (gleitet per pitchSmooth,
  kein Zipper). Verifiziert: noteOn(60) 261.2 Hz → 489.5 Hz bei mod=1
  (Oktave × pitchSmooth-Glide ≈ ratio 1.87 nach 400 ms).
- `preMod` VOR `harmonicSnap`, `postMod` NACH der roh↔gerastet-Überblendung —
  beide Default 1 → ohne Verbindung bit-identisch (Amp-Env-Verhalten unverändert).

## Vorgehen, das sich bewährt hat

1. Erst reine DSP testbar machen (envCore.js, 11 Unit-Tests, `node --test`).
2. **Ketten-Selbsttest als Python-Playwright-Smoke** (`test/adsrKette_smoke.py`):
   headless, Watchdog, und — entscheidend — **Messpunkte synchron über
   `ctx.currentTime` + busy-wait** statt setTimeout/rAF. Damit spielt die
   Hintergrund-Drosselung keine Rolle, und der Test prüft die KOMPLETTE Kette
   (Gate → Env → flush → preQuantMod → Frequenz an gehaltener Note) in einem
   einzigen `page.evaluate`.
3. UI-Verkabelung im Browser mit CDP-Cache-Clear + Audio-Clock-Messung prüfen.
4. Bei „funktioniert nicht" zuerst prüfen: kommt der neue Code an (Cache)? läuft der
   Render-Loop (sichtbarer Tab)? ist der Wert zum Messzeitpunkt überhaupt noch da?
   **Wirft eine Web-Audio-Methode still eine Exception?** (RangeError an Grenzen —
   ohne try/catch im Trigger-Pfad sieht man das nur im pageerror-Handler des Tests.)
5. Erfolgreiche Muster (multiSq) 1:1 kopieren statt Varianten erfinden — die Details
   (registerCtrlStyle, noContextOpen, tailAlign, PickMenu-current-Semantik) sind
   genau die Stellen, an denen Abweichungen sofort auffallen.
