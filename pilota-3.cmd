@echo off
rem pilota-3.cmd - lancia il tool sullo SLOT 3: la carriera del terzo pilota.
rem
rem 3 lanciatori, un pilota ciascuno:
rem   pilota-1.cmd  = la carriera di sempre (nessun cambiamento, slot 1)
rem   pilota-2.cmd  = la carriera del secondo pilota
rem   pilota-3.cmd  = la carriera del terzo pilota (QUESTO file)
rem
rem Doppio click sul lanciatore del pilota: si apre il browser sulla SUA carriera.

setlocal
cd /d "%~dp0"
set ACE_SLOT=3

echo.
echo   Carriera del TERZO PILOTA (slot 3)...
echo   (salvataggio suo e separato: data\evo-career.save-3.json)
echo.

start "EVO Pitwall Slot 3" /MIN "%~dp0gui-run.cmd"

timeout /t 2 >nul
endlocal
