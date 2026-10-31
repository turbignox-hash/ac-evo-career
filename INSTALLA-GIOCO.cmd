@echo off
rem installa-gioco.cmd — doppio click: mette le app DENTRO il gioco (1/11/2026).
rem L'installatore un-file (installa.cmd) e il launcher (avvia.cmd) le installano
rem anche da soli, in modo silenzioso: questo file e' la via manuale, per farlo
rem a mano o aggiornare le app quando serve.
rem Serve la mod ACE UI App Loader installata in Saved Games\ACE: se manca,
rem lo dice con parole semplici e dice anche che tutto il resto funziona lo stesso.
setlocal
cd /d "%~dp0"
if exist "%~dp0_node\node.exe" set "PATH=%~dp0_node;%PATH%"
echo.
echo   Applicazioni dentro Assetto Corsa EVO (Cruscotto e Pitwall)...
echo.
node "%~dp0tools\installa-gioco.mjs"
echo.
pause
endlocal
