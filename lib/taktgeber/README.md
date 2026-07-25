# Taktgeber

Die Uhr — eigenständig, ohne Instrument drumherum. Start/Stop, Tempo (tippen oder
mittappen), Takt und ein hörbarer Klick. Sonst nichts.

Das Bild dazu ist @dpas (20260717): **ein Netzteil an einer Werkbank.** Es steht neben
der Arbeit, nicht mitten drin; es liefert Takt statt Strom; und es lässt sich selbst auf
der Werkbank aufschrauben.

## Starten

ES-Module → lokaler Server nötig (kein `file://`):

```bash
cd ~/Music/KI_html/taktgeber && python3 -m http.server 8000 & sleep 1 && open http://localhost:8000/
```

**`Address already in use`** = auf dem Port läuft schon ein Server aus einer früheren
Session. Beenden mit `kill $(lsof -ti :8000)` (Port anpassen), oder den laufenden einfach
weiterbenutzen (`lsof -i :8000` zeigt, wer draufsitzt).

## Was drin ist

Drei Gruppen, alle **klein und nebeneinander** — keine füllt den Schirm (das nagelt
`test/smoke.py` fest). Klick auf den Gruppen-Titel klappt sie ein, **Rechtsklick** öffnet
ihre Settings, Rechtsklick auf ein Control zeigt Info / ausblenden / Reset.

### Transport

`▶ Start` · `!` · `!!` · `−` / `+` · BPM-Anzeige · Beat-Punkte.

- **`!` und `!!` unterscheiden sich in der Phase**, nicht im Umfang. `!` schiebt nur die 1
  auf den nächsten Schlag, der Takt läuft unbeirrt weiter. `!!` zieht den Schlag sofort
  hierher. Beide wirken nur im Lauf — gestoppt gibt es keine Phase, auf die man syncen
  könnte, also sind sie ausgegraut. (Dieselben zwei Knöpfe sitzen seit 20260717 auch an
  teslacoils Start/Stop.)
- **`−` / `+` biegen das Tempo, solange sie gedrückt sind** („Anschieben ± " in den
  Settings, Default 2 BPM, Anlauf 500 ms). Der gespeicherte Wert bleibt unangetastet →
  Loslassen ist sofort wieder das Original. Die Anzeige färbt sich, solange gebogen wird.
- **Doppelklick auf die BPM-Anzeige = eintippen.** Enter übernimmt, ESC verwirft.

### Tempo

`Tab 🎵` — im Takt mittippen (oder Taste `T`). Alles Weitere steht unter **Technik** in den
Settings, s.u.

- **Mode 1 (konstant):** erste 2 Klicks = Referenz, danach über **alle** Klicks mitteln
  (Gesamtspanne / Gesamt-Beats). Ausgelassene Beats (2×/3×/4× …) werden erkannt,
  Fehlklicks außerhalb ±Fenster ignoriert.
- **Mode 2 (folgend):** gleitendes Fenster; ab dem 3. Klick wird live mitgesynct.

### Takt / Metronom

Beats/Takt · aktiv · Level · `l` / `m` · LP↔HP · Cutoff · Reso.

Der Klang ist **1:1 teslacoils Metronom**: ein gefilterter Knack (Vadim-SVF), kein
Piepton. Ohne dessen `Quant` und `Band` — die falteten den Cutoff auf teslacoils BaseFrq,
und eine BaseFrq hat eine Uhr nicht. Übrig bleibt der Cutoff als freier Regler, und genau
den ersetzte `Quant` drüben.

`l`/`m` ist die Klick-Periode als Vielfaches des Schlags: `1/1` = auf jeden Schlag,
`1/2` = doppelt so oft. Die Beat-Punkte zeigen weiter den **Takt**, nicht den Klick — es
sind zwei Uhren, absichtlich.

## Settings: zwei Sorten

@dpa 20260717: *„Settings müssen getrennt werden."*

| | |
|---|---|
| **Ansicht** | Farbe, Größe, Sichtbarkeit. Baut [ui.js](ui.js) für jede Gruppe selbst. |
| **Technik** | Alles mit `tech: true` im Manifest: max. BPM, Nudge, Tap-Parameter, **Shortcuts**. |

Beide liegen in **einem schwebenden, verschiebbaren Fenster** pro Gruppe. Nicht als
aufklappender Block im Körper: der schob alles darunter weg, und Platz ist hier das Thema.

**Shortcuts sind frei belegbar** (Settings → Technik → auf die Taste klicken, dann die
gewünschte drücken; ESC bricht ab, Backspace löscht). Default: Leertaste = Start/Stop ·
`T` = Tab · `1` / `2` = ! / !! · `[` / `]` = bremsen / anschieben · `b` + Ziffer =
Beats/Takt (`b3` → 3).

## Das Maximum halbiert, es klemmt nicht

`max. BPM` (Default 400) ist keine Schere. Wer zu schnell tippt — oder 2216 in die Anzeige
schreibt — bekommt **die höchste Hälfte darunter**, mit genau diesem Hinweis:

