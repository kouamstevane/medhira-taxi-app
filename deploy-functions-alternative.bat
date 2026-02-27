@echo off
setlocal enabledelayedexpansion

echo ============================================
echo Deploiement alternatif Firebase Functions
echo ============================================
echo.

REM Vérifier si nous sommes dans le bon répertoire
if not exist "functions\package.json" (
    echo [ERREUR] Ce script doit être exécute depuis la racine du projet
    echo où se trouve le dossier 'functions'
    pause
    exit /b 1
)

echo [1/5] Compilation des fonctions...
cd functions
call npm run build
if %errorlevel% neq 0 (
    echo [ERREUR] Echec de la compilation
    cd ..
    pause
    exit /b 1
)
echo [OK] Fonctions compilees avec succes
cd ..
echo.

echo [2/5] Verification de la connexion Firebase...
firebase projects:list > nul 2>&1
if %errorlevel% neq 0 (
    echo [ERREUR] Non connecte a Firebase
    echo Veuillez executer: firebase login
    pause
    exit /b 1
)
echo [OK] Connecte a Firebase
echo.

echo [3/5] Verification du projet actif...
firebase use > nul 2>&1
if %errorlevel% neq 0 (
    echo [ERREUR] Aucun projet actif
    pause
    exit /b 1
)
echo [OK] Projet actif verifie
echo.

echo [4/5] Tentative de deploiement avec contournement...
echo.

REM Essayer différentes méthodes de déploiement
echo Methode 1: Deploiement standard avec debug...
firebase deploy --only functions --debug 2>&1 | findstr /V "extensions" | findstr /V "firebaseextensions"
set result1=%errorlevel%

echo.
echo Methode 2: Deploiement avec --force...
firebase deploy --only functions --force 2>&1 | findstr /V "extensions" | findstr /V "firebaseextensions"
set result2=%errorlevel%

echo.
echo Methode 3: Deploiement fonction par fonction...
REM Lister les fonctions disponibles
if exist "functions\lib\index.js" (
    echo Fonctions detectees dans functions/lib/index.js
    firebase deploy --only functions 2>&1
) else (
    echo [AVERTISSEMENT] Fichier functions/lib/index.js non trouve
)
set result3=%errorlevel%

echo.
echo [5/5] Analyse des resultats...
echo.
if %result1% equ 0 (
    echo [SUCCES] Methode 1 a fonctionne!
    goto :success
)
if %result2% equ 0 (
    echo [SUCCES] Methode 2 a fonctionne!
    goto :success
)
if %result3% equ 0 (
    echo [SUCCES] Methode 3 a fonctionne!
    goto :success
)

echo [ECHEC] Toutes les methodes ont echoue
echo.
echo SOLUTIONS POSSIBLES:
echo.
echo 1. Allez sur la console Google Cloud IAM:
echo    https://console.cloud.google.com/iam-admin/iam?project=medjira-service
echo.
echo 2. Ajoutez les roles suivants a votre compte:
echo    - Cloud Functions Developer
echo    - Firebase Admin ou Editor
echo    - Service Account User
echo.
echo 3. Attendez quelques minutes que les permissions se propagent
echo 4. Reexecutez ce script
echo.
echo 5. Alternative: Deploiement manuel via Google Cloud Console
echo    - Allez sur: https://console.cloud.google.com/functions/list?project=medjira-service
echo    - Cliquez sur "Create Function"
echo    - Uploadez le dossier functions/lib
echo.
pause
exit /b 1

:success
echo.
echo ============================================
echo [SUCCES] Deploiement termine!
echo ============================================
echo.
pause
exit /b 0
