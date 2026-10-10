@echo off
rem apri-gui.cmd - apre l'interfaccia grafica della carriera EVO nel browser.
rem Il server gira ridotto a icona nella barra delle applicazioni: da li' lo chiudi.
setlocal
cd /d "%~dp0"

echo.
echo   Avvio dell'interfaccia grafica della carriera...
echo   (si apre nel browser su http://127.0.0.1:8642)
echo.

start "Carriera EVO" /MIN "%~dp0gui-run.cmd"

timeout /t 2 >nul
endlocal
