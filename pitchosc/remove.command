#!/bin/bash
# remove.command — Doppelklick-Löschung für den Werkbank-Einstieg "pitchosc" (von
# tools/new-entry.mjs erzeugt, @dpa 20260803). Ruft nur tools/remove-entry.mjs auf, keine
# eigene Löschlogik. Fragt vorher nach, weil ein Doppelklick sonst ohne Warnung löscht.
cd "$(dirname "$0")/.." || { echo "Projekt-Root nicht gefunden."; read -p "Enter zum Schließen..."; exit 1; }

echo "Das löscht den kompletten Ordner \"pitchosc/\" (samt presets/pitchosc-config.json"
echo "und ggf. seiner Landing-Page-Karte) unwiderruflich vom Datenträger."
read -p "Wirklich löschen? [y/N] " ANTWORT
if [ "$ANTWORT" != "y" ] && [ "$ANTWORT" != "Y" ]; then
  echo "Abgebrochen."
  read -p "Enter zum Schließen..."
  exit 0
fi

node tools/remove-entry.mjs "pitchosc"
read -p "Enter zum Schließen dieses Fensters..."
