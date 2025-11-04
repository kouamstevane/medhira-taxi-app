# 🚕 Medjira Taxi App

Application moderne de réservation de taxis et de livraison construite avec **Next.js 15**, **TypeScript**, **Firebase** et **Tailwind CSS**.

## ✨ Caractéristiques

- 🔐 **Authentification complète** : Téléphone, Email, Google
- 🚖 **Réservation de taxis** en temps réel avec Google Maps
- 💰 **Portefeuille intégré** avec historique des transactions
- 👤 **Interface chauffeur** et client séparées
- 📱 **Design responsive** optimisé mobile
- 🎨 **UI moderne** avec composants réutilisables
- 🔥 **Firebase** pour la base de données et l'authentification
- 📍 **Google Maps API** pour la géolocalisation
- 🌍 **Multi-pays** : Cameroun, France, Belgique, Canada

## 🏗️ Architecture Moderne

Le projet suit une **architecture modulaire** avec séparation claire des responsabilités :

```bash
src/
├── app/              # Routes et pages (Next.js App Router)
├── components/       # Composants UI réutilisables
├── config/           # Configuration (Firebase, etc.)
├── context/          # Contextes React (Auth)
├── hooks/            # Hooks personnalisés
├── lib/              # Bibliothèques et helpers
├── types/            # Types TypeScript centralisés
└── utils/            # Utilitaires et constantes
```

📚 **Consultez** [ARCHITECTURE.md](./ARCHITECTURE.md) pour plus de détails.

## 🚀 Démarrage Rapide

### Prérequis

- Node.js 18+ et npm
- Compte Firebase avec projet configuré
- Clé API Google Maps

### Installation

1. **Cloner le projet**
```bash
git clone <repository-url>
cd medhira-taxi-app
```

2. **Installer les dépendances**
```bash
npm install
```

3. **Configurer les variables d'environnement**

Créez un fichier `.env.local` à la racine :

```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_maps_key
```

4. **Lancer le serveur de développement**
```bash
npm run dev
```

Ouvrez [http://localhost:3000](http://localhost:3000) dans votre navigateur.

## 📦 Scripts Disponibles

```bash
npm run dev      # Démarre le serveur de développement avec Turbopack
npm run build    # Compile l'application pour la production
npm start        # Démarre le serveur de production
npm run lint     # Vérifie le code avec ESLint
```

## 🔑 Fonctionnalités Principales

### 1. Authentification Multi-Canaux
- Connexion par numéro de téléphone (SMS OTP)
- Connexion par email et mot de passe
- Connexion via Google
- Support multi-pays avec indicatifs

### 2. Réservation de Taxi
- Sélection du point de départ et destination avec Google Maps
- Calcul automatique du prix (distance, durée, type de véhicule, heures de pointe)
- Recherche de chauffeur en temps réel
- Suivi de la course

### 3. Portefeuille
- Consultation du solde
- Rechargement (Orange Money, MTN, Visa, PayPal)
- Historique des transactions

### 4. Dashboard
- Vue d'ensemble des services
- Historique des commandes
- Profil utilisateur

## 🛠️ Technologies

- **Next.js 15** (App Router)
- **TypeScript**
- **Tailwind CSS 4**
- **Firebase** (Auth, Firestore, Storage)
- **Google Maps API**

## 📚 Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) - Architecture détaillée
- [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) - Guide de migration

---

**Fait avec ❤️ au Cameroun 🇨🇲**
