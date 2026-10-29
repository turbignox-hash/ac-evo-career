@echo off
rem PROVA COPILOTA: preparazione a un comando (31/10). Pre-volo (webui,
rem liveMode, livello radio) + finestre di monitor e ascolto live + scaletta.
rem Protocollo completo: PROVA-COPILOTA.md
cd /d "%~dp0"
node "tools\_prova-prepara.mjs" %*
pause
