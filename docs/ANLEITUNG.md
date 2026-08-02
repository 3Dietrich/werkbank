# Werkbank – Anleitung

- Live: **https://3dietrich.github.io/werkbank/** (einfach öffnen — alles läuft im Browser,
- nichts wird hochgeladen; dein Zustand bleibt im localStorage deines Browsers).

**Start:** 
- space (oder Play **▶** im Transport) für Sequnzerstart drücken.  
- im Header → *Snapshots* wählen
- im Browser als Favorit speichern :)
- schließen neu öffnen - kein problem..

**später**
- 'e' tippen für 'Edit Panel'
  - toggle: alles verschiebbar
- rechte mouse über diversen Dingne öffnet dessen settings
- ESC für "raus aus Setting oder Eingabe"
- über main Settings speichern/laden

---

## 1 · Die Instrumente im Überblick

| Instrument | Was es tut |
|---|---|
| **Tempo & Metronom** | BPM (Tap-Tempo, Nudge +/−, Resync `!` / `!!`), Taktart, Metronom-Klang (Cutoff/Reso/Morph), Aufnahme-Einstellungen |
| **Stepsequenzer** | Beliebig viele Sequenzer (`＋` / `－` im ISM-Kopf), jeder mit eigenem Tempo-Verhältnis (`speed Mult/Div`), Schrittzahl, Werte-Grid und **Output-Ziel** |
| **Poly-Synth** | Polyphone Stimmen (Square-PW / Sine-FM), ADSR, Spiel-Keyboard, Basis-Frequenz (Quelle: Freq / Tempo / Ton) und ein **Akkord-Speicher** |
| **Rec** | Nimmt den gemeinsamen Master-Bus auf (WAV/MP3, Name frei wählbar) |
| **Master / Level** | Gesamt-Lautstärke + Ausgangspegel-Anzeige |

Jedes Instrument hat oben rechts ein **≡-Menü** (ISM-Einstellungen: Name, Hintergrund,
Hilfe-Text, **ISM-Snapshots**, Zurücksetzen).

---

## 2 · Spielen in 30 Sekunden

1. **Start:** Im Transport das **▶** drücken — das Metronom läuft. **I** startet ebenfalls,
   aber „weiter" statt „von vorne".
2. **Klang:** Im Poly-Synth auf das **Keyboard** klicken (oder ein MIDI-Keyboard anschließen).
3. **Sequenz:** Im ersten Sequenzer das **Output-Menü** öffnen → ↻ *Neu laden* →
   z. B. `Poly-Synth / Keyboard → Note (KB)` wählen → im Grid Balken ziehen → **An** schalten.
4. **Akkorde:** Am Poly-Synth einen Akkord greifen → im **Speicher** einen leeren Slot
   klicken = gemerkt. Einen Sequenzer auf `Poly-Synth / Keyboard → Speicher-Slot` legen —
   das Grid (Werte = Slot-Nummern) spielt deine Akkorde als Pattern.

---

## 3 · Anordnen & Aussehen (e-Mode)

- Taste **`e`** (oder länger auf den Hintergrund drücken) schaltet den **Anordnen-Modus**:
  Instrumente und Controls lassen sich ziehen, Gruppen skalieren/umbenennen/einklappen.
  Nochmal `e` = fertig.
- **Rechtsklick auf ein Control** öffnet seine Settings: Knob ↔ Fader (vertikal/horizontal),
  Farben, Label, Wertebereich, Hilfe-Text … (alles pro Control, nichts global).
- **ESC** schließt Fenster / verlässt Auswahl / Anordnen — immer eine Ebene pro Druck.

## 4 · Snapshots — vier Ebenen

| Ebene | Wo | Inhalt |
|---|---|---|
| **Combo** | Gruppen-Settings → Combo | Optik + Anordnung *einer* Gruppe |
| **Gruppen-Snapshot** | Gruppen-Settings → Snapshot | *Werte* einer Gruppe (z. B. Akkord-Speicher-Inhalt) |
| **ISM-Snapshot** | ≡-Menü des Instruments | Alle Werte + Ansicht eines Instruments |
| **Ensemble-Snapshot** | Header → **Snapshots** | Alle Instrumente auf einmal (inkl. Sequenzer-Anzahl und -Ansicht) |

Snapshots werden per Klick recalled, mit „✎" umbenannt, „↻" aktualisiert, „🗑" gelöscht.

**⚙ Config** im Header exportiert/importiert den **kompletten** Zustand als JSON-Datei
(Backup, Umzug auf anderen Rechner/Browser). **🔇 Reset** löscht alles (nach Rückfrage).

## 5 · Tasten & MIDI

- **⌨ Tasten** (Header): Overlay-Modus — jedes Control zeigt seine Tastenbelegung,
  Klick darauf lernt eine neue Taste.
- **🎹 MIDI** (Header): dasselbe für MIDI (Noten für Buttons/Keyboards, CC für Knobs).
  Belegungen werden gespeichert und reisen in der Config mit.

## 6 · Routing & Struktur

- Der **Output** jedes Sequenzers ist frei wählbar: jedes Instrument deklariert seine
  fernsteuerbaren Ziele selbst — das Menü zeigt sie als `Instrument / Gruppe → Ziel`.
  Einmal gewählt, bleibt das Ziel auch nach Reload bestehen.
- **⧉ Struktur** (Header) zeigt das Patchfeld: Module, Ports und die Kabel zwischen ihnen —
  inkl. des Modulationswegs `Poly-Synth Base-Frq → Metronom-Cutoff` (wirkt, wenn am
  Metronom *Quant* an ist).

---

## 7 · Tipps

- **Doppelklick** auf einen Knob/Fader setzt seinen Default.
- Das **Grid** eines Sequenzers: ziehen = Wert setzen; in den Grid-Settings (Rechtsklick)
  liegt *aus* (Steps deaktivierbar), min/max/Schrittweite — dort wird auch die Höhe
  (`boxH`) eingestellt.
- Das Metronom-**Tap-System** (⚙️ im Takt-Bereich) kann sich einem externen Groove
  *folgend* anpassen — für Live-Andocken an Musik.
- Alles Wichtige hat einen **Hint**: 💬 Hints im Header einschalten und mit der Maus
  über ein Control fahren (eigene Hint-Texte sind per Rechtsklick editierbar).

---

*Technik: reine ES-Module + Web Audio API, keine Abhängigkeiten, kein Build. Code:
[github.com/3Dietrich/werkbank](https://github.com/3Dietrich/werkbank) — Architektur:
[../ARCHITEKTUR.md](../ARCHITEKTUR.md), Controls-Katalog: [CONTROLS.md](CONTROLS.md).*
