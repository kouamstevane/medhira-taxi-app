# Design Spec — Email Verification Code System

**Date:** 2026-04-10
**Status:** Approved
**Scope:** Chauffeurs uniquement — étape vérification email pendant l'inscription

---

## 1. Objectif

Remplacer le lien Firebase Auth de vérification email par un **code à 6 chiffres** envoyé via Resend, avec un beau template inspiré Hostinger (fond sombre, code en évidence). Ajouter un webhook Resend pour tracker les événements d'envoi en temps réel.

---

## 2. Flux utilisateur

1. Le chauffeur saisit son email à l'étape Step2 du formulaire d'inscription
2. Il clique "Envoyer le code"
3. Il reçoit un email avec un code à 6 chiffres (expire dans 15 minutes)
4. Il saisit le code dans le formulaire
5. L'API valide le code → l'email est marqué vérifié dans Firestore
6. L'inscription peut continuer

---

## 3. Architecture

### 3.1 API Routes (Next.js)

#### `POST /api/auth/send-verification-code`
- Authentification : Bearer token Firebase requis
- Génère un code 6 chiffres via `crypto.randomInt(100000, 999999)`
- Rate limit : 1 renvoi max par minute par uid (vérifié en Firestore)
- Stocke dans Firestore `emailVerificationCodes/{uid}` :
  ```ts
  {
    code: string,          // haché via SHA-256
    email: string,
    expiresAt: Timestamp,  // now + 15 min
    attempts: 0,
    createdAt: Timestamp,
    resendAt: Timestamp,   // pour rate limiting
  }
  ```
- Envoie l'email via Resend SDK (`src/lib/email-service.ts`)
- Retourne `{ success: true }` — ne jamais retourner le code dans la réponse

#### `POST /api/auth/verify-code`
- Authentification : Bearer token Firebase requis
- Body : `{ code: string }`
- Lit le document Firestore `emailVerificationCodes/{uid}`
- Vérifie : code correct (SHA-256), non expiré, attempts < 3
- Succès → supprime le document + marque `emailVerified: true` sur `drivers/{uid}`
- Échec → incrémente `attempts`; si attempts >= 3 → supprime le document (force renvoi)
- Retourne `{ success: true }` ou `{ error: string, attemptsLeft: number }`

#### `POST /api/webhooks/resend`
- Pas d'authentification Bearer — signé via SVIX
- Valide la signature avec `RESEND_WEBHOOK_SECRET` (header `svix-signature`)
- Gère les événements :
  - `email.delivered` → `emailLogs/{messageId}` : `{ status: 'delivered', deliveredAt }`
  - `email.failed` → `emailLogs/{messageId}` : `{ status: 'failed', reason, failedAt }`
  - `email.bounced` → `emailLogs/{messageId}` : `{ status: 'bounced', bouncedAt }`
  - `email.complained` → `emailLogs/{messageId}` : `{ status: 'complained', complainedAt }` + alerte dans `adminAlerts`
- Retourne toujours HTTP 200 (Resend ne re-tentera pas sinon)

### 3.2 Template Email

Fichier : `src/lib/email-templates.ts` — nouvelle fonction `getVerificationCodeTemplate()`

**Design (inspiré Hostinger) :**
- Fond général : `#1a1a2e` (bleu nuit sombre)
- Container central : `#ffffff`, border-radius 12px, max-width 480px
- En-tête : `#f29200` (orange Medjira), logo + titre "Vérification de votre email"
- Corps : texte sobre, police Arial/Inter
- Encadré code : fond `#f8f9fa`, border `2px solid #f29200`, border-radius 8px, padding 24px
  - Code affiché en `font-size: 48px`, `font-weight: bold`, `letter-spacing: 12px`, couleur `#1a1a2e`
- Message d'expiration : `⚠️ Ce code expire dans 15 minutes.`
- Note sécurité : `Ne partagez jamais ce code.`
- Footer : fond `#1a1a2e`, texte blanc, copyright Medjira

### 3.3 Modification Step2Identity.tsx

- Ajout d'un champ email avec bouton "Envoyer le code"
- État : `codeSent`, `codeVerified`, `loading`, `error`, `attemptsLeft`
- Affiche un input à 6 chiffres après envoi du code
- Bouton "Renvoyer" (avec countdown 60s)
- Marqueur visuel ✅ une fois l'email vérifié

---

## 4. Sécurité

| Mesure | Détail |
|---|---|
| Code haché | SHA-256 avant stockage Firestore — jamais en clair |
| Rate limiting envoi | 1 email/minute par uid, vérifié en Firestore |
| Max tentatives | 3 essais max → invalidation automatique du code |
| Expiration | 15 minutes — `expiresAt` vérifié côté serveur |
| Signature webhook | SVIX `svix-signature` validée avec `RESEND_WEBHOOK_SECRET` |
| Auth obligatoire | Bearer token Firebase requis sur send + verify |

---

## 5. Variables d'environnement

```env
# Déjà présent
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=medjira@medjira.com

# À ajouter
RESEND_WEBHOOK_SECRET=whsec_...  # Obtenu dans Resend Dashboard > Webhooks
```

---

## 6. Fichiers à créer / modifier

| Fichier | Action |
|---|---|
| `src/app/api/auth/send-verification-code/route.ts` | Créer |
| `src/app/api/auth/verify-code/route.ts` | Créer |
| `src/app/api/webhooks/resend/route.ts` | Créer |
| `src/lib/email-templates.ts` | Modifier — ajouter `getVerificationCodeTemplate()` |
| `src/lib/email-service.ts` | Modifier — ajouter `sendVerificationCodeEmail()` |
| `src/app/driver/register/components/Step2Identity.tsx` | Modifier — UI code |
| `.env.local` | Modifier — ajouter `RESEND_WEBHOOK_SECRET` |

---

## 7. Configuration Resend Webhook

Dans le dashboard Resend > Webhooks :
- URL : `https://medjira.com/api/webhooks/resend`
- Événements : `email.delivered`, `email.failed`, `email.bounced`, `email.complained`
- Copier le signing secret → `RESEND_WEBHOOK_SECRET`

---

## 8. Hors scope

- Vérification email côté clients (pas dans cette spec)
- Modification du flux Firebase Auth existant pour les links
- Dashboard admin pour les logs webhook (visualisation — future spec)
