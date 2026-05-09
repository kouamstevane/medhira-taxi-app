#!/usr/bin/env bash
# ============================================================
# Generation du keystore release pour Medjira Taxi
# ============================================================
# IMPORTANT : Conservez le keystore (.keystore) ET le fichier
# keystore.properties dans plusieurs endroits sécurisés
# (cloud chiffré + disque externe). PERTE = APP PERDUE.
# ============================================================

set -e

KEYSTORE_PATH="app/medjira-release.keystore"
KEY_ALIAS="medjira"

cd "$(dirname "$0")"

if [ -f "$KEYSTORE_PATH" ]; then
    echo ""
    echo "[ERREUR] Le keystore existe deja: $KEYSTORE_PATH"
    echo "Si vous voulez en generer un nouveau, supprimez-le d'abord."
    echo "ATTENTION: un nouveau keystore = nouvelle app sur Play Store !"
    exit 1
fi

echo ""
echo "=== Generation du keystore release ==="
echo ""
echo "Vous allez devoir saisir:"
echo " - Un mot de passe pour le keystore (16+ caracteres recommandes)"
echo " - Vos informations (nom, organisation, ville, pays)"
echo " - Un mot de passe pour la cle (peut etre identique)"
echo ""
read -p "Appuyez sur Entree pour continuer..."

keytool -genkey -v \
    -keystore "$KEYSTORE_PATH" \
    -alias "$KEY_ALIAS" \
    -keyalg RSA \
    -keysize 2048 \
    -validity 10000

echo ""
echo "=== Keystore cree avec succes ==="
echo ""
echo "Prochaines etapes:"
echo " 1. cp android/keystore.properties.example android/keystore.properties"
echo " 2. Remplissez les mots de passe que vous venez de saisir"
echo " 3. SAUVEGARDEZ $KEYSTORE_PATH en lieu sur (cloud chiffre + disque externe)"
echo " 4. Construisez l'AAB: npm run android:bundle"
echo ""
