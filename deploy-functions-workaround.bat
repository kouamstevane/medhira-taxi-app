@echo off
echo ============================================
echo Diagnostic de deploiement Firebase Functions
echo ============================================
echo.

echo 1. Verification de la connexion Firebase...
firebase projects:list
if %errorlevel% neq 0 (
    echo [ERREUR] Non connecte a Firebase. Executez: firebase login
    pause
    exit /b 1
)

echo.
echo 2. Test de deploiement avec contournement extensions...
echo.

echo Essayons de deployer en ignorant les extensions...
firebase deploy --only functions --debug 2>&1 | findstr /V "extensions" | findstr /V "firebaseextensions"

echo.
echo ============================================
echo SOLUTIONS POSSIBLES:
echo ============================================
echo.
echo 1. Via Google Cloud Console:
echo    - Allez sur https://console.cloud.google.com/iam-admin/iam?project=medjira-service
echo    - Ajoutez le role "Cloud Functions Developer" a votre compte
echo    - Ajoutez le role "Firebase Admin" ou "Editor"
echo.
echo 2. Via gcloud CLI (si installe):
echo    gcloud auth login
echo    gcloud config set project medjira-service
echo    gcloud functions deploy --help
echo.
echo 3. Reconnexion Firebase:
echo    firebase logout
echo    firebase login
echo.
pause
