@echo off
REM Script pour tuer les processus qui bloquent les ports Firebase
REM Utilisez ce script avant de lancer firebase emulators:start

echo.
echo ========================================
echo Nettoyage des ports Firebase...
echo ========================================
echo.

REM Port Firestore (8080)
echo Verification du port 8080 (Firestore)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8080 ^| findstr LISTENING') do (
    echo Processus trouve sur le port 8080: PID %%a
    taskkill /PID %%a /F >nul 2>&1
    if errorlevel 1 (
        echo Impossible de tuer le processus %%a
    ) else (
        echo Processus %%a termine avec succes
    )
)

REM Port Auth (9099)
echo.
echo Verification du port 9099 (Auth)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :9099 ^| findstr LISTENING') do (
    echo Processus trouve sur le port 9099: PID %%a
    taskkill /PID %%a /F >nul 2>&1
    if errorlevel 1 (
        echo Impossible de tuer le processus %%a
    ) else (
        echo Processus %%a termine avec succes
    )
)

REM Port Functions (5001)
echo.
echo Verification du port 5001 (Functions)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5001 ^| findstr LISTENING') do (
    echo Processus trouve sur le port 5001: PID %%a
    taskkill /PID %%a /F >nul 2>&1
    if errorlevel 1 (
        echo Impossible de tuer le processus %%a
    ) else (
        echo Processus %%a termine avec succes
    )
)

REM Port Hosting (5000)
echo.
echo Verification du port 5000 (Hosting)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5000 ^| findstr LISTENING') do (
    echo Processus trouve sur le port 5000: PID %%a
    taskkill /PID %%a /F >nul 2>&1
    if errorlevel 1 (
        echo Impossible de tuer le processus %%a
    ) else (
        echo Processus %%a termine avec succes
    )
)

REM Port Storage (9199)
echo.
echo Verification du port 9199 (Storage)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :9199 ^| findstr LISTENING') do (
    echo Processus trouve sur le port 9199: PID %%a
    taskkill /PID %%a /F >nul 2>&1
    if errorlevel 1 (
        echo Impossible de tuer le processus %%a
    ) else (
        echo Processus %%a termine avec succes
    )
)

echo.
echo ========================================
echo Nettoyage termine!
echo Vous pouvez maintenant lancer: firebase emulators:start
echo ========================================
echo.
pause
