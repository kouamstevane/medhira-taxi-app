# src/config/keys/ — Credentials locaux

**NE JAMAIS COMMIT LE CONTENU DE CE DOSSIER.** Il est ignoré via `.gitignore`
(`src/config/keys/`, `**/serviceAccountKey*.json`, etc.).

## Contexte (P0-1)

Le fichier `serviceAccountKey.json` contient un **private key Firebase Admin**
qui donne un accès administrateur total au projet GCP. Un leak = compromission
complète de la base Firestore, Auth, Storage.

Historique : aucune vraie clé n'a jamais été commit dans ce repo (vérifié via
`git log -S "BEGIN PRIVATE KEY"` — seul `.env.example` contenait un placeholder
`YOUR_PRIVATE_KEY_HERE`). Le fichier physique présent sur les machines de dev
reste uniquement local.

## Configuration locale

Deux options pour faire tourner les scripts Admin SDK localement :

### Option 1 (recommandée) — GOOGLE_APPLICATION_CREDENTIALS

1. Télécharger un service account JSON depuis
   Firebase Console → Project settings → Service accounts → Generate new private key.
2. **Sauvegarder le fichier HORS DU REPO** (ex. `~/.config/medjira/serviceAccountKey.json`).
3. Dans votre `.env.local` (ou votre shell) :

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/chemin/absolu/hors-du-repo/serviceAccountKey.json"
```

### Option 2 — variables individuelles

Renseigner dans `.env.local` (ou `functions/.env`) :

```
FIREBASE_PROJECT_ID=medjira-service
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@medjira-service.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

Attention : remplacer les retours à la ligne par `\n` littéraux dans
`FIREBASE_PRIVATE_KEY`. Le code (`src/config/firebase-admin.ts`,
`scripts/verify-collections.mjs`, `scripts/create-firestore-collections.mjs`)
appelle `.replace(/\\n/g, '\n')` automatiquement.

## Si vous avez committé une clé par accident

1. **Révoquer immédiatement** la clé dans GCP Console →
   IAM & Admin → Service Accounts → Keys → Delete.
2. Générer une nouvelle clé.
3. Purger l'historique git (`git filter-repo` ou BFG Repo-Cleaner).
4. Force-push et prévenir l'équipe de re-cloner.
