#!/bin/bash
# start.command — Doppelklick-Start für den Werkbank-Einstieg "overcord" (@dpa ddw.md
# 20260803_135251 Punkt 5, s. tools/new-entry.mjs buildStartScript() — dort für jeden neu
# geklonten Einstieg automatisch erzeugt; dieser hier von Hand nachgezogen, weil overcord/
# als einer der zwei Original-Einstiege nicht über new-entry.mjs entsteht). Liegt IM
# Einstiegs-Ordner — "$(dirname "$0")/.." ist darum das Projekt-Root, unabhängig davon,
# wohin der Ordner verschoben/kopiert wird.
cd "$(dirname "$0")/.." || { echo "Projekt-Root nicht gefunden."; read -p "Enter zum Schließen..."; exit 1; }

SLUG="overcord"
PORT=8002
for i in $(seq 0 20); do
  TRY=$((PORT + i))
  python3 -m http.server "$TRY" >/tmp/werkbank-start-$$.log 2>&1 &
  SERVER_PID=$!
  sleep 0.5
  if kill -0 "$SERVER_PID" 2>/dev/null; then
    PORT=$TRY
    break
  fi
  wait "$SERVER_PID" 2>/dev/null
  if [ "$i" -eq 20 ]; then
    echo "Konnte auf keinem Port zwischen 8002 und $TRY starten (Log: /tmp/werkbank-start-$$.log)."
    read -p "Enter zum Schließen..."
    exit 1
  fi
done

sleep 1
open "http://localhost:$PORT/$SLUG/"
echo "Server läuft auf Port $PORT (PID $SERVER_PID) — dieses Fenster kann geschlossen werden,"
echo "der Server läuft im Hintergrund weiter (beenden: kill $SERVER_PID)."
read -p "Enter zum Schließen dieses Fensters..."
