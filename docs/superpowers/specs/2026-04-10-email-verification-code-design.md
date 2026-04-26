# Design Spec — Email Verification Code System

**Date:** 2026-04-10
**Status:** Draft — En revue par les experts
**Scope:** Chauffeurs uniquement — remplacement du lien Firebase Auth par un code OTP
**Auteur:** Architecture Team

---

## 1. Objectif

Remplacer le lien Firebase Auth `sendEmailVerification()` et la Cloud Function `sendVerificationEmail` par un **code OTP à 6 chiffres** envoyé via Resend, avec un template inspiré Hostinger (fond sombre, code en évidence). Ajouter un webhook Resend pour tracker les événements d'envoi en temps réel.

**Pourquoi ce changement :**
- Les liens email Firebase Auth atterrissent souvent dans les spams
- Un code OTP offre une UX plus rapide (pas besoin de quitter l'app)
- Permet un contrôle total sur le template et le tracking

---

## 2. Flux utilisateur

### 2.1 Pendant l'inscription (flux principal)

1. Le chauffeur saisit email + mot de passe dans **Step1Intent.tsx** et clique "Continuer l'inscription"
2. Le compte Firebase Auth est créé par `handleStep1Next()` dans `useDriverRegistration.ts`
3. **Immédiatement après**, un code OTP est envoyé automatiquement à son email
4. Step1 bascule en mode "vérification" : affichage d'un input à 6 chiffres
5. Le chauffeur saisit le code → l'API valide → **Firebase Auth `emailVerified: true`** + Firestore `drivers/{uid}.emailVerified: true`
6. Le chauffeur passe à Step2 (identité)

### 2.2 Re-vérification depuis le dashboard (flux secondaire)

7. Si l'email n'a pas été vérifié (ex: inscription via Google sans code), le dashboard chauffeur affiche une bannière
8. Le chauffeur clique "Vérifier mon email" → même flux OTP
9. `useDriverProfile.ts` → `handleResendVerificationEmail()` utilise la nouvelle API au lieu de `AuthService.sendVerificationEmail()`

> **Note :** Actuellement, le dashboard utilise `AuthService.sendVerificationEmail()` (Firebase Auth `sendEmailVerification()` — lien email natif), tandis que l'inscription utilise `emailVerificationService` (Cloud Function Resend). Après cette migration, les deux flux convergeront vers les mêmes API Routes Next.js.

---

## 3. Architecture

### 3.1 Runtime des API Routes

> **[CORRECTION #9]** Les 3 API routes utilisent `crypto.randomInt()` et `firebase-admin` qui nécessitent le runtime Node.js (pas Edge Runtime).

Chaque route déclare explicitement :
```ts
export const runtime = 'nodejs';
```

### 3.2 API Routes (Next.js)

#### `POST /api/auth/send-verification-code`

> **[CORRECTION #7]** Schéma Zod explicite, cohérent avec le pattern existant (`src/app/api/admin/send-email/route.ts`).

**Runtime :** `nodejs`

**Authentification :** Bearer token Firebase requis (header `Authorization: Bearer <id_token>`)

**Schéma de validation :**
```ts
const SendVerificationCodeSchema = z.object({
  email: z.string().email('Adresse email invalide'),
});
```

**Logique :**
1. Vérifie le Bearer token via `adminAuth.verifyIdToken()`
2. Vérifie que `decodedToken.email === body.email` (sécurité : on n'envoie qu'à sa propre adresse)
3. Génère un code 6 chiffres via `crypto.randomInt(100000, 999999)`
4. Rate limit : vérifie `resendAt` dans `emailVerificationCodes/{uid}` — si `resendAt > now - 60s` → rejeter avec `{ error: 'Rate limit', retryAfterSeconds: number }`
5. Hash le code en SHA-256 : `crypto.createHash('sha256').update(code).digest('hex')`
6. Stocke dans Firestore `emailVerificationCodes/{uid}` (upsert) :
   ```ts
   {
     code: string,            // haché via SHA-256
     email: string,           // email du destinataire
     expiresAt: Timestamp,    // now + 15 min
     attempts: 0,
     createdAt: Timestamp,
     resendAt: Timestamp,     // pour rate limiting (now)
   }
   ```
7. Envoie l'email via `sendVerificationCodeEmail()` de `src/lib/email-service.ts`
8. **Crée le document `emailLogs/{messageId}`** avec les métadonnées complètes (`to`, `subject`, `uid`, `type`, `status: 'sent'`) pour que le webhook puisse mettre à jour le statut ultérieurement (voir bloc "Création du document à l'envoi" ci-dessous)
9. Retourne `{ success: true }` — **ne jamais retourner le code dans la réponse**

**Codes d'erreur :**
- `401` : Token invalide ou expiré
- `403` : L'email ne correspond pas au token
- `429` : Rate limit atteint — `{ error, retryAfterSeconds }`
- `500` : Erreur interne (Resend, Firestore)

---

#### `POST /api/auth/verify-code`

> **[CORRECTION #7]** Schéma Zod explicite.

**Runtime :** `nodejs`

**Authentification :** Bearer token Firebase requis

**Schéma de validation :**
```ts
const VerifyCodeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Le code doit contenir exactement 6 chiffres'),
});
```

**Logique :**
1. Vérifie le Bearer token via `adminAuth.verifyIdToken()`
2. Lit le document Firestore `emailVerificationCodes/{uid}`
3. Si document n'existe pas → `{ error: 'Aucun code en attente. Demandez un nouveau code.' }` (400)
4. Vérifie `expiresAt > now` — si expiré → supprime le document → `{ error: 'Code expiré. Demandez un nouveau code.' }` (400)
5. Vérifie `attempts < 3` — si ≥ 3 → supprime le document → `{ error: 'Trop de tentatives. Demandez un nouveau code.' }` (400)
6. Hash le code soumis en SHA-256 et compare avec `code` stocké
7. **Succès :**
   - Supprime le document `emailVerificationCodes/{uid}`
   - **[CORRECTION #3]** Appelle `adminAuth.updateUser(uid, { emailVerified: true })` pour mettre à jour le flag Firebase Auth natif
   - Met à jour Firestore `drivers/{uid}` avec `{ emailVerified: true, emailVerifiedAt: Timestamp }`
   - Si le document `drivers/{uid}` n'existe pas encore (inscription en cours), la mise à jour Firestore est ignorée silencieusement — le flag Firebase Auth suffit
   - Retourne `{ success: true }`
8. **Échec (code incorrect) :**
   - Incrémente `attempts` via `FieldValue.increment(1)`
   - Si nouveau `attempts >= 3` → supprime le document (force renvoi)
   - Retourne `{ success: false, error: 'Code incorrect', attemptsLeft: number }` (400)

**Codes d'erreur :**
- `401` : Token invalide ou expiré
- `400` : Code invalide, expiré, ou trop de tentatives

---

#### `POST /api/webhooks/resend`

**Runtime :** `nodejs`

**Authentification :** Pas de Bearer — validé via signature SVIX via le SDK Resend

> **[CORRECTION G]** Le SDK Resend (`resend@^6.9.3`) fournit une classe `Webhooks` intégrée qui encapsule la validation SVIX. Utiliser `new Webhooks().verify({ payload, headers, webhookSecret })` au lieu d'une validation SVIX manuelle. Le SDK gère en interne la librairie `svix`.

**Logique :**
1. Valide la signature via `new Webhooks().verify({ payload: rawBody, headers: { id: svixId, timestamp: svixTimestamp, signature: svixSignature }, webhookSecret: process.env.RESEND_WEBHOOK_SECRET })` — utilise le SDK Resend, pas de dépendance `svix` séparée nécessaire
2. Si signature invalide → retourne `401` (exception : Resend ne re-tente PAS les 401, mais la sécurité prime)
3. Parse le payload JSON
4. Extrait `messageId` du payload (`data.email_id` dans les événements Resend)

> **[CORRECTION C]** Bien que les événements webhook Resend contiennent `to`, `subject` et `tags` pour la plupart des événements, la création du document `emailLogs/{messageId}` à l'envoi garantit : (1) que l'association `uid` est toujours correcte via le code serveur, pas via les tags, (2) une disponibilité immédiate du log avant même que Resend n'envoie le premier webhook, (3) une source de vérité unique pour le `type` d'email. Le webhook ne fait que mettre à jour le `status` et le timestamp correspondant.

**Création du document à l'envoi (dans `send-verification-code/route.ts`) :**
```ts
// Après l'envoi réussi via Resend
if (messageId) {
  await adminDb.collection('emailLogs').doc(messageId).set({
    messageId,
    status: 'sent',
    to: email,
    subject: 'Votre code de vérification Medjira',
    type: 'verification_code',
    uid,
    sentAt: admin.firestore.Timestamp.now(),
    createdAt: admin.firestore.Timestamp.now(),
    updatedAt: admin.firestore.Timestamp.now(),
  });
}
```

**Événements gérés par le webhook (mise à jour uniquement) :**

| Événement | Action Firestore (upsert sur `emailLogs/{messageId}`) |
|---|---|
| `email.delivered` | `{ status: 'delivered', deliveredAt: Timestamp, updatedAt: Timestamp }` |
| `email.delivery_delayed` | `{ status: 'delayed', delayedAt: Timestamp, updatedAt: Timestamp }` |
| `email.complained` | `{ status: 'complained', complainedAt: Timestamp, updatedAt: Timestamp }` + créer alerte dans `adminAlerts/{autoId}` avec `{ type: 'email_complaint', messageId, uid?, createdAt }` |
| `email.bounced` | `{ status: 'bounced', bouncedAt: Timestamp, reason: payload.data.bounce?.message, updatedAt: Timestamp }` |
| `email.failed` | `{ status: 'failed', failedAt: Timestamp, reason: payload.data.failed?.reason, updatedAt: Timestamp }` |

> **[CORRECTION H]** Les types du SDK Resend pour les webhooks diffèrent des types d'envoi :
> - `data.to` est `string[]` (tableau), pas `string` — utiliser `data.to[0]` pour l'email du destinataire
> - `data.tags` est `Record<string, string>` (objet plat `{ uid: 'xxx', type: 'verification_code' }`), pas `Tag[]` — accéder via `data.tags?.uid` et `data.tags?.type`

**Note :** Si le webhook reçoit un événement pour un `messageId` inexistant dans `emailLogs` (ex: email envoyé par un autre système), le webhook crée un document minimal avec les données disponibles extraites du payload.

**Fallback minimal pour `messageId` inexistant :**
```ts
await adminDb.collection('emailLogs').doc(messageId).set({
  messageId,
  status: eventTypeToStatus(payload.type),
  to: data.to[0],              // string[] → premier destinataire
  subject: data.subject,
  type: data.tags?.type,       // Record<string, string> → valeur directe
  uid: data.tags?.uid,         // Record<string, string> → valeur directe
  createdAt: admin.firestore.Timestamp.now(),
  updatedAt: admin.firestore.Timestamp.now(),
});
```

**Schéma complet du document `emailLogs/{messageId}` :**
```ts
{
  messageId: string,          // ID Resend (doc ID = messageId)
  status: 'sent' | 'delivered' | 'failed' | 'bounced' | 'complained' | 'delayed',
  to: string,                 // adresse email du destinataire (premier élément de data.to[])
  subject: string,            // sujet de l'email
  type: 'verification_code' | 'approval' | 'rejection' | 'suspension' | 'deactivation' | 'reactivation',
  uid?: string,               // Firebase Auth UID si disponible (extrait de data.tags.uid)
  reason?: string,            // motif échec/bounce
  // Timestamps par événement
  sentAt: Timestamp,           // toujours renseigné (création à l'envoi)
  deliveredAt?: Timestamp,     // renseigné par webhook email.delivered
  failedAt?: Timestamp,        // renseigné par webhook email.failed
  bouncedAt?: Timestamp,       // renseigné par webhook email.bounced
  complainedAt?: Timestamp,    // renseigné par webhook email.complained
  delayedAt?: Timestamp,       // renseigné par webhook email.delivery_delayed
  // Métadonnées
  createdAt: Timestamp,       // premier événement reçu
  updatedAt: Timestamp,       // dernier événement reçu
}
```

**Note sur l'association `uid` :** L'envoi d'email via Resend SDK supporte les `tags: Tag[]` (input = `{ name: string; value: string }[]`). Le `sendVerificationCodeEmail()` doit inclure `tags: [{ name: 'uid', value: uid }, { name: 'type', value: 'verification_code' }]`. Resend convertit ces tags en `Record<string, string>` (`{ uid: 'xxx', type: 'verification_code' }`) côté webhook — le fallback minimal y accède via `data.tags?.uid` et `data.tags?.type`.


**Note sur l'association `uid` :** L'envoi d'email via Resend SDK supporte les `tags`. Le `sendVerificationCodeEmail()` doit inclure `tags: [{ name: 'uid', value: uid }, { name: 'type', value: 'verification_code' }]` pour que le webhook puisse retrouver l'uid et le type.

5. Retourne toujours HTTP 200 après traitement (sauf signature invalide)

### 3.3 Template Email

Fichier : `src/lib/email-templates.ts` — nouvelle fonction `getVerificationCodeTemplate(code: string)`

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

**Signature de la fonction :**
```ts
export const getVerificationCodeTemplate = (code: string): string
```

### 3.4 Service Email

Fichier : `src/lib/email-service.ts` — nouvelle fonction `sendVerificationCodeEmail()`

> **[CORRECTION A]** La fonction `sendEmail()` existante n'accepte pas de param `tags`. Deux modifications nécessaires :
> 1. Ajouter un param `tags` optionnel à `sendEmail()` et le propager à `resend.emails.send()`
> 2. `sendVerificationCodeEmail()` appelle `sendEmail()` avec les tags

**Modification de `sendEmail()` existante :**
```ts
// Avant
export async function sendEmail({ to, subject, html, fromName = 'Medjira' }: { ... })

// Après — ajout du param `tags` optionnel
export async function sendEmail({
  to, subject, html, fromName = 'Medjira', tags
}: {
  to: string;
  subject: string;
  html: string;
  fromName?: string;
  tags?: Array<{ name: string; value: string }>;
}): Promise<{ messageId?: string }> {
  // ...
  const result = await resend.emails.send({
    from, to, subject, html,
    tags,  // propagé au SDK Resend
  });
}
```

**Nouvelle fonction `sendVerificationCodeEmail()` :**
```ts
export async function sendVerificationCodeEmail({
  to,
  code,
  uid,
}: {
  to: string;
  code: string;  // code en clair (6 chiffres) — sera dans l'email uniquement
  uid: string;
}): Promise<{ messageId?: string }>
```

- Utilise `getVerificationCodeTemplate(code)` pour le HTML
- Subject : `Votre code de vérification Medjira`
- Appelle `sendEmail()` avec `tags: [{ name: 'uid', value: uid }, { name: 'type', value: 'verification_code' }]` pour que le webhook puisse associer l'événement à l'utilisateur

### 3.5 Modification Step1Intent.tsx

> **[CORRECTION #1]** La vérification email se place dans **Step1Intent.tsx**, PAS dans Step2Identity.tsx. L'email est saisi dans Step1, et le compte Firebase Auth est créé dans `handleStep1Next()`. C'est immédiatement après la création du compte que le code OTP est envoyé.

**Principe :** Step1Intent.tsx gère deux phases :
- **Phase A** (actuelle) : formulaire email + password + phone → soumission → création compte Firebase
- **Phase B** (nouvelle) : après création du compte, affichage de l'interface de vérification par code

**Comportement détaillé :**

```
┌──────────────────────────────────────────────────┐
│ Phase A : Saisie email/password/phone (existant) │
│ ┌──────────────────────────────────────────────┐ │
│ │ Email: [___________]                         │ │
│ │ Téléphone: [___________]                     │ │
│ │ Mot de passe: [___________]                  │ │
│ │ [Continuer l'inscription]                    │ │
│ └──────────────────────────────────────────────┘ │
│                         │                        │
│                   onCreateAccount                │
│                         ▼                        │
│ Phase B : Vérification email (nouveau)           │
│ ┌──────────────────────────────────────────────┐ │
│ │ ✉️ Un code a été envoyé à user@email.com     │ │
│ │                                              │ │
│ │ [ _ ] [ _ ] [ _ ] [ _ ] [ _ ] [ _ ]         │ │
│ │                                              │ │
│ │ [Vérifier]                                   │ │
│ │                                              │ │
│ │ Vous n'avez rien reçu ?                      │ │
│ │ [Renvoyer le code] (60s)                     │ │
│ └──────────────────────────────────────────────┘ │
│                         │                        │
│                  onCodeVerified                   │
│                         ▼                        │
│             → Step2 (onNext appelé)              │
└──────────────────────────────────────────────────┘
```

**Nouveaux états dans Step1Intent.tsx :**
```ts
const [verificationPhase, setVerificationPhase] = useState(false);
const [verificationCode, setVerificationCode] = useState(['', '', '', '', '', '']);
const [codeSent, setCodeSent] = useState(false);
const [codeVerified, setCodeVerified] = useState(false);
const [codeLoading, setCodeLoading] = useState(false);
const [codeError, setCodeError] = useState<string | null>(null);
const [attemptsLeft, setAttemptsLeft] = useState(3);
const [countdown, setCountdown] = useState(0);
const [resendLoading, setResendLoading] = useState(false);
```

**Changements du composant :**

1. L'interface `Step1IntentProps` existe déjà : `onNext(data, emailVerified?)` — ajouter un flag optionnel `emailVerified` OU gérer la vérification dans le parent `useDriverRegistration.ts` via un nouveau handler

2. **Choix recommandé :** Ajouter un handler `onSendCode` et `onVerifyCode` dans `useDriverRegistration.ts`, passés en props à Step1Intent. Le hook gère les appels API, le composant gère l'UI.

3. **Props modifiées de Step1Intent :**
```ts
interface Step1IntentProps {
  onNext: (data: Step1FormData) => void;
  onGoogleSignIn: () => void;
  initialData?: Partial<Step1FormData>;
  loading?: boolean;
  // Nouvelles props pour la vérification
  sendVerificationCode?: (email: string) => Promise<{ success: boolean; error?: string }>;
  verifyCode?: (code: string) => Promise<{ success: boolean; error?: string; attemptsLeft?: number }>;
  isExistingUser?: boolean;
  emailPreVerified?: boolean;
}
```

4. **Phase B — UI vérification :**
   - 6 inputs individuels (chacun 1 chiffre), auto-focus sur le suivant
   - Touch targets ≥ 44x44px (conformité medJiraV2 §9.1)
   - Bouton "Vérifier" avec Loader2 pendant la vérification
   - Message d'erreur en cas de code incorrect (avec `attemptsLeft` affiché)
   - Bouton "Renvoyer le code" désactivé pendant 60s (countdown visible)
   - Indicateur ✅ + transition vers Step2 après vérification réussie
   - Haptic feedback sur succès/échec (si Capacitor natif)

5. **Comportement `onNext` :** Le `onNext(data)` n'est appelé qu'APRÈS vérification réussie du code, ce qui bloque la progression vers Step2 sans email vérifié.

6. **Utilisateur existant (`isExistingUser`)** : Si l'utilisateur a déjà un compte Firebase Auth (ex: Google Sign-In), la Phase A est skippée et on va directement à la Phase B si l'email n'est pas vérifié.

### 3.6 Modification useDriverRegistration.ts

> **[CORRECTION #1 + #2]** Le hook coordonne la vérification email.

**Nouveaux handlers dans le hook :**

```ts
const handleSendVerificationCode = async (email: string): Promise<{ success: boolean; error?: string }> => {
  // 1. Vérifier la connectivité (checkConnectivity de @/hooks/useConnectivityMonitor)
  // 2. Obtenir le token Firebase : auth.currentUser?.getIdToken()
  // 3. POST /api/auth/send-verification-code avec { email }
  // 4. Retourner le résultat
};
```

**Modifications de `handleStep1Next` :**
- Après `createUserWithEmailAndPassword()`, appeler automatiquement `handleSendVerificationCode(data.email)`
- Ne PAS appeler `setCurrentStep(2)` immédiatement
- Le passage à Step2 est déclenché par le composant Step1Intent après vérification réussie du code

**Modifications de `handleGoogleSignIn` :**
- Après `AuthService.signInWithGoogleForDriver()`, vérifier `user.emailVerified`
- Si non vérifié → ne PAS passer à Step2, laisser Step1 en Phase B
- Si vérifié → comportement actuel (passer à Step2)

**Ce qui est SUPPRIMÉ dans `handleStep5FinalSubmit` :**
- Supprimer le bloc lignes 422-440 qui appelait `emailVerificationService.sendVerificationEmail()`
- L'email est déjà vérifié à Step1, pas besoin de le re-envoyer à la soumission finale

### 3.7 Modification useDriverProfile.ts

> **[CORRECTION #2]** Le dashboard chauffeur utilise aussi la vérification email.

**Modification de `handleResendVerificationEmail` (ligne 240-254) :**

Avant :
```ts
await AuthService.sendVerificationEmail(auth.currentUser);
```

Après :
```ts
const token = await auth.currentUser.getIdToken();
const res = await fetch('/api/auth/send-verification-code', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ email: auth.currentUser.email }),
});
```

**Ajout d'un handler `handleVerifyCodeDashboard` :**
- Même logique d'appel API que le flux inscription (`POST /api/auth/verify-code`)
- Après succès : appeler `reloadUser()` de `useAuth()` pour rafraîchir `isEmailVerified` dans `AuthContext`
- Le state `isEmailVerified` est déjà utilisé dans `useDriverProfile` (ligne 25 : `const { isEmailVerified, reloadUser } = useAuth()`) et bloque la modification du profil si l'email n'est pas vérifié (ligne 116 : guard dans `handleUpdateProfile`)

**[CORRECTION F] UI dashboard — deux approches possibles :**

> Le dashboard chauffeur actuel affiche une bannière "Email non vérifié" avec un bouton qui appelle `handleResendVerificationEmail()`. Après envoi du code, il faut une UI pour le saisir.

**Option A — Modal de vérification (recommandé) :**
- Après clic sur "Vérifier mon email", le code est envoyé et un **modal/dialog** s'ouvre avec :
  - Message : "Un code a été envoyé à {email}"
  - 6 inputs OTP (même composant que Step1 Phase B, extractible en composant partagé)
  - Bouton "Vérifier" + bouton "Renvoyer" avec countdown 60s
  - Sur succès : fermer le modal, `reloadUser()` rafraîchit `isEmailVerified`, la bannière disparaît
- Avantage : pas de navigation, UX fluide, réutilisable

**Option B — Redirection vers page dédiée :**
- Rediriger vers `/driver/verify-email` avec un composant dédié
- Avantage : séparation claire, mais moins fluide

**Choix recommandé : Option A (modal)** — cohérent avec l'UX mobile, évite une navigation supplémentaire, et le composant OTP peut être extrait en `src/components/ui/OTPInput.tsx` partagé entre Step1 et le dashboard.

**Composant partagé à créer :**

| Fichier | Description |
|---|---|
| `src/components/ui/OTPInput.tsx` | Composant réutilisable : 6 inputs, auto-focus, gestion `codeSent`/`codeVerified`/`attemptsLeft`/`countdown` |
| `src/components/ui/OTPVerificationModal.tsx` | Wrapper modal pour le dashboard (Option A) |

**Props du composant `OTPInput` :**
```ts
interface OTPInputProps {
  email: string;
  onVerify: (code: string) => Promise<{ success: boolean; error?: string; attemptsLeft?: number }>;
  onResend: () => Promise<{ success: boolean; error?: string }>;
  onSuccess?: () => void;
  loading?: boolean;
}
```

---

## 4. Sécurité

| Mesure | Détail |
|---|---|
| Code haché | SHA-256 avant stockage Firestore — jamais en clair |
| Rate limiting envoi | 1 email/minute par uid, vérifié via `resendAt` dans `emailVerificationCodes/{uid}` |
| Max tentatives | 3 essais max → invalidation automatique du code |
| Expiration | 15 minutes — `expiresAt` vérifié côté serveur |
| Signature webhook | SVIX validée avec `RESEND_WEBHOOK_SECRET` (headers `svix-id`, `svix-timestamp`, `svix-signature`) |
| Auth obligatoire | Bearer token Firebase requis sur send + verify |
| Propriétaire email | Vérification que `decodedToken.email === body.email` dans send-verification-code |
| Double marquage | `adminAuth.updateUser(uid, { emailVerified: true })` + Firestore `drivers/{uid}.emailVerified` |

---

## 5. Firestore

### 5.1 Collections

**`emailVerificationCodes/{uid}`** — Documents temporaires (auto-nettoyés)

| Champ | Type | Description |
|---|---|---|
| `code` | string | SHA-256 du code (jamais en clair) |
| `email` | string | Email du destinataire |
| `expiresAt` | Timestamp | Date d'expiration (now + 15 min) |
| `attempts` | number | Nombre de tentatives de vérification |
| `createdAt` | Timestamp | Date de création |
| `resendAt` | Timestamp | Dernier envoi (pour rate limiting) |

**`emailLogs/{messageId}`** — Logs des événements email (voir §3.2 pour le schéma complet)

**`adminAlerts/{autoId}`** — Alertes créées sur événement `email.complained`

### 5.2 Indexes

> **[CORRECTION #4]** Les collections `emailVerificationCodes` et `emailLogs` utilisent des accès par ID de document uniquement (lookup direct). Aucun index composite n'est nécessaire.

> **[CORRECTION B]** `firestore.indexes.json` est du JSON pur — impossible d'ajouter des commentaires `//`. Aucune modification nécessaire dans ce fichier car aucune nouvelle requête filtrée/triée n'est introduite. Documenter cette décision dans le présent paragraphe uniquement.

**Justification :**
- `emailVerificationCodes/{uid}` : accès par ID document (uid) uniquement → pas d'index
- `emailLogs/{messageId}` : accès par ID document (messageId) uniquement → pas d'index
- `adminAlerts/{autoId}` : insertion uniquement, pas de requête → pas d'index

### 5.3 Règles de sécurité Firestore (à ajouter)

```rules
match /emailVerificationCodes/{uid} {
  // Lecture/écriture uniquement côté serveur (API routes via Admin SDK)
  // Pas d'accès client direct — l'Admin SDK bypass les règles
  allow read, write: if false;
}

match /emailLogs/{messageId} {
  allow read: if isAdmin();  // lecture admin uniquement
  allow write: if false;     // écriture via Admin SDK uniquement
}
```

---

## 6. Variables d'environnement

```env
# Déjà présent
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=medjira@medjira.com

# À ajouter
RESEND_WEBHOOK_SECRET=whsec_...  # Obtenu dans Resend Dashboard > Webhooks
```

---

## 7. Gestion Offline & Résilience Réseau

> **[CORRECTION #8]** Conformément au pilier 11 de medJiraV2.

### 7.1 Côté client (Step1Intent.tsx)

- **[CORRECTION E]** Utiliser `checkConnectivity()` (fonction simple, importable depuis `@/hooks/useConnectivityMonitor`) pour vérifier la connectivité avant chaque appel API. Ne PAS utiliser `useConnectivityMonitor` (hook React) dans Step1Intent car il nécessite un callback `showWarning` qui n'est pas disponible dans les composants enfants. Le hook parent `useDriverRegistration` peut utiliser `checkConnectivity()` directement dans ses handlers.
- Si hors ligne au moment de l'envoi du code :
  - Afficher un message : "Vous êtes hors ligne. Connectez-vous à internet pour recevoir le code."
  - Le compte Firebase Auth est déjà créé — l'utilisateur peut reprendre la vérification plus tard
- Si hors ligne au moment de la vérification du code :
  - Afficher : "Vérification impossible hors ligne. Vérifiez votre connexion."
  - Le code est valide 15 min — l'utilisateur a le temps de retrouver une connexion

### 7.2 Reprise de session

- Si l'utilisateur ferme l'app pendant la Phase B (vérification en attente) :
  - Au retour, `onAuthStateChanged` détecte le compte existant (`isExistingUser = true`)
  - Vérifier `user.emailVerified` via Firebase Auth :
    - Si `true` → passer directement à Step2
    - Si `false` → afficher Step1 en Phase B (proposer "Renvoyer le code")
  - Le code précédent est toujours dans Firestore tant qu'il n'a pas expiré

### 7.3 Retry automatique

- Les appels API utilisent `retryWithBackoff` existant (déjà dans `useDriverRegistration.ts`)
- Configuration : `maxAttempts: 3`, delay exponentiel
- Après 3 échecs → afficher le message d'erreur et proposer un retry manuel

### 7.4 Indicateur d'état de synchronisation

- Afficher un indicateur discret pendant les appels API (pas de spinner global, mais Loader2 sur les boutons)
- En cas de latence > 3s, afficher "Vérification en cours..."

---

## 8. Plan de Migration

> **[CORRECTION #2]** Plan complet des fichiers à créer, modifier et supprimer.

### 8.1 Fichiers à CRÉER

| Fichier | Description |
|---|---|
| `src/app/api/auth/send-verification-code/route.ts` | API envoi de code OTP |
| `src/app/api/auth/verify-code/route.ts` | API vérification de code OTP |
| `src/app/api/webhooks/resend/route.ts` | Webhook Resend événements email |
| `src/components/ui/OTPInput.tsx` | Composant réutilisable 6-digit input avec countdown |
| `src/components/ui/OTPVerificationModal.tsx` | Modal de vérification pour le dashboard chauffeur |

### 8.2 Fichiers à MODIFIER

| Fichier | Changement |
|---|---|
| `src/lib/email-templates.ts` | Ajouter `getVerificationCodeTemplate(code: string)` |
| `src/lib/email-service.ts` | **Modifier `sendEmail()`** : ajouter param `tags` optionnel propagé à `resend.emails.send()`. Le type de retour passe de `Promise<{ messageId: string \| undefined }>` à `Promise<{ messageId?: string }>` — compatible avec les appelants existants qui ignorent déjà le retour. **Ajouter** `sendVerificationCodeEmail({ to, code, uid })` qui appelle `sendEmail()` avec tags |
| `src/app/driver/register/components/Step1Intent.tsx` | Ajouter Phase B — utiliser le composant partagé `OTPInput` pour l'UI de vérification |
| `src/app/driver/register/page.tsx` | Passer nouvelles props `sendVerificationCode`, `verifyCode`, `isExistingUser` à Step1Intent |
| `src/hooks/useDriverRegistration.ts` | Ajouter `handleSendVerificationCode`, `handleVerifyCode`. Modifier `handleStep1Next` (envoi auto du code, bloquer Step2). Modifier `handleGoogleSignIn` (vérifier emailVerified). Supprimer l'envoi d'email dans `handleStep5FinalSubmit` (lignes 422-440). |
| `src/hooks/useDriverProfile.ts` | Remplacer `AuthService.sendVerificationEmail()` par appel API `/api/auth/send-verification-code` dans `handleResendVerificationEmail`. Ajouter `handleVerifyCodeDashboard` et afficher `OTPVerificationModal` après envoi du code. |
| `.env.local` | Ajouter `RESEND_WEBHOOK_SECRET=whsec_...` |

### 8.3 Fichiers à SUPPRIMER (ou déprécier)

| Fichier | Action | Justification |
|---|---|---|
| `src/services/email-verification.service.ts` | **Supprimer** | Remplacé par les appels API directs dans les hooks. Le service utilisait la Cloud Function qui est remplacée. |
| `functions/src/emails/send-verification-email.ts` | **Supprimer** | La Cloud Function `sendVerificationEmail` (callable) et `sendVerificationEmailHttp` (HTTP) sont remplacées par les API Routes Next.js. |
| `functions/src/index.ts` | **Modifier** | Retirer la ligne `export { sendVerificationEmail, sendVerificationEmailHttp }` (ligne 661). Retirer le commentaire ligne 643. |

### 8.4 Fichiers à METTRE À JOUR (références croisées)

| Fichier | Changement |
|---|---|
| `src/services/auth.service.ts` | Supprimer ou déprécier `sendVerificationEmail()` (ligne 81) et `resendVerificationEmail()` (ligne 128). Ces fonctions utilisaient `sendEmailVerification()` de Firebase Auth qui est remplacé. Ajouter un `@deprecated` JSDoc pointant vers les nouvelles API routes. |
| `src/hooks/useDriverRegistration.ts` | **[CORRECTION D]** Supprimer l'import direct `import { emailVerificationService } from '@/services/email-verification.service'` (ligne 14). Ce service n'est PAS exporté via le barrel `src/services/index.ts` — il est importé directement. Remplacer les appels par les nouveaux handlers. |

### 8.5 Ordre de migration (sans breaking change)

1. **Étape 1** : Créer les 3 API routes + template + service email (ajout uniquement, pas de breaking)
2. **Étape 2** : Modifier `Step1Intent.tsx` et `useDriverRegistration.ts` (utiliser les nouvelles API)
3. **Étape 3** : Modifier `useDriverProfile.ts` (dashboard)
4. **Étape 4** : Déployer et tester en staging
5. **Étape 5** : Supprimer `email-verification.service.ts` et les Cloud Functions obsolètes
6. **Étape 6** : Ajouter `@deprecated` sur `auth.service.ts` (`sendVerificationEmail`, `resendVerificationEmail`)

---

## 9. Configuration Resend Webhook

Dans le dashboard Resend > Webhooks :
- URL : `https://medjira.com/api/webhooks/resend`
- Événements : `email.delivered`, `email.failed`, `email.bounced`, `email.complained`, `email.delivery_delayed`
> Note : `email.sent` n'est pas nécessaire car le document `emailLogs` est créé côté serveur à l'envoi avec `status: 'sent'`
- Copier le signing secret → `RESEND_WEBHOOK_SECRET`

---

## 10. Hors scope

- Vérification email côté **clients** passagers (pas dans cette spec — les clients conservent le lien Firebase Auth)
- Dashboard admin pour visualiser les logs webhook (future spec)
- Rate limiting global par IP (le rate limiting par uid Firestore suffit pour les chauffeurs authentifiés)
- Support SMS OTP (future spec si nécessaire)

---

## 11. Checklist de validation expert

### Corrections initiales (revue #1)

- [ ] **[CORRECTION #1]** La vérification email est dans Step1Intent.tsx (Phase B), PAS dans Step2Identity.tsx
- [ ] **[CORRECTION #2]** Le plan de migration (§8) liste explicitement tous les fichiers à créer/modifier/supprimer
- [ ] **[CORRECTION #3]** `adminAuth.updateUser(uid, { emailVerified: true })` est appelé dans verify-code
- [ ] **[CORRECTION #4]** Les indexes Firestore sont documentés (pas d'index composite nécessaire)
- [ ] **[CORRECTION #5]** Le schéma complet de `emailLogs/{messageId}` est défini (§3.2 + §5.1)
- [ ] **[CORRECTION #6]** Les modifications de Step1Intent.tsx sont détaillées avec le flux Phase A/B (§3.5)
- [ ] **[CORRECTION #7]** Les schémas Zod sont explicites pour send-verification-code et verify-code (§3.2)
- [ ] **[CORRECTION #8]** La gestion offline et la résilience réseau sont spécifiées (§7)
- [ ] **[CORRECTION #9]** `export const runtime = 'nodejs'` est déclaré sur les 3 API routes (§3.1)

### Corrections secondaires (revue #2)

- [ ] **[CORRECTION A]** `sendEmail()` est modifiée pour accepter un param `tags` optionnel propagé à Resend SDK — `sendVerificationCodeEmail()` ne "délègue" plus aveuglément mais passe les tags (§3.4)
- [ ] **[CORRECTION B]** Pas de modification de `firestore.indexes.json` (JSON pur, pas de commentaires). Justification documentée dans la spec (§5.2)
- [ ] **[CORRECTION C]** Le document `emailLogs/{messageId}` est créé à l'envoi (dans `send-verification-code`), pas par le webhook. Le webhook ne fait que mettre à jour le `status` et timestamp (§3.2)
- [ ] **[CORRECTION D]** L'import `emailVerificationService` dans `useDriverRegistration.ts` est un import direct (pas via barrel) — migration explicite dans §8.4
- [ ] **[CORRECTION E]** Utiliser `checkConnectivity()` (fonction) et non `useConnectivityMonitor` (hook) dans les handlers API — le hook nécessite un callback `showWarning` non disponible dans les composants enfants (§7.1)
- [ ] **[CORRECTION F]** Dashboard : UI de saisie du code via modal `OTPVerificationModal` avec composant partagé `OTPInput` (§3.7 + §8.1)

### Corrections tertiaires (revue #3)

- [ ] **[CORRECTION 5a]** La justification de la Correction C est revue : la création de `emailLogs` à l'envoi garantit l'association uid fiable côté serveur, pas via les tags Resend (§3.2)
- [ ] **[CORRECTION 5c]** Les chemins d'extraction `reason` sont corrects : `payload.data.bounce?.message` pour bounced, `payload.data.failed?.reason` pour failed (§3.2 table webhook)
- [ ] **[CORRECTION 4]** `email.sent` retiré de la liste d'abonnement webhook §9 — redondant car le document est créé à l'envoi
- [ ] **[CORRECTION 5g]** §2.2 clarifie que le dashboard utilise actuellement Firebase Auth natif (pas Resend) — les deux flux convergent après migration
- [ ] **[CORRECTION 5b]** Référence "ligne 116" corrigée : c'est un guard dans `handleUpdateProfile()`, pas une bannière (§3.7)
- [ ] **[CORRECTION 5d]** Référence circulaire supprimée dans `send-verification-code` (§3.2 point 8)
- [ ] **[CORRECTION 5e]** `sentAt` marqué requis dans le schéma `emailLogs` — toujours renseigné à la création (§3.2)
- [ ] **[CORRECTION 5f]** Le changement de type de retour `sendEmail()` est documenté comme non-breaking dans §8.2

### Corrections quaternaires (revue #4)

- [ ] **[CORRECTION G]** Validation webhook via `new Webhooks().verify()` du SDK Resend (`resend@^6.9.3`), pas de validation SVIX manuelle ni dépendance `svix` séparée (§3.2)
- [ ] **[CORRECTION H]** Types webhook Resend : `data.to` est `string[]` (utiliser `data.to[0]`), `data.tags` est `Record<string, string>` (utiliser `data.tags?.uid`), pas `Tag[]` — fallback minimal documenté avec code exemple (§3.2)
