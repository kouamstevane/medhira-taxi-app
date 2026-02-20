@echo off
REM Script de diagnostic rapide pour Firebase Auth
REM Usage: diagnose-auth.bat

echo ================================================================================
echo 🔧 DIAGNOSTIC FIREBASE AUTH - AUTHENTIFICATION PAR TÉLÉPHONE
echo ================================================================================
echo.

echo Exécution du script de diagnostic...
echo.

node scripts/diagnose-firebase-auth.cjs

echo.
echo ================================================================================
echo 📚 Prochaine étape : Configuration dans Firebase Console
echo ================================================================================
echo.
echo Ouvrez le fichier FIREBASE_PHONE_AUTH_SETUP.md pour les instructions détaillées
echo.

pause
