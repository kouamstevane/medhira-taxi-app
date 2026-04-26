@echo off
REM ========================================
REM Script pour générer un APK à envoyer au directeur
REM ========================================

setlocal enabledelayedexpansion

echo ========================================
echo   Medhira Taxi - Génération APK Directeur
echo ========================================
echo.

REM Vérifier si nous sommes dans le bon dossier
if not exist "android\gradlew.bat" (
    echo [ERREUR] Ce script doit être exécuté depuis la racine du projet
    echo où se trouve le dossier 'android'
    pause
    exit /b 1
)

REM Créer le dossier de sortie s'il n'existe pas
if not exist "apk-directeur" mkdir apk-directeur

echo [1/4] Nettoyage des builds précédents...
cd android
call gradlew clean
cd ..
if %ERRORLEVEL% NEQ 0 (
    echo [AVERTISSEMENT] Le nettoyage a échoué, continuation...
)
echo ✓ Nettoyage terminé
echo.

echo [2/4] Synchronisation du code web avec Capacitor...
call npx cap sync android
if %ERRORLEVEL% NEQ 0 (
    echo [ERREUR] Échec de la synchronisation Capacitor
    pause
    exit /b 1
)
echo ✓ Synchronisation réussie
echo.

echo [3/4] Génération de l'APK Debug...
cd android
call gradlew assembleDebug
cd ..

if %ERRORLEVEL% NEQ 0 (
    echo [ERREUR] Échec de la génération de l'APK
    pause
    exit /b 1
)
echo ✓ APK généré avec succès
echo.

echo [4/4] Préparation du fichier pour l'envoi...
set SOURCE=android\app\build\outputs\apk\debug\app-debug.apk
set DEST=apk-directeur\Medhira-Taxi-Test.apk

if not exist "%SOURCE%" (
    echo [ERREUR] L'APK source n'existe pas : %SOURCE%
    pause
    exit /b 1
)

copy "%SOURCE%" "%DEST%" >nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERREUR] Échec de la copie de l'APK
    pause
    exit /b 1
)
echo ✓ Fichier préparé avec succès
echo.

echo ========================================
echo   TERMINÉ avec succès!
echo ========================================
echo.
echo 📱 Fichier APK prêt pour l'envoi :
echo    %DEST%
echo.
echo 📊 Taille du fichier :
for %%A in ("%DEST%") do (
    set size=%%~zA
    set /a sizeMB=!size! / 1048576
    echo    !sizeMB! MB
)
echo.
echo 📤 Méthodes d'envoi au directeur :
echo.
echo   1. WhatsApp (RECOMMANDÉ)
echo      - Ouvrez WhatsApp
echo      - Envoyez le fichier : %DEST%
echo      - Utilisez le message modèle dans ENVOYER-APK-DIRECTEUR.md
echo.
echo   2. Email
echo      - Créez un email avec le fichier en pièce jointe
echo      - Utilisez le message modèle dans ENVOYER-APK-DIRECTEUR.md
echo.
echo   3. Google Drive / Dropbox
echo      - Uploadez le fichier sur le cloud
echo      - Partagez le lien avec le directeur
echo.
echo 📖 Documentation complète :
echo    Voir ENVOYER-APK-DIRECTEUR.md pour les instructions détaillées
echo.
echo ========================================

REM Ouvrir le dossier contenant l'APK
explorer apk-directeur

pause
