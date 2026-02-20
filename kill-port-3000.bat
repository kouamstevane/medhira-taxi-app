@echo off
echo Recherche des processus utilisant le port 3000...
echo.

for /f "tokens=5" %%a in ('netstat -aon ^| find ":3000" ^| find "LISTENING"') do (
    echo Processus ID trouvé: %%a
    echo.
    taskkill /F /PID %%a
    echo Processus %%a termine.
    echo.
)

echo.
echo Verification du port 3000...
netstat -aon | find ":3000"
if %ERRORLEVEL% EQU 0 (
    echo Le port 3000 est encore utilise.
) else (
    echo Le port 3000 est maintenant libre.
)
echo.
pause
