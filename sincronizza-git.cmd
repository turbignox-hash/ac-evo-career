@echo off
title Salva e copia git off-site (quarta copia del backup)
cd /d "%~dp0"

git remote get-url offsite >nul 2>&1
if errorlevel 1 goto mancanteremota

echo.
echo   --- SALVATAGGIO LOCALE + COPIA OFF-SITE ---

rem 0) Numero di build: la versione del package.json sale di 1 a ogni salvataggio
rem    (arriva in GUI nel pie' della barra laterale, "build x.y.z · hash").
rem    Se il bump fallisce NON blocca il salvataggio.
node tools\bump-versione.mjs
if errorlevel 1 echo   -  bump della versione non riuscito: proseguo lo stesso.

echo.
rem 1) Prepara tutte le modifiche (anche i file nuovi), rispettando .gitignore
git add -A

rem 2) Se c'e' qualcosa di pronta da salvare, chiede una descrizione
rem    (Invio da solo = descrizione automatica) e la salva nel progetto
git diff --cached --quiet
if errorlevel 1 goto salvatagginuovo
echo.
echo   Nessuna modifica da salvare: passo dritto alla copia online.
goto copia

:salvatagginuovo
set MSG=
set /p MSG=  Descrizione da salvare (Invio = automatica): 
if "%MSG%"=="" set MSG=Aggiornamento del %date% %time%
echo.
echo   Salvo: %MSG%
git commit -m "%MSG%"
if errorlevel 1 goto errorecommit

:copia
for /f "delims=" %%u in ('git remote get-url offsite') do echo   destinazione: %%u
echo.
git push offsite --all
if errorlevel 1 goto errore
git push offsite --tags
if errorlevel 1 goto errore
echo.
echo   Fatto: progetto salvato nel progetto e storia copiata anche online.
pause
exit /b 0

:mancanteremota
echo.
echo   Il remote off-site risulta perso (giusto se accade cambiando PC o spostando
echo   la cartella): ricreare richiede 2 minuti, una volta sola. Oggi e' set su:
echo   un repository privato su GitHub di nome ac-evo-career.
echo.
echo   1. Crea online un repository PRIVATO e VUOTO di nome ac-evo-career:
echo        https://github.com/new   (visibilita' "Private", niente README/licenze)
echo   2. Poi dai al git una riga sola: il TUO nome utente al posto di TUONOME:
echo        git remote add offsite https://github.com/TUONOME/ac-evo-career.git
echo   3. Ri-doppio click su questo script.
echo.
echo   Nota: al primo push, GitHub chiede di fare il login nel browser
echo   (Git Credential Manager): le successive copie non chiedono piu' nulla.
echo.
pause
exit /b 1

:errorecommit
echo.
echo   Salvataggio non riuscito: se chiedeva "chi sei?", configura una volta sola:
echo        git config --global user.name "Tuo Nome"
echo        git config --global user.email "tua-email@esempio.com"
echo   Poi ri-lancia questo script.
pause
exit /b 1

:errore
echo.
echo   Copia online non riuscita: controlla internet o le credenziali.
pause
exit /b 1
