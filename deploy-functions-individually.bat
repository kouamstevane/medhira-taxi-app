@echo off
setlocal enabledelayedexpansion

echo ============================================
echo Deploiement individuel des fonctions Firebase
echo Contournement du probleme de permissions Extensions
echo ============================================
echo.

REM Liste des fonctions à déployer (basée sur firebase functions:list)
set FUNCTIONS=answerCall cleanupFailedUploads cleanupOrphanedFiles createCall encryptSensitiveData endCall sendSystemMessage validateBankDetails onUserDeleted

echo Fonctions a deployer:
echo %FUNCTIONS%
echo.

echo [1/3] Compilation des fonctions...
cd functions
call npm run build
if %errorlevel% neq 0 (
    echo [ERREUR] Echec de la compilation
    cd ..
    pause
    exit /b 1
)
echo [OK] Fonctions compilees
cd ..
echo.

echo [2/3] Tentative de deploiement individuel...
echo.

set success_count=0
set total_count=0

for %%f in (%FUNCTIONS%) do (
    set /a total_count+=1
    echo [!total_count!] Deploiement de %%f...
    firebase deploy --only functions:%%f 2>&1 | findstr /V "extensions" | findstr /V "firebaseextensions"
    if !errorlevel! equ 0 (
        echo [OK] %%f deployee avec succes
        set /a success_count+=1
    ) else (
        echo [ECHEC] Erreur lors du deploiement de %%f
    )
    echo.
)

echo [3/3] Resultat du deploiement...
echo.
echo Fonctions deployees: !success_count!/%total_count%
echo.

if !success_count! equ !total_count! (
    echo ============================================
    echo [SUCCES] Toutes les fonctions ont ete deployees!
    echo ============================================
    pause
    exit /b 0
) else (
    echo ============================================
    echo [PARTIEL] Certaines fonctions n'ont pas pu etre deployees
    echo ============================================
    echo.
    echo Si le probleme persiste, suivez ces etapes:
    echo.
    echo 1. Allez sur: https://console.cloud.google.com/iam-admin/iam?project=medjira-service
    echo 2. Ajoutez les roles suivants a votre compte:
    echo    - Cloud Functions Developer
    echo    - Firebase Admin ou Editor
    echo 3. Attendez quelques minutes
    echo 4. Reexecutez ce script
    echo.
    pause
    exit /b 1
)
