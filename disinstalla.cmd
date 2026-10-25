@echo off
rem ============================================================
rem  disinstalla.cmd — l'inverso di installa.cmd (26/10). UN file
rem  solo: chiede la cartella (Invio = %USERPROFILE%\EVO-Pitwall),
rem  passa due guardie, toglie scorciatoia + cartella.
rem
rem  Le guardie, dette in chiaro:
rem    1. se la cartella non assomiglia a un'installazione (manca
rem       ac-evo-career.mjs), NON tocca niente e finisce.
rem    2. se dentro data\ c'e' una CARRIERA, chiede cosa farne:
rem          [b] via tutto (carriera compresa)
rem          [k] tengo la carriera: data\ traslocata accanto
rem          [n] annullo
rem  La scorciatoia «Carriera EVO» del Desktop va via SOLO se punta
rem  alla cartella che si disinstalla: altrimenti sta al suo posto.
rem
rem  --- override d'ambiente (per il test sandbox):
rem    EVO_DISINSTALLA_DIR      cartella di destinazione (niente domande)
rem    EVO_DISINSTALLA_OK       niente conferme: via tutto (carriera inclusa)
rem    EVO_DISINSTALLA_KEEP     tengo la carriera (data\ traslocata)
rem    EVO_DISINSTALLA_DESKTOP  desktop-vacanze del test (lista ';': se manca, i veri)
rem    EVO_DISINSTALLA_RELAY    interno: la copia-servizio aspetta 2 s prima
rem                             di cancellare, per lascirea finire il padre
rem ============================================================
setlocal enabledelayedexpansion
set "TARGET=%USERPROFILE%\EVO-Pitwall"
if defined EVO_DISINSTALLA_DIR set "TARGET=%EVO_DISINSTALLA_DIR%"
rem copia-servizio: se la copia da cancellare contiene anche il file del
rem padre (che muore tra poco), do tempo al padre di uscire prima di pulire
rem — senza tempo, il suo file apetto versa la rmdir fuori (verificato)
if defined EVO_DISINSTALLA_RELAY if exist "%TARGET%\disinstalla.cmd" timeout /t 2 /nobreak >nul

if not defined EVO_DISINSTALLA_DIR (
  echo.
  echo   Cartella da disinstallare [Invio = %TARGET%]
  set /p "RISP=   > "
  if defined RISP set "TARGET=!RISP!"
  if "!TARGET:~-1!"=="\" set "TARGET=!TARGET:~0,-1!"
)

rem --------------- guardia 1: sembra un'installazione? ---------------
if not exist "%TARGET%\ac-evo-career.mjs" goto nonsimile
rem %~dp0 finisce sempre con la barra: rimuovata, altrimenti il confronto
rem con TARGET non coincide MAI e il saltello non parte (verificato 26/10)
set "IO=%~dp0"
if "%IO:~-1%"=="\" set "IO=%IO:~0,-1%"
if /i "%TARGET%"=="%IO%" goto equestaquella

rem --------------- guardia 2: carriera dentro? ---------------
set "TENIMI="
if defined EVO_DISINSTALLA_KEEP set "TENIMI=1"
if exist "%TARGET%\data\career.json" if not defined EVO_DISINSTALLA_OK if not defined TENIMI (
  echo.
  echo   [!] Dentro "%TARGET%\data" c'e' una carriera: cosa ne faccio?
  echo         [b] via tutto, carriera compresa
  echo         [k] tengo la carriera: data\ traslocata accanto a "%TARGET%"
  echo         [n] annullo, non tocco niente
  set "SC="
  set /p "SC=   > "
  if /i "!SC!"=="k" set "TENIMI=1"
  if /i "!SC!"=="n" goto annulla
  if defined SC goto sc_fatta
  rem vuoto = prudente: annullo
  echo   Risposta vuota: annullo. Riprova rispondendo b o k.
  exit /b 1
)
:sc_fatta

