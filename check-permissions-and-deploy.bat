@echo off
setlocal enabledelayedexpansion

echo ============================================
echo Verification des permissions et deploiement
echo ============================================
echo.

echo Ce script va verifier si les permissions IAM ont ete ajoutees
echo et tentera de deployer les fonctions Firebase.
echo.

echo [1/4] Verification de la connexion Firebase...
firebase projects:list > nul 2>&1
if %errorlevel% neq 0 (
    echo [ERREUR] Non connecte a Firebase
    echo Veuillez executer: firebase login
    pause
    exit /b 1
)
echo [OK] Connecte a Firebase
echo.

echo [2/4] Verification du projet actif...
firebase use > nul 2>&1
if %errorlevel% neq 0 (
    echo [ERREUR] Aucun projet actif
    pause
    exit /b 1
)
echo [OK] Projet actif: medjira-service
echo.

echo [3/4] Compilation des fonctions...
cd functions
call npm run build > nul 2>&1
if %errorlevel% neq 0 (
    echo [ERREUR] Echec de la compilation
    cd ..
    pause
    exit /b 1
)
echo [OK] Fonctions compilees
cd ..
echo.

echo [4/4] Test de deploiement...
echo.
echo Ce test va verifier si les permissions IAM sont correctes.
echo Si vous voyez l'erreur "403 permission", les permissions ne sont pas encore ajoutees.
echo.
echo Appuyez sur Ctrl+C pour annuler ou sur une touche pour continuer...
pause > nul

firebase deploy --only functions 2>&1 | findstr /C:"403" /C:"permission" /C:"Deploy complete" /C:"successfully deployed"

set result=%errorlevel%

echo.
echo ============================================
if %result% equ 0 (
    echo [RESULTAT] Verification des permissions...
    echo.
    echo Si vous voyez "Deploy complete" ou "successfully deployed":
    echo   ✓ Les permissions sont correctes! Le deploiement a reussi.
    echo.
    echo Si vous voyez "403" ou "permission":
    echo   ✗ Les permissions ne sont toujours pas correctes.
    echo.
    echo SUIVEZ CES ETPES:
    echo.
    echo 1. Allez sur: https://console.cloud.google.com/iam-admin/iam?project=medjira-service
    echo 2. Cliquez sur "Add" (Ajouter)
    echo 3. Entrez votre email Google
    echo 4. Ajoutez ces roles:
    echo    - Cloud Functions Developer
    echo    - Firebase Admin (ou Editor)
    echo    - Service Account User
    echo 5. Cliquez sur "Save"
    echo 6. Attendez 2-5 minutes
    echo 7. Reexecutez ce script
    echo.
) else (
    echo [ERREUR] Impossible de determiner le resultat
    echo Veuillez verifier manuellement le resultat ci-dessus.
)
echo ============================================
echo.

pause
