#!/bin/bash

# Script de déploiement rapide des règles Firebase

echo "🔥 Déploiement des règles Firebase..."
echo ""

# Vérifier si Firebase CLI est installé
if ! command -v firebase &> /dev/null
then
    echo "❌ Firebase CLI n'est pas installé"
    echo "📦 Installation de Firebase CLI..."
    npm install -g firebase-tools
fi

echo "🔐 Connexion à Firebase..."
firebase login

echo "📤 Déploiement des règles Firestore..."
firebase deploy --only firestore:rules

echo "📤 Déploiement des règles Storage..."
firebase deploy --only storage

echo ""
echo "✅ Déploiement terminé !"
echo "🔄 Actualisez votre application pour voir les changements"

