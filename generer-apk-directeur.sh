#!/bin/bash

# ========================================
# Script pour générer un APK à envoyer au directeur
# ========================================

echo "========================================"
echo "  Medjira Taxi - Génération APK Directeur"
echo "========================================"
echo ""

# Vérifier si nous sommes dans le bon dossier
if [ ! -f "android/gradlew" ]; then
    echo "[ERREUR] Ce script doit être exécuté depuis la racine du projet"
    echo "où se trouve le dossier 'android'"
    exit 1
fi

# Créer le dossier de sortie s'il n'existe pas
mkdir -p apk-directeur

echo "[1/4] Nettoyage des builds précédents..."
cd android
./gradlew clean
cd ..
if [ $? -ne 0 ]; then
    echo "[AVERTISSEMENT] Le nettoyage a échoué, continuation..."
fi
echo "✓ Nettoyage terminé"
echo ""

echo "[2/4] Synchronisation du code web avec Capacitor..."
npx cap sync android
if [ $? -ne 0 ]; then
    echo "[ERREUR] Échec de la synchronisation Capacitor"
    exit 1
fi
echo "✓ Synchronisation réussie"
echo ""

echo "[3/4] Génération de l'APK Debug..."
cd android
./gradlew assembleDebug
cd ..

if [ $? -ne 0 ]; then
    echo "[ERREUR] Échec de la génération de l'APK"
    exit 1
fi
echo "✓ APK généré avec succès"
echo ""

echo "[4/4] Préparation du fichier pour l'envoi..."
SOURCE="android/app/build/outputs/apk/debug/app-debug.apk"
DEST="apk-directeur/Medjira-Taxi-Test.apk"

if [ ! -f "$SOURCE" ]; then
    echo "[ERREUR] L'APK source n'existe pas : $SOURCE"
    exit 1
fi

cp "$SOURCE" "$DEST"
if [ $? -ne 0 ]; then
    echo "[ERREUR] Échec de la copie de l'APK"
    exit 1
fi
echo "✓ Fichier préparé avec succès"
echo ""

echo "========================================"
echo "  TERMINÉ avec succès!"
echo "========================================"
echo ""
echo "📱 Fichier APK prêt pour l'envoi :"
echo "   $DEST"
echo ""
echo "📊 Taille du fichier :"
SIZE=$(stat -f%z "$DEST" 2>/dev/null || stat -c%s "$DEST" 2>/dev/null)
SIZE_MB=$((SIZE / 1048576))
echo "   $SIZE_MB MB"
echo ""
echo "📤 Méthodes d'envoi au directeur :"
echo ""
echo "  1. WhatsApp (RECOMMANDÉ)"
echo "     - Ouvrez WhatsApp"
echo "     - Envoyez le fichier : $DEST"
echo "     - Utilisez le message modèle dans MESSAGE-DIRECTEUR-WHATSAPP.txt"
echo ""
echo "  2. Email"
echo "     - Créez un email avec le fichier en pièce jointe"
echo "     - Utilisez le message modèle dans MESSAGE-DIRECTEUR-WHATSAPP.txt"
echo ""
echo "  3. Google Drive / Dropbox"
echo "     - Uploadez le fichier sur le cloud"
echo "     - Partagez le lien avec le directeur"
echo ""
echo "📖 Documentation complète :"
echo "   Voir ENVOYER-APK-DIRECTEUR.md pour les instructions détaillées"
echo ""
echo "========================================"

# Ouvrir le dossier contenant l'APK (macOS)
if [[ "$OSTYPE" == "darwin"* ]]; then
    open apk-directeur
# Ouvrir le dossier contenant l'APK (Linux)
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    xdg-open apk-directeur &> /dev/null || nautilus apk-directeur &> /dev/null || dolphin apk-directeur &> /dev/null &
fi
