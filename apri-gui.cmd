@echo off
rem apri-gui.cmd - apre l'interfaccia grafica di EVO Pitwall nel browser.
rem Il server vive vicino all'orologio (icona tray): da li' apri o chiudi.
setlocal
cd /d "%~dp0"

echo.
echo   Avvio dell'interfaccia grafica della carriera...
echo   (si apre nel browser su http://127.0.0.1:8642)
echo.

start "EVO Pitwall" /MIN "%~dp0gui-run.cmd"

timeout /t 2 >nul
endlocal
