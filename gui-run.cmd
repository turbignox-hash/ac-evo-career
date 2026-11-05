@echo off
rem gui-run.cmd - avvia il server dell'interfaccia grafica con l'icona vicino
rem all'orologio (usato da avvia.cmd, apri-gui.cmd e pilota-*.cmd).
rem Se PowerShell non c'e', resta il vecchio server nella finestra ridotta.
setlocal
cd /d "%~dp0"

set "PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%PS%" goto fallback

rem 6/11: niente console neanche per un istante. Con Windows Terminal come
rem terminale predefinito, -WindowStyle Hidden apre lo stesso una scheda nera
rem "Windows PowerShell"; WScript.Shell.Run con stile 0 no (vedi tools\evo-tray.vbs).
if not exist "%~dp0tools\evo-tray.vbs" goto traypowershell
start "" "%SystemRoot%\System32\wscript.exe" //nologo "%~dp0tools\evo-tray.vbs"
exit /b 0

:traypowershell
rem riserva: senza wscript o senza il VBS resta la vecchia via PowerShell nascosta.
start "" "%PS%" -NoProfile -STA -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0tools\evo-tray.ps1"
exit /b 0

:fallback
cd /d "%~dp0src"
node webui.mjs --open
exit /b %errorlevel%
