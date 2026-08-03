# pitchosc

Ein Werkbank-Pool-Einstieg (aus `werkbank-leer/` kopiert, s. `../ARCHITEKTUR.md`).

## Starten
Je nach Betriebssystem doppelklicken:
- **macOS:** `start.command`
- **Windows:** `start.bat`
- **Linux:** `start.sh` — Doppelklick startet je nach Dateimanager evtl. nur im Editor statt
  auszuführen; notfalls im Terminal `./start.sh`.

(Oder von Hand: `python3 -m http.server` im Projekt-Root, dann `/pitchosc/` öffnen.)

## Löschen
**NICHT** einfach diesen Ordner in den Papierkorb ziehen — das lässt
`presets/pitchosc-config.json` und (falls veröffentlicht) die Landing-Page-Karte zurück.
Stattdessen `remove.command` (macOS) / `remove.bat` (Windows) / `remove.sh` (Linux)
doppelklicken — räumt alles sauber mit auf.
