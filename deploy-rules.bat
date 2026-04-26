@echo off
REM Script de déploiement rapide des règles Firebase (Windows)

echo 🔥 Déploiement des règles Firebase...
echo.

REM Vérifier si Firebase CLI est installé
where firebase >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Firebase CLI n'est pas installé
    echo 📦 Installation de Firebase CLI...
    call npm install -g firebase-tools
)

echo 🔐 Connexion à Firebase...
call firebase login

echo 📤 Déploiement des règles Firestore...
call firebase deploy --only firestore:rules

echo 📤 Déploiement des règles Storage...
call firebase deploy --only storage

echo.
echo  Déploiement terminé !
echo 🔄 Actualisez votre application pour voir les changements
pause

