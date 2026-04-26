@echo off
REM ========================================
REM Script de génération d'APK pour Medhira Taxi
REM ========================================

echo ========================================
echo   Medhira Taxi - Générateur d'APK
echo ========================================
echo.

REM Vérifier si nous sommes dans le bon dossier
if not exist "android\gradlew.bat" (
    echo [ERREUR] Ce script doit être exécuté depuis la racine du projet
    echo où se trouve le dossier 'android'
    pause
    exit /b 1
)

echo [1/4] Synchronisation du code web avec Capacitor...
call npx cap sync android
if %ERRORLEVEL% NEQ 0 (
    echo [ERREUR] Échec de la synchronisation Capacitor
    pause
    exit /b 1
)
echo ✓ Synchronisation réussie
echo.

echo [2/4] Choix du type de build:
echo   1. Debug (non signé, pour tests)
echo   2. Release (signé, pour production)
echo.
set /p BUILD_TYPE="Choisissez le type (1 ou 2): "

if "%BUILD_TYPE%"=="1" (
    echo.
    echo [3/4] Génération de l'APK Debug...
    cd android
    call gradlew assembleDebug
    cd ..
    
    if %ERRORLEVEL% EQU 0 (
        echo ✓ APK Debug généré avec succès
        echo.
        echo [4/4] Localisation de l'APK:
        echo   android/app/build/outputs/apk/debug/app-debug.apk
        echo.
        echo Pour installer: adb install android/app/build/outputs/apk/debug/app-debug.apk
    ) else (
        echo [ERREUR] Échec de la génération de l'APK Debug
    )
)

if "%BUILD_TYPE%"=="2" (
    echo.
    echo [3/4] Génération de l'APK Release...
    echo.
    echo IMPORTANT: Pour un APK Release signé, vous devez:
    echo   1. Avoir un fichier keystore (.jks)
    echo   2. Configurer signingConfigs dans android/app/build.gradle
    echo   3. Ou utiliser la méthode "Generate Signed APK" d'Android Studio
    echo.
    set /p CONTINUE="Continuer quand même? (O/N): "
    
    if /i "%CONTINUE%"=="O" (
        cd android
        call gradlew assembleRelease
        cd ..
        
        if %ERRORLEVEL% EQU 0 (
            echo ✓ APK Release généré avec succès
            echo.
            echo [4/4] Localisation des APKs:
            echo   android/app/build/outputs/apk/release/
            echo.
            echo APKs générés (splits par architecture):
            echo   - app-armeabi-v7a-release.apk (appareils 32-bit)
            echo   - app-arm64-v8a-release.apk (appareils 64-bit)
            echo   - app-universal-release.apk (tous appareils, plus volumineux)
        ) else (
            echo [ERREUR] Échec de la génération de l'APK Release
        )
    )
)

echo.
echo ========================================
echo   Terminé!
echo ========================================
pause
