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
rem    2. usa il Node del PC solo se e' almeno 18, altrimenti scarica un Node PORTATILE
rem       dentro la cartella (niente admin, niente winget);
rem    3. prova a scaricare il codice senza token; lo chiede SOLO se GitHub
rem       nega l'accesso (repo privato) e, se riesce, lo salva in data\.github-token;
rem    4. scarica il codice (zipball di main), lo estrae nella cartella e
rem       scrive build-id.txt: la build nasce allineata a GitHub;
rem    5. MODO VELOCE predefinito: salta npm test; si puo' scegliere la prova;
rem    6. scorciatoia «Carriera EVO», icona compresa, + voce «App e funzionalità»;
rem    7. avvia il launcher (wizard di prima apertura incluso).
rem  data\ non si copia: nasce vergine sul PC nuovo.
rem
rem  --- PRESA DI PROVA (sandbox, senza scarichi veri) ---
rem  Variabili d'ambiente opzionali usate dal test automatico
rem  (test\installatore-sandbox.test.mjs) e da chi vuole provare a mano:
rem    EVO_INSTALLER_DIR           cartella di destinazione (niente domanda)
rem    EVO_INSTALLER_API           base API alternativa (es. il server finto locale)
rem    EVO_INSTALLER_NODEURL       URL alternativo per lo zip di Node (test/mirror)
rem    EVO_INSTALLER_NODESHA       SHA-256 atteso del Node (test/mirror; di default quello fissato)
rem    EVO_INSTALLER_NODEZIP      zip Node locale (installer offline)
rem    EVO_INSTALLER_CODEZIP      zip codice locale (installer offline)
rem    EVO_INSTALLER_AUTO=1        salta le domande interattive
rem    EVO_INSTALLER_FAST=1        modo veloce: salta npm test (default)
rem    EVO_INSTALLER_GHTOKEN       token di test per simulare il repo privato
rem    EVO_INSTALLER_NOSCORCIATOIA non creare la scorciatoia sul Desktop
rem    EVO_INSTALLER_NOAVVIO       non avviare il launcher alla fine
rem    EVO_INSTALLER_NOREGISTRO    non registrare in App e funzionalità (test/manuale)
rem    EVO_INSTALLER_REGKEY        chiave HKCU alternativa per il test della registrazione
rem ============================================================
setlocal
set "REPO=turbignox-hash/ac-evo-career"
set "API=https://api.github.com/repos/%REPO%"
set "NODEURL=https://nodejs.org/dist/v20.19.5/node-v20.19.5-win-x64.zip"
rem SHA-256 ufficiale del pacchetto qui sopra (nodejs.org/dist/v20.19.5/SHASUMS256.txt).
rem Se un mirror o un proxy lo cambia, l'installazione si ferma prima di estrarre.
set "NODESHA=c48159529572a5a947eef2d55d6485dfdc4ce8e67216402e2f6de52ad5d95695"
set "REGKEY=HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\EVO-Pitwall"
set "TARGET=%USERPROFILE%\EVO-Pitwall"
if defined EVO_INSTALLER_API set "API=%EVO_INSTALLER_API%"
if defined EVO_INSTALLER_NODEURL set "NODEURL=%EVO_INSTALLER_NODEURL%"
if defined EVO_INSTALLER_NODESHA set "NODESHA=%EVO_INSTALLER_NODESHA%"
if defined EVO_INSTALLER_REGKEY set "REGKEY=%EVO_INSTALLER_REGKEY%"
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
if "%TARGET:~-1%"=="\" set "TARGET=%TARGET:~0,-1%"

rem Il modo veloce e' il default. La prova completa e' esplicita (t).
set "VEL=v"
if defined EVO_INSTALLER_FAST goto dopo_veloce
if defined AUTO goto dopo_veloce
echo.
echo   MODO VELOCE (predefinito) [Invio = salto npm test, t = eseguo i test]
set "VEL="
set /p "VEL=   > "
if not defined VEL set "VEL=v"
:dopo_veloce

