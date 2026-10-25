@echo off
rem ============================================================
rem  installa.cmd — L'INSTALLATORE UN FILE (26/10, richiesta Mauro:
rem  «facciamo finta che github non esista: un'installazione semplice,
rem  style windows, che installa tutto con un comando»; i pacchetti da
rem  inviare a ogni amico non esistono piu').
rem
rem  UN file singolo: basta condividerlo (WhatsApp, mail, Drive). Il
rem  friend lo lancia e l'installer fa TUTTO da solo:
rem    1. chiede la cartella di installazione (Invio = %USERPROFILE%\EVO-Pitwall);
rem    2. usa il Node del PC se c'e', altrimenti scarica un Node PORTATILE
rem       dentro la cartella (niente admin, niente winget);
rem    3. chiede UNA volta il token di LETTURA GitHub (solo se il repo
rem       ri-passe privato) e lo salva in data\.github-token: da li',
rem       gli aggiornamenti automatici del launcher sono gia' a posto;
rem    4. scarica il codice (zipball di main), lo estrae nella cartella e
rem       scrive build-id.txt: la build nasce allineata a GitHub;
rem    5. una passata di npm test (o MODO VELOCE: 'v' alla domanda salti);
rem    6. scorciatoia «Carriera EVO» sul Desktop, icona compresa;
rem    7. avvia il launcher (wizard di prima apertura incluso).
rem  data\ non si copia: nasce vergine sul PC nuovo.
rem
rem  --- PRESA DI PROVA (sandbox, senza scarichi veri) ---
rem  Variabili d'ambiente opzionali usate dal test automatico
rem  (test\installatore-sandbox.test.mjs) e da chi vuole provare a mano:
rem    EVO_INSTALLER_DIR           cartella di destinazione (niente domanda)
rem    EVO_INSTALLER_API           base API alternativa (es. il server finto locale)
rem    EVO_INSTALLER_AUTO=1        salta le domande (cartella e token)
rem    EVO_INSTALLER_FAST=1        modo veloce: salta npm test
rem    EVO_INSTALLER_NOSCORCIATOIA non creare la scorciatoia sul Desktop
rem    EVO_INSTALLER_NOAVVIO       non avviare il launcher alla fine
rem ============================================================
setlocal
set "REPO=turbignox-hash/ac-evo-career"
set "API=https://api.github.com/repos/%REPO%"
set "NODEURL=https://nodejs.org/dist/v20.19.5/node-v20.19.5-win-x64.zip"
set "TARGET=%USERPROFILE%\EVO-Pitwall"
if defined EVO_INSTALLER_API set "API=%EVO_INSTALLER_API%"
if defined EVO_INSTALLER_DIR set "TARGET=%EVO_INSTALLER_DIR%"
set "AUTO="
if defined EVO_INSTALLER_AUTO set "AUTO=1"

echo.
echo   ================================================================
echo     Carriera EVO - installazione con un comando
echo   ================================================================
echo.

if defined EVO_INSTALLER_DIR goto cartella_ok
echo   Cartella di installazione [Invio = %TARGET%]
set /p "RISP=   > "
if defined RISP set "TARGET=%RISP%"
if "%TARGET:~-1%"=="\" set "TARGET=%TARGET:~0,-1%"
:cartella_ok

rem il modo veloce vale SI da env (sandbox) SI alla domanda: v = salta il test
set "VEL="
if defined EVO_INSTALLER_FAST set "VEL=v"
if defined AUTO goto dopo_veloce
echo.
echo   MODO VELOCE? [v = salto la prova npm, Invio = la faccio]
set /p "VEL=   > "
:dopo_veloce

if exist "%TARGET%\ac-evo-career.mjs" (
  echo   [!] Cartella gia' installata: aggiorno il codice e non tocco il tuo data\.
)
if not exist "%TARGET%" mkdir "%TARGET%"

rem ------------------- 1. Node -------------------
set "NODEDIR=%TARGET%\_node"
set "PATH=%NODEDIR%;%PATH%"
set "NODE_EXE="
if exist "%NODEDIR%\node.exe" ( set "NODE_EXE=%NODEDIR%\node.exe" & goto node_ok )
where node >nul 2>nul && ( set "NODE_EXE=node.exe" & goto node_ok )

set "TMPNODE=%TMP%\pitwall-node.zip"
echo   Scarico il Node portatile in %NODEDIR% ...
rem curl di System32 (Windows 10/11 lo portano dentro): non parla col proxy
rem WinINET, che inghiotte pure l'HTTP locale (lezione 26/10 della sandbox)
%SystemRoot%\System32\curl.exe -L -sS --fail -o "%TMPNODE%" "%NODEURL%" 2>nul
if errorlevel 1 (
  echo   [!] Download di Node non riuscito: controlla la rete. Alternativa:
  echo       installa Node manualmente da nodejs.org e ri-lancia questo file.
  goto fallito
)
%SystemRoot%\System32\tar.exe -xf "%TMPNODE%" -C "%TMP%"
if errorlevel 1 ( echo   [!] Estrazione di Node non riuscita con il tar di Windows. & goto fallito )
set "NODEROOT="
for /f "delims=" %%D in ('dir /b /ad "%TMP%\node-*" 2^>nul') do set "NODEROOT=%%D"
if not defined NODEROOT ( echo   [!] Zip di Node senza la cartella attesa. & goto fallito )
move "%TMP%\%NODEROOT%" "%NODEDIR%" >nul
if errorlevel 1 ( echo   [!] Spostamento di Node dentro %TARGET% non riuscito. & goto fallito )
del "%TMPNODE%" >nul 2>nul
set "NODE_EXE=%NODEDIR%\node.exe"
if not exist "%NODE_EXE%" ( echo   [!] node.exe non trovato dopo lo scarico. & goto fallito )
echo   [x] Node pronto portatile, dentro la cartella di installazione.
:node_ok

