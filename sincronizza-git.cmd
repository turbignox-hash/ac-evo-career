@echo off
title Copia git off-site (quarta copia del backup)
cd /d "%~dp0"

git remote get-url offsite >nul 2>&1
if errorlevel 1 goto mancanteremota

echo.
echo   Copio la storia git (tutti i rami e i tag).
for /f "delims=" %%u in ('git remote get-url offsite') do echo   destinazione: %%u
echo.
git push offsite --all
if errorlevel 1 goto errore
git push offsite --tags
if errorlevel 1 goto errore
echo.
echo   Copia off-site completata: la storia git ora vive anche online.
pause
exit /b 0

:mancanteremota
echo.
echo   La quarta copia (off-site) non e' ancora impostata: servono 2 minuti una volta sola.
echo.
echo   1. Crea online un repository PRIVATO e VUOTO di nome ac-evo-career:
echo        - GitHub:  https://github.com/new   (visibilita' "Private", niente README/licenze)
echo        - GitLab:  https://gitlab.com/projects/new   (visibilita' "Private")
echo      Consigliato GitHub: account gratis, repository privato illimitato.
echo   2. Poi dai al git una riga sola: il TUO nome utente al posto di TUONOME:
echo        git remote add offsite https://github.com/TUONOME/ac-evo-career.git
echo   3. Ri-doppio click su questo script: copia tutta la storia git online.
echo.
echo   Nota: al primo push, GitHub chiede di fare il login nel browser
echo   (Git Credential Manager): autori e password vecchie non bastano.
echo.
pause
exit /b 1

:errore
echo.
echo   Push fallito: controlla internet, credenziali o che il repository online sia vuoto.
pause
exit /b 1