if exist "%TARGET%\ac-evo-career.mjs" (
  echo   [!] Cartella gia' installata: aggiorno il codice e non tocco il tuo data\.
)
if not exist "%TARGET%" mkdir "%TARGET%"
if not exist "%TARGET%\." (
  echo   [!] Non riesco a creare la cartella di installazione.
  goto fallito
)
set "WORK=%TMP%\pitwall-install-%RANDOM%%RANDOM%"
mkdir "%WORK%" >nul 2>nul
if errorlevel 1 (
  echo   [!] Non riesco a creare la cartella temporanea %WORK%.
  goto fallito
)

rem ------------------- 1. Node -------------------
set "NODEDIR=%TARGET%\_node"
set "PATH=%NODEDIR%;%PATH%"
set "NODE_EXE="

rem Il Node portatile gia' presente vale solo se e' almeno 18.
if exist "%NODEDIR%\node.exe" (
  "%NODEDIR%\node.exe" -e "process.exit(parseInt(process.versions.node,10)>=18?0:1)" >nul 2>nul
  if not errorlevel 1 (
    set "NODE_EXE=%NODEDIR%\node.exe"
    goto node_ok
  )
  echo   [!] Il Node portatile esistente e' troppo vecchio: lo aggiorno.
  rmdir /S /Q "%NODEDIR%" >nul 2>nul
)

rem Il Node del PC vale solo se e' almeno 18: un Node vecchio non basta.
where node >nul 2>nul
if errorlevel 1 goto scarica_node
node -e "process.exit(parseInt(process.versions.node,10)>=18?0:1)" >nul 2>nul
if errorlevel 1 (
  echo   [!] Il Node del PC e' piu' vecchio di 18: uso il portatile.
) else (
  set "NODE_EXE=node.exe"
  goto node_ok
)

:scarica_node
set "TMPNODE=%WORK%\node.zip"
if defined EVO_INSTALLER_NODEZIP (
  echo   Uso il Node incluso nell'installer offline...
  copy /Y "%EVO_INSTALLER_NODEZIP%" "%TMPNODE%" >nul
  if errorlevel 1 (
    echo   [!] Copia del Node incluso non riuscita: installer offline incompleto.
    goto fallito
  )
) else (
  echo   Scarico il Node portatile in %NODEDIR% ...
  rem curl di System32 (Windows 10/11 lo porta): retry e messaggio d'errore visibile.
  %SystemRoot%\System32\curl.exe -L -sS --fail --connect-timeout 20 --retry 2 --retry-delay 2 -w "HTTP %%{http_code}\n" -o "%TMPNODE%" "%NODEURL%" 2>"%WORK%\curl-node.txt"
  if errorlevel 1 (
    echo   [!] Download di Node non riuscito: rete o proxy. curl ha detto:
    if exist "%WORK%\curl-node.txt" type "%WORK%\curl-node.txt"
    echo       Alternativa: installa Node manualmente da nodejs.org e ri-lancia questo file.
    goto fallito
  )
)

