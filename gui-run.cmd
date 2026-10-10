@echo off
rem gui-run.cmd - avvia il server dell'interfaccia grafica (usato da avvia.cmd e apri-gui.cmd).
cd /d "%~dp0src"
node webui.mjs --open