```
277 BpM (*8)          ← 2216 / 8 = 277
```

Zwei Gründe, beide echt. Erstens **war es ein Absturz**: ein Doppelklick sind ~30 ms
Abstand = 2000 BPM, und bei so kurzen Schlägen plante der Scheduler pro 25-ms-Tick
hunderte Klick-Quellen — der Tab starb (@dpa: *„ich konnte es so schnell tabben dass es neu
lud"*). Zweitens **ist Halbieren fast immer gemeint**: wer 2216 tippt, hat auf Sechzehntel
getippt und meint denselben Puls. Ein Deckel bei 400 machte aus jedem zu schnellen Tap
dasselbe stumpfe 400.

Der zweite Riegel gegen den Absturz sitzt im Scheduler selbst (`MAX_PER_TICK` in
[clock.js](clock.js)) — der hält auch, wenn ein Tempo mal anders hereinkommt.

## Der Nudge stimmt (gemessen)

@dpa 20260717: *„ist das tempo bei anschieben/bremsen auch 2 BpM schneller, so wie es
angezeigt wird? schien mir nicht so.."*

Nachgemessen, nicht hergeleitet — Abstände der echten Schläge auf der AudioContext-Uhr,
nicht die Anzeige: **ohne 120,06 BPM, mit Anschieben 121,97 BPM.** Die Anzeige sagt die
Wahrheit, die Uhr folgt ihr.

Dass es nicht so klingt, ist trotzdem keine Einbildung: 2 BPM von 120 sind 1,6 %, und über
eine halbe Sekunde Drücken sind das ~8 ms Vorsprung — unter der Wahrnehmungsschwelle.
Ein Nudge zeigt sich erst über viele Schläge. Wer ihn *hören* will, dreht in den Settings
an **Anschieben ±** (bis 20 BPM) — der Regler ist genau dafür da, und geklemmt wird da
nichts.

## Tests

```bash
node test/tapTempo.test.mjs   # 16 · Tap-Kern + foldBpm (das Falt-Maximum)
node test/state.test.mjs      # 12 · SSOT: Events, Werte/Settings-Trennung, off()
python3 test/smoke.py         # headless: lädt, !/!!-Gating, Faltung + Hinweis,
                              #           Shortcuts, Settings-Aufteilung, Kompaktheit
```

## Die Nahtstellen (fürs Zusammenlaufen mit der [Werkbank](../werkbank/))

Der Taktgeber ist absichtlich so geschnitten, dass die Werkbank ihn aufnehmen kann, ohne
seine UI zu kennen — dieselbe Arbeitsteilung wie in teslacoil, nur klein:

| Datei | Was es ist | Braucht |
|---|---|---|
| [state.js](state.js) | die SSOT: flaches Parameter-Objekt + `get/set/on/off` | – |
| [modules.js](modules.js) | das **Manifest**: jede Gruppe, jedes Control, jeder Bereich | – |
| [ui.js](ui.js) | generischer Renderer: baut ALLES aus dem Manifest | `state.js` |
| [clock.js](clock.js) | die Uhr (Lookahead, `!`/`!!`, Worker-Ticker) | ein `AudioContext` |
| [metro.js](metro.js) | der Klick | `AudioContext`, `dsp/` |
| [tapTempo.js](tapTempo.js) | Tap-Kern + `foldBpm` | – (reine Logik) |

Der Punkt ist **modules.js**: wer es liest, kennt jeden Parameter, seinen Bereich und sein
Automations-Ziel — ohne eine Zeile UI. Ein neuer Regler ist ein Eintrag dort, sonst nichts.
`ui.js` kennt keinen einzigen Parameter beim Namen, nur Sorten (`range`, `toggle`,
`segment`, `keybind`) und Aktions-Blöcke, die der Aufrufer beisteuert.

`dsp/metroClick.js` und `dsp/svf.js` sind **Kopien aus teslacoil**, kein Import: der
Taktgeber soll ohne ihn laufen. Ändert sich der Knack drüben, gehört er hier nachgezogen.

## Noch offen

- **Die Gruppe ist hier ein eigener kleiner Nachbau**, nicht teslacoils Gruppe. Die liegt
  weiter in dessen `js/app.js` (Freeze, Anordnen-Modus, Gruppen-Snapshots) — sie
  herauszulösen ist der Schritt, den auch die [Werkbank](../werkbank/README.md) noch offen
  hat. Danach sollte diese hier dagegen getauscht werden, statt zwei Gruppen zu pflegen.
- **Kein Speicher.** Nichts überlebt einen Reload (kein localStorage, keine Snapshots).
  Bewusst: wo der Taktgeber am Ende hängt, ist noch offen — dort liegt dann auch sein
  Speicher.
- **MIDI-Learn** (Transport-Settings) ist unverändert da, aber noch nie an einem echten
  Gerät gewesen. Es schaltet Start/Stop; die Bindung überlebt keinen Reload (s. „kein
  Speicher").