rem Integrita': il pacchetto deve essere ESATTAMENTE quello fissato in NODESHA.
rem certutil stampa l'hash da solo, findstr cerca quello atteso: nessun parsing
rem dei messaggi localizzati di Windows.
%SystemRoot%\System32\certutil.exe -hashfile "%TMPNODE%" SHA256 | findstr /I /C:"%NODESHA%" >nul
if errorlevel 1 (
  echo   [!] Il Node non corrisponde allo SHA-256 atteso: fermo tutto.
  echo       Atteso: %NODESHA%
  goto fallito
)
echo   [x] SHA-256 del Node verificato.
%SystemRoot%\System32\tar.exe -xf "%TMPNODE%" -C "%WORK%"
if errorlevel 1 ( echo   [!] Estrazione di Node non riuscita con il tar di Windows. & goto fallito )
set "NODEROOT="
for /f "delims=" %%D in ('dir /b /ad "%WORK%\node-*" 2^>nul') do set "NODEROOT=%%D"
if not defined NODEROOT ( echo   [!] Zip di Node senza la cartella attesa. & goto fallito )
move "%WORK%\%NODEROOT%" "%NODEDIR%" >nul
if errorlevel 1 ( echo   [!] Spostamento di Node dentro %TARGET% non riuscito. & goto fallito )
set "NODE_EXE=%NODEDIR%\node.exe"
if not exist "%NODE_EXE%" ( echo   [!] node.exe non trovato dopo lo scarico. & goto fallito )
"%NODE_EXE%" -e "process.exit(parseInt(process.versions.node,10)>=18?0:1)" >nul 2>nul
if errorlevel 1 ( echo   [!] Il Node scaricato non e' almeno 18: fermo tutto. & goto fallito )
echo   [x] Node pronto portatile, dentro la cartella di installazione.
:node_ok

rem ------------------- 2/3. scarico il codice (prima senza token) -------------------
set "ZIPCOD=%WORK%\codice.zip"
set "GHTOKEN="
if defined EVO_INSTALLER_CODEZIP goto codice_locale

echo.
echo   Scarico il codice da GitHub [zipball di main]...
goto scarica_codice

:codice_locale
echo.
echo   Uso il codice incluso nell'installer offline...
rem niente /dev/null qui: in un .cmd il redirect a un percorso Unix fa fallire la
rem riga PRIMA di copy, e senza controllo del file il guasto si vedeva solo dal
rem tar («Impossibile trovare il percorso specificato»).
copy /Y "%EVO_INSTALLER_CODEZIP%" "%ZIPCOD%" >nul
if errorlevel 1 (
  echo   [!] Copia del codice incluso non riuscita: installer offline incompleto.
  goto fallito
)
if not exist "%ZIPCOD%" (
  echo   [!] Copia del codice incluso non riuscita: installer offline incompleto.
  goto fallito
)
goto codice_pronto

:scarica_codice
set "LHAUT="
if defined GHTOKEN set "LHAUT=-H "Authorization: Bearer %GHTOKEN%""
set "HTTP_FILE=%WORK%\http-codice.txt"
%SystemRoot%\System32\curl.exe -L -sS --fail --connect-timeout 20 --retry 2 --retry-delay 2 -w "%%{http_code}" -H "User-Agent: evo-installer" -H "Accept: application/vnd.github+json" %LHAUT% -o "%ZIPCOD%" "%API%/zipball/main" >"%HTTP_FILE%" 2>"%WORK%\curl-codice.txt"
if not errorlevel 1 goto codice_pronto

set "HTTP_CODE=000"
if exist "%HTTP_FILE%" set /p "HTTP_CODE="<"%HTTP_FILE%"
if defined GHTOKEN goto token_rifiutato
if "%HTTP_CODE%"=="401" goto token_richiesto
if "%HTTP_CODE%"=="403" goto token_richiesto
if "%HTTP_CODE%"=="404" goto token_richiesto
echo   [!] Download non riuscito (HTTP %HTTP_CODE%): controlla rete o proxy.
if exist "%WORK%\curl-codice.txt" type "%WORK%\curl-codice.txt"
goto fallito

:token_richiesto
echo.
echo   GitHub ha negato l'accesso al repository (HTTP %HTTP_CODE%).
echo   Se il repo e' privato, inserisci un token Fine-grained con Contents: Read-only.
if defined EVO_INSTALLER_GHTOKEN set "GHTOKEN=%EVO_INSTALLER_GHTOKEN%"
if not defined GHTOKEN if defined AUTO goto token_assente
if not defined GHTOKEN set /p "GHTOKEN=   Token GitHub (Invio per annullare): "
if not defined GHTOKEN goto token_assente
echo   Riprovo il download autenticato...
goto scarica_codice

:token_assente
echo   [!] Serve un token per questo repository privato; non ne e' stato fornito uno.
goto fallito

:token_rifiutato
echo   [!] GitHub ha rifiutato il token (scaduto o senza accesso al repo).
if exist "%WORK%\curl-codice.txt" type "%WORK%\curl-codice.txt"
goto fallito

:codice_pronto

rem ------------------- 4. estrazione + installazione -------------------
%SystemRoot%\System32\tar.exe -xf "%ZIPCOD%" -C "%WORK%"
if errorlevel 1 ( echo   [!] Estrazione del codice non riuscita con il tar di Windows. & goto fallito )
set "ROOT="
for /f "delims=" %%R in ('%SystemRoot%\System32\tar.exe -tf "%ZIPCOD%"') do if not defined ROOT set "ROOT=%%~R"
if not defined ROOT ( echo   [!] Zip senza contenuto riconoscibile. & goto fallito )
set "ROOT=%ROOT:/=%"
echo   Installo %ROOT% in %TARGET% ...
xcopy "%WORK%\%ROOT%\*" "%TARGET%\" /E /I /Q /Y >nul
if errorlevel 1 ( echo   [!] Copia in %TARGET% non riuscita. & goto fallito )
set "SHA=%ROOT:*career-=%"
if defined SHA if not "%SHA%"=="%ROOT%" echo %SHA%>"%TARGET%\build-id.txt"
set "DISPLAYVER=%SHA%"
if not defined DISPLAYVER set "DISPLAYVER=main"
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
call npm test --silent > "%WORK%\npmtest.txt" 2>&1
if errorlevel 1 (
  copy /Y "%WORK%\npmtest.txt" "%TARGET%\npm-test-fallito.txt" >nul 2>nul
  echo   [!] npm test segnala problemi [dettagli: %TARGET%\npm-test-fallito.txt]:
  echo       l'installazione resta valida; se il launcher parte, puoi proseguire.
) else (
  echo   [x] Test passati.
)

:scorciatoia
rem ------------------- 6/7. scorciatoia + avvio -------------------
if defined EVO_INSTALLER_NOSCORCIATOIA ( echo   -  scorciatoia saltata: via EVO_INSTALLER_NOSCORCIATOIA. & goto registro )
echo   Scorciatoia sul Desktop...
"%NODE_EXE%" tools\crea-scorciatoia.mjs >nul 2>nul

:registro
rem ------------------- 6-bis. App e funzionalità -------------------
if defined EVO_INSTALLER_NOREGISTRO (
  echo   -  registrazione in App e funzionalità saltata: via EVO_INSTALLER_NOREGISTRO.
  goto avvio
)
if not exist "%TARGET%\disinstalla.cmd" (
  echo   -  registrazione saltata: disinstalla.cmd non trovato.
  goto avvio
)
echo   Registro l'installazione in App e funzionalità...
set "ICONA=%TARGET%\gui\pitwall.ico"
if not exist "%ICONA%" set "ICONA=%SystemRoot%\System32\shell32.dll,0"
reg add "%REGKEY%" /v DisplayName /t REG_SZ /d "EVO Pitwall - Carriera EVO" /f >nul 2>nul
reg add "%REGKEY%" /v DisplayVersion /t REG_SZ /d "%DISPLAYVER%" /f >nul 2>nul
reg add "%REGKEY%" /v Publisher /t REG_SZ /d "EVO Pitwall" /f >nul 2>nul
reg add "%REGKEY%" /v InstallLocation /t REG_SZ /d "%TARGET%" /f >nul 2>nul
reg add "%REGKEY%" /v DisplayIcon /t REG_SZ /d "%ICONA%" /f >nul 2>nul
reg add "%REGKEY%" /v UninstallString /t REG_SZ /d "cmd.exe /d /c call \"%TARGET%\disinstalla.cmd\" \"%TARGET%\"" /f >nul 2>nul
reg add "%REGKEY%" /v NoModify /t REG_DWORD /d 1 /f >nul 2>nul
reg add "%REGKEY%" /v NoRepair /t REG_DWORD /d 1 /f >nul 2>nul
if errorlevel 1 (
  echo   [!] Registrazione non riuscita: l'installazione funziona lo stesso.
) else (
  echo   [x] Voce «App e funzionalità» pronta.
)
:avvio
echo.
echo   Fatto: installato in %TARGET%
if defined EVO_INSTALLER_NOAVVIO ( echo   -  avvio del launcher saltato: via EVO_INSTALLER_NOAVVIO. & goto fine )
echo   Apro il launcher: il wizard di prima apertura prende da qui...
start "" "%TARGET%\avvia.cmd"
:fine
if defined WORK if exist "%WORK%" rmdir /S /Q "%WORK%" >nul 2>nul
endlocal
exit /b 0

:fallito
if defined WORK if exist "%WORK%" rmdir /S /Q "%WORK%" >nul 2>nul
echo.
echo   Installazione NON completata: vedi le note qui sopra.
echo   Se riprova e si incassa di nuovo, chiedi a Mauro o guarda GUIDA-AMICO.md.
if defined EVO_INSTALLER_AUTO exit /b 1
pause
exit /b 1
