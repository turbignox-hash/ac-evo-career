@echo off
rem pilota-1.cmd - lancia il tool sullo SLOT 1: la carriera di sempre (Mauro).
rem
rem 3 lanciatori, un pilota ciascuno:
rem   pilota-1.cmd  = la TUA carriera (nessun cambiamento, stesso file di prima)
rem   pilota-2.cmd  = la carriera del secondo pilota
rem   pilota-3.cmd  = la carriera del terzo pilota
rem
rem Doppio click sul lanciatore del pilota: si apre il browser sulla sua carriera.

setlocal
cd /d "%~dp0"
set ACE_SLOT=1

echo.
echo   La TUA carriera (slot 1)...
echo   (salvataggio invariato: data\evo-career.save.json)
echo.

start "EVO Pitwall Slot 1" /MIN "%~dp0gui-run.cmd"

timeout /t 2 >nul
endlocal
