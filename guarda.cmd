@echo off
rem guarda.cmd - guardia automatica della carriera: incassa da solo ogni gara
rem nuova che Assetto Corsa EVO scrive in Results (fino a quando non lo chiudi).
rem La finestra resta aperta: chiuderla arresta il watcher (Ctrl+C oppure la X).
setlocal
cd /d "%~dp0"

echo.
echo   Guardia della carriera attiva: ogni gara nuova viene incassata da sola.
echo   (registro anti-doppioni e backup automatico inclusi; Ctrl+C per fermarla)
echo.

node ac-evo-career.mjs watch
pause
endlocal