rem --------------- tengo la carriera: traslocco data\ ---------------
if defined TENIMI if exist "%TARGET%\data" (
  set "PORTA=%TARGET%-data"
  if exist "!PORTA!" (
    for /f %%N in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd-HHmmss"') do set "SUFF=%%N"
    set "PORTA=%TARGET%-data-!SUFF!"
  )
  echo   Tengo la carriera: sposto data\ in "!PORTA!"...
  move "%TARGET%\data" "!PORTA!" >nul
  if errorlevel 1 (
    echo   [i] Trasloco non riuscito: FERMO TUTTO, niente cancellato.
    echo       Sposta a mano "%TARGET%\data" e poi ri-lancia questo file.
    exit /b 1
  ))

rem --------------- scorciatoia: via SOLO se punta qua ---------------
set "EVO_TARGET=%TARGET%"
echo.
echo   Scorciatoia «Carriera EVO» sul Desktop: la tolgo solo se punta qua...
powershell -NoProfile -ExecutionPolicy Bypass -Command^
  "$sh=New-Object -ComObject WScript.Shell;$t=Join-Path $env:EVO_TARGET 'avvia.cmd';$desktops=@();if($env:EVO_DISINSTALLA_DESKTOP){$desktops+=($env:EVO_DISINSTALLA_DESKTOP -split ';'|Where-Object {$_})}else{$desktops+=[Environment]::GetFolderPath('Desktop');$desktops+=($env:USERPROFILE+'\\Desktop')};$viste=@();foreach($d in $desktops){$x=Join-Path $d 'Carriera EVO.lnk';if((Test-Path -LiteralPath $x) -and -not ($viste -contains $x)){$viste+=$x;$s=$sh.CreateShortcut($x);if($s.TargetPath -ieq $t){Remove-Item -LiteralPath $x -Force;Write-Output '   - tolta: puntava a questa installazione'}else{Write-Output '   - resta: non punta a questa installazione'}}}"

rem --------------- via la cartella ---------------
echo.
if not defined EVO_DISINSTALLA_OK goto chiediconferma
goto via_tutto

:chiediconferma
echo   Tengo da parte niente: dico cosa va via.
echo   "%TARGET%" [e tutto il suo contenuto] verra' CANCELLATO.
set "C="
set /p "C=   Confermi? [Invio o s = si, n = annulla]: "
if not defined C goto via_tutto
if /i "!C!"=="s" goto via_tutto
if /i "!C!"=="n" goto annulla
echo   Risposta non capita: annullo.
exit /b 1

:via_tutto
echo   Tolgo "%TARGET%"...
rmdir /S /Q "%TARGET%" 2>nul
if exist "%TARGET%" goto hpersomacchia
echo.
echo   [x] Disinstallata: tolta la cartella [e la sua scorciatoia se c'era per lei].
rem nota onesta: la copia-servizio in TEMP rimane (qualche KB): il dis
rem rms self-yourself-non-passa col batch in-corsa, e TEMP si ripulise da
rem Windows da solo — la lascio perdere,.zero danno.
ver >nul
exit /b 0

:hpersomacchia
echo   [i] Non ho levato tutto "%TARGET%": il launcher e' ancora APERTO
echo       (icona nella barra delle applicazioni). Chiudilo e ri-lancia.
exit /b 1

:annulla
echo   Annullato: niente toccato.
exit /b 1

:nonsimile
echo   [i] In "%TARGET%" manca ac-evo-career.mjs: non sembra un'installazione
echo       di Carriera EVO, quindi non tocco niente.
exit /b 1

:equestaquella
rem lanciato DALLA cartella che deve morire: lo script in corsa non può
rem cancellare la cartella sua (il file aperto la blocca). Saltello: copia
rem a TEMP, riparto da li' IN BACKGROunD e il padre esce; la copia attende
rem 2 s e pulisce tutto.
if not defined EVO_DISINSTALLA_DIR set "EVO_DISINSTALLA_DIR=%TARGET%"
set "EVO_DISINSTALLA_RELAY=1"
copy "%~f0" "%TMP%\disinstalla-run.cmd" >nul 2>&1
if errorlevel 1 goto punta_fermo
start "" /b "%COMSPEC%" /d /c "%TMP%\disinstalla-run.cmd"
exit /b 0

:punta_fermo
echo   [i] "%TARGET%" e' la cartella che questo script sta usando e la copia
echo       di servizio in TEMP non e' passata: copia a mano disinstalla.cmd
echo       sul Desktop e ri-lancialo da li'. Niente toccato.
exit /b 1