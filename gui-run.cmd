@echo off
rem gui-run.cmd - avvia il server dell'interfaccia grafica con l'icona vicino
rem all'orologio (usato da avvia.cmd, apri-gui.cmd e pilota-*.cmd).
rem Se PowerShell non c'e', resta il vecchio server nella finestra ridotta.
setlocal
cd /d "%~dp0"

set "PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%PS%" goto fallback

start "" "%PS%" -NoProfile -STA -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0tools\evo-tray.ps1"
exit /b 0

:fallback
cd /d "%~dp0src"
node webui.mjs --open
exit /b %errorlevel%