rem ------------------- 2. token GitHub -------------------
if defined AUTO goto dopo_token
echo.
echo   Il repository e' pubblico al 26/10: token NON necessario, INVIO per saltare.
echo   Se ri-passasse privato, serve un token di lettura:
echo   GitHub ^> Settings ^> Developer settings ^> Personal access tokens,
echo   Fine-grained: solo questo repo, permesso "Contents: Read-only".
echo   Lo stesso token e' valido per tutti i PC: chi lo ha gia' lo passa ancora.
echo.
set "GHTOKEN="
set /p "GHTOKEN=   Token se ri-passa privato [INVIO = nessun token]: "
:dopo_token

rem ------------------- 3. scarico il codice -------------------
set "ZIPCOD=%TMP%\pitwall-codice.zip"
echo.
echo   Scarico il codice da GitHub [zipball di main]...
rem curl di System32 anzire PowerShell: stesso motivo del passo Node (proxy
rem WinINET). Il token, solo se dato, vola nell'header Authorization.
set "LHAUT="
if defined GHTOKEN set "LHAUT=-H "Authorization: Bearer %GHTOKEN%""
%SystemRoot%\System32\curl.exe -L -sS --fail -H "User-Agent: evo-installer" -H "Accept: application/vnd.github+json" %LHAUT% -o "%ZIPCOD%" "%API%/zipball/main" 2>nul
if errorlevel 1 (
  if defined GHTOKEN echo   [!] Download rifiutato da GitHub: token scaduto o senza accesso al repo.
  if not defined GHTOKEN echo   [!] Download non riuscito: rete down? oppure repo privato e senza token.
  goto fallito
)

rem ------------------- 4. estrazione + installazione -------------------
%SystemRoot%\System32\tar.exe -xf "%ZIPCOD%" -C "%TMP%"
if errorlevel 1 ( echo   [!] Estrazione del codice non riuscita con il tar di Windows. & goto fallito )
set "ROOT="
for /f "delims=" %%R in ('%SystemRoot%\System32\tar.exe -tf "%ZIPCOD%"') do if not defined ROOT set "ROOT=%%~R"
if not defined ROOT ( echo   [!] Zip senza contenuto riconoscibile. & goto fallito )
set "ROOT=%ROOT:/=%"
echo   Installo %ROOT% in %TARGET% ...
xcopy "%TMP%\%ROOT%\*" "%TARGET%\" /E /I /Q /Y >nul
if errorlevel 1 ( echo   [!] Copia in %TARGET% non riuscita. & goto fallito )
set "SHA=%ROOT:*career-=%"
if defined SHA if not "%SHA%"=="%ROOT%" echo %SHA%>"%TARGET%\build-id.txt"
if not exist "%TARGET%\data" mkdir "%TARGET%\data"
if defined GHTOKEN echo %GHTOKEN%>"%TARGET%\data\.github-token"
del "%ZIPCOD%" >nul 2>nul
echo   [x] Codice installato, build %SHA%.

rem ------------------- 5. prova del codice -------------------
cd /d "%TARGET%"
set "PATH=%NODEDIR%;%PATH%"
if /i "%VEL%"=="v" goto salta_test
if /i "%VEL%"=="y" goto salta_test
goto prova_test
:salta_test
echo   Modo veloce: salto la prova npm test.
goto scorciatoia
:prova_test
echo   Prova veloce del codice: faccio girare npm test...
call npm test --silent > "%TMP%\pitwall-npmtest.txt" 2>&1
if errorlevel 1 (
  echo   [!] npm test segnala problemi [dettagli: %TMP%\pitwall-npmtest.txt]:
  echo       l'installazione resta valida; se il launcher parte, puoi proseguire.
) else (
  echo   [x] Test passati.
)

:scorciatoia
rem ------------------- 6/7. scorciatoia + avvio -------------------
if defined EVO_INSTALLER_NOSCORCIATOIA ( echo   -  scorciatoia saltata: via EVO_INSTALLER_NOSCORCIATOIA. & goto avvio )
echo   Scorciatoia sul Desktop...
"%NODE_EXE%" tools\crea-scorciatoia.mjs >nul 2>nul

:avvio
echo.
echo   Fatto: installato in %TARGET%
if defined EVO_INSTALLER_NOAVVIO ( echo   -  avvio del launcher saltato: via EVO_INSTALLER_NOAVVIO. & goto fine )
echo   Apro il launcher: il wizard di prima apertura prende da qui...
start "" "%TARGET%\avvia.cmd"
:fine
endlocal
exit /b 0

:fallito
echo.
echo   Installazione NON completata: vedi le note qui sopra.
echo   Se riprova e si incassa di nuovo, chiedi a Mauro o guarda GUIDA-AMICO.md.
if defined EVO_INSTALLER_AUTO exit /b 1
pause
exit /b 1
