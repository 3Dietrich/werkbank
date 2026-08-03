@echo off
rem remove.bat - Doppelklick-Loeschung fuer den Werkbank-Einstieg "pitchosc" (von
rem tools/new-entry.mjs erzeugt, @dpa 20260803). Ruft nur tools/remove-entry.mjs auf.
cd /d "%~dp0.."

echo Das loescht den kompletten Ordner "pitchosc\" (samt presets\pitchosc-config.json
echo und ggf. seiner Landing-Page-Karte) unwiderruflich vom Datentraeger.
set /p ANTWORT=Wirklich loeschen? [j/N]
if /i not "%ANTWORT%"=="j" (
  echo Abgebrochen.
  pause
  exit /b 0
)

node tools\remove-entry.mjs "pitchosc"
pause
