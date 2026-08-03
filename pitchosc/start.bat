@echo off
rem start.bat - Doppelklick-Start fuer den Werkbank-Einstieg "pitchosc" (von
rem tools/new-entry.mjs erzeugt, @dpa 20260803). Liegt IM Einstiegs-Ordner - %~dp0..
rem ist darum das Projekt-Root, unabhaengig davon, wohin der Ordner verschoben wird.
rem Port-Check per PowerShell-TCP-Probe (verlaesslicher als tasklist-Grepping) - braucht
rem Windows PowerShell, die auf jedem Windows seit Vista mitkommt.
cd /d "%~dp0.."
set SLUG=pitchosc
set PORT=8002

:tryport
start /b "" python -m http.server %PORT% >nul 2>nul
timeout /t 1 /nobreak >nul
powershell -NoProfile -Command "try { (New-Object Net.Sockets.TcpClient).Connect('localhost', %PORT%); exit 0 } catch { exit 1 }" >nul 2>nul
if errorlevel 1 (
  set /a PORT+=1
  if %PORT% lss 8022 goto tryport
  echo Konnte auf keinem Port zwischen 8002 und 8021 starten.
  echo Laeuft "python" ueberhaupt? Ggf. "py" statt "python" versuchen.
  pause
  exit /b 1
)

start "" "http://localhost:%PORT%/%SLUG%/"
echo Server laeuft auf Port %PORT% - dieses Fenster kann geschlossen werden,
echo der Server laeuft im Hintergrund weiter.
pause
