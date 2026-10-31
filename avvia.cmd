@echo off
rem avvia.cmd - launcher per ac-evo-career (Assetto Corsa EVO)
rem Doppio click: apre direttamente l'interfaccia grafica nel browser (zero click).
rem Vuoi il menu completo?  apri un terminale nella cartella e lancia:  avvia.cmd menu
rem I comandi diretti restano validi:  avvia.cmd 4   (vedi le voci del menu)
setlocal
cd /d "%~dp0"
rem Node portatile messo dall'installer (installa.cmd): se c'e', vale piu' del
rem Node del sistema (26/10: l'installatore un-file scrive _node\ e non tocca PATH)
if exist "%~dp0_node\node.exe" set "PATH=%~dp0_node;%PATH%"
set "ONESHOT=%~1"

:menu
rem Nessun argomento = doppio click: GUI subito, niente menu.
if not defined ONESHOT goto guidirect
if /i "%ONESHOT%"=="menu" goto showmenu
set "CHOICE=%ONESHOT%"
goto run

:guidirect
echo.
echo   Apro l'interfaccia grafica di EVO Pitwall...
echo   (si apre nel browser su http://127.0.0.1:8642)
echo   Il server gira ridotto a icona nella barra delle applicazioni: da li' lo chiudi.
echo.
call :aprigui
exit /b 0

:showmenu
if not defined EMPTY set "EMPTY=0"
cls
echo ==========================================================
echo   ac-evo-career - carriera per Assetto Corsa EVO
echo ==========================================================
echo.
echo   1   Interfaccia grafica (si apre nel browser)
echo   2   Controlla installazione e contenuto (setup)
echo   3   Nuova carriera
echo   4   Stato della carriera
echo   5   Prossima gara: cosa impostare nel gioco
echo   6   Apri EVO adesso (paga l'iscrizione e segna la gara)
echo   7   Importa il risultato dell'ultima gara
echo   8   Classifica della serie
echo   9   Calendario della stagione
echo  10   Serie disponibili (scala carriera)
echo  11   Mercato di fine stagione
echo  12   Aiuto completo (tutti i comandi)
echo  13   Guardia automatica delle gare (watcher)
echo  14   Firma un'offerta di sedile
echo   0   Esci
echo.
set "CHOICE="
set /p "CHOICE=Scelta: "
if not defined CHOICE (
  set /a EMPTY+=1
  if %EMPTY% GEQ 3 goto :eof
  goto showmenu
)
set "EMPTY=0"

:run
if "%CHOICE%"=="1" goto gui
if "%CHOICE%"=="2" goto setup
if "%CHOICE%"=="3" goto nuovo
if "%CHOICE%"=="4" goto stato
if "%CHOICE%"=="5" goto prossima
if "%CHOICE%"=="6" goto apri
if "%CHOICE%"=="7" goto importa
if "%CHOICE%"=="8" goto classifica
if "%CHOICE%"=="9" goto calendario
if "%CHOICE%"=="10" goto serie
if "%CHOICE%"=="11" goto mercato
if "%CHOICE%"=="12" goto aiuto
if "%CHOICE%"=="13" goto guardia
if "%CHOICE%"=="14" goto firma

if "%CHOICE%"=="0" goto :eof
echo.
echo Scelta non valida.
goto dopo

:gui
call :aprigui
goto dopo

:setup
call :run setup
goto dopo

:nuovo
echo.
set "NOME="
set /p "NOME=Nome pilota (come sei chiamato in EVO): "
if not defined NOME goto dopo
set "NAZ="
set /p "NAZ=Nazione in 3 lettere [ITA]: "
if not defined NAZ set "NAZ=ITA"
call :run new --name "%NOME%" --nation %NAZ%
goto dopo

:stato
call :run status
goto dopo

:prossima
call :run next
goto dopo

:apri
call :run race
goto dopo

:importa
call :run import
if errorlevel 1 (
  echo.
  echo Se il file di risultato non viene riconosciuto, usa la posizione a mano:
  echo   avvia.cmd 6  non basta? apri il terminale e scrivi:
  echo   node ac-evo-career.mjs import --position 3 --cars 12
  echo   node ac-evo-career.mjs import --inspect --full
)
goto dopo

:classifica
call :run standings
goto dopo

:calendario
call :run calendar
goto dopo

:serie
call :run series
goto dopo

:mercato
call :run season-end
goto dopo

:firma
set "NUM="
set /p "NUM=Numero dell'offerta da firmare: "
if not defined NUM goto dopo
call :run accept %NUM%
goto dopo

:aiuto
call :run help
goto dopo

:guardia
echo.
echo   La guardia si apre in una finestra a parte: restera' a vigilo'
echo   finche' quella finestra resta aperta.
echo.
start "EVO Pitwall — guardia" "%~dp0guarda.cmd"
goto dopo

:aprigui
rem aggiornamenti: se GitHub e' avanti del disco, chiede s/N (Invio o 15s = no)
node "%~dp0tools\aggiornamenti.mjs" --breve 2>nul
rem avviso discreto: parla solo se il backup e' stantio o incompleto
node "%~dp0tools\magazzino-check.mjs" --breve 2>nul
rem backup del save (26/10): zip in data\salva-save\slot-1/2, max 4, SOLO se
rem stantio (>36h) o con --force; senza gioco installato esce 0 e non tocca niente
node "%~dp0tools\salva-save.mjs" 2>nul
rem scorciatoia «Carriera EVO» sul desktop: la crea solo se manca o e' senza icona (silenziosa)
node "%~dp0tools\crea-scorciatoia.mjs" 2>nul
rem app DENTRO il gioco (cruscotto + pitwall, 1/11): si installano/aggiornano da
rem sole e in silenzio; parlano solo quando copiano qualcosa o se manca la mod
rem ACE UI App Loader (senza mod il resto funziona comunque: GUI, carriera, gare)
node "%~dp0tools\installa-gioco.mjs" --silenzioso 2>nul
start "EVO Pitwall" /MIN "%~dp0gui-run.cmd"
exit /b 0

:run
node "%~dp0ac-evo-career.mjs" %*
exit /b %errorlevel%

:dopo
echo.
if defined ONESHOT goto :eof
pause
goto showmenu

