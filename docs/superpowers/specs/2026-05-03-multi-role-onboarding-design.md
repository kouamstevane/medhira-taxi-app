# Spec — Onboarding multi-rôles & espace Restaurateur (v2)

**Date :** 2026-05-03
**Version :** 2 (intègre 2 passes de revue)
**Statut :** À approuver avant écriture du plan d'implémentation
**Branche cible :** `my-new-interface`
**Contexte critique :** **App pré-production, aucun utilisateur réel.** Toutes les décisions du spec exploitent cette liberté (clean break sur `userType`, pas de migration prod, pas de rollback ceremony).

**Approches retenues :**
- **A** — sélecteur de rôle plein écran après tap sur « Créer un compte ».
- **B** — wizard restaurateur **4 étapes** (compte → vérification email → restaurant → horaires) obtenu **par refactor** de `/food/create`, pas par duplication.
- Modèle « **Client = base universelle** » pour la cohabitation des rôles.
- **Single source of truth** : statut canonique sur les collections métier (`drivers/{uid}.status`, `restaurants/{id}.status`), `users.roles.*` ne stocke que les références.
- **Stripe Connect restaurateur in-scope** (le parcours bout-en-bout doit être fonctionnel à 100%).

---

## 1. Contexte et problème

L'application Medjira propose trois rôles fonctionnels — **Client**, **Chauffeur/Livreur**, **Restaurateur** — mais leur onboarding souffre de quatre défauts :

1. **Aucun choix de rôle explicite à l'inscription.** Le bouton « Créer un compte » de la landing crée toujours `userType: 'client'`. Un chauffeur ou restaurateur qui clique se retrouve client par erreur.
2. **Pas d'espace Restaurateur dédié.** `/food/create` existe (wizard 3 étapes) mais il suppose un user déjà loggué et il n'est pas exposé depuis la landing — friction et incohérence avec le flux chauffeur.
3. **`userType` exclusif.** `'client' | 'chauffeur' | 'restaurateur'` (cf. `src/types/user.ts:14`) — un humain ne peut pas être à la fois chauffeur et client. Or un chauffeur commande aussi des courses ou des repas en pratique.
4. **Aucune monétisation effective côté restaurateur.** Pas de parcours Stripe Connect comme pour les drivers, donc le flux n'est pas réellement utilisable bout en bout.

Ce chantier livre :

- Onboarding où le rôle est **explicite et impossible à confondre**.
- Espace restaurateur de qualité équivalente au flux chauffeur, **fonctionnel jusqu'à la réception de paiements**.
- Compte unique cumulant **plusieurs rôles** (un humain ↔ un compte ↔ N rôles), avec switcher dans le header.
- Landing actuelle (logo Medjira, tagline, chips Taxi/Repas/Colis, deux boutons) **inchangée visuellement** sauf retrait du lien « Espace Chauffeur » bas de page.

---

## 2. Objectifs & non-objectifs

### Objectifs (in-scope)

1. **Refonte du modèle d'identité** : `userType` est **supprimé** (suppression nette, possible parce qu'il n'y a pas de prod). Une seule source de vérité côté user : `roles`.
2. **Sélecteur de rôle plein écran** (`/auth/role`) déclenché au tap sur « Créer un compte ».
3. **Wizard restaurateur** en 4 étapes (`/restaurant/register`), obtenu par **refactor** de `/food/create` :
   - Étape 1 — Compte gérant (nouvelle).
   - Étape 2 — Vérification email (réutilise le système existant).
   - Étape 3 — Restaurant (issue de `/food/create` step 1+2).
   - Étape 4 — Disponibilité / horaires (issue de `/food/create` step 3).
4. **Stripe Connect restaurateur** post-approbation : route dédiée, restaurant non visible côté client tant que Stripe Connect n'est pas configuré.
5. **Login unifié** sur `/login` qui route automatiquement selon `roles`. `/driver/login` devient un redirect.
6. **Switcher de rôle** (Uber-style) dans le header de chaque dashboard.
7. **Encart « Devenir pro »** dans le dashboard client, visible si **au moins un** rôle pro est manquant.
8. **Driver `pending`** : accès dashboard driver en lecture seule + bannière « Candidature en cours ».
9. **Notification admin** : badge compteur dans dashboard admin **+ email transactionnel** à chaque nouvelle soumission restaurateur.
10. **Règles Firestore** réécrites pour s'appuyer sur `roles` + statut canonique des collections métier, avec immutabilité serveur des champs sensibles.
11. **Tests automatisés** couvrant les flux d'inscription, le routage post-login, la sécurité (self-promotion impossible) et la persistance cross-device du brouillon.

### Non-objectifs (out-of-scope)

- Refonte visuelle de la landing.
- Refonte des étapes 1–5 du wizard chauffeur (logique métier inchangée, seule l'écriture vers `roles` change).
- Refonte du dashboard restaurateur post-approbation hors la **page Stripe Connect** (gestion menu, photos détaillées, gestion commandes — autres chantiers).
- Multi-restaurants par compte (1 restaurant par user, règle existante préservée).
- Suppression de compte / RGPD.
- SSO / OAuth.
- Onboarding mobile natif (Capacitor) — l'écran web responsive suffit.

### Critères d'arrêt explicites

Le chantier est terminé quand :
- Les **9 critères d'acceptation** de la section 12 sont validés avec preuves (tests verts, captures, logs).
- Plus aucune référence à `userType` dans `src/`, `functions/src/`, `firestore.rules`, ou les tests.
- Les 5 revues R1–R5 sont closes sans bloquant.
- Le parcours bout-en-bout restaurateur (signup → vérif email → wizard → soumission → approbation admin → Stripe Connect → restaurant visible côté client) est démontré sur émulateurs.

---

## 3. Décisions architecturales clés

| Décision | Choix | Raison |
|---|---|---|
| Modèle d'identité | `roles: { client, driver?, restaurant? }` cumulatif | Reflète la réalité, aligné Uber/Bolt |
| Rôle de base | `roles.client` toujours présent | Tout user peut commander |
| Champ legacy `userType` | **Supprimé nettement** | Pas de prod = clean break possible et préférable |
| Source de vérité du statut | Collections métier (`drivers/{uid}.status`, `restaurants/{id}.status`) | Évite la divergence avec `users.roles.*.status` |
| `users.roles.driver` / `restaurant` | Stocke uniquement `{ joinedAt }` (driver) ou `{ restaurantId, joinedAt }` (restaurant) | Pas de status dupliqué |
| Champ `lastActiveRole` | Sur le user, mémorise automatiquement | Comportement « remember » sans UX explicite |
| Sélecteur de rôle | Route plein écran `/auth/role` | UX forte, choix obligatoire |
| Wizard restaurateur | 4 étapes via **refactor de `/food/create`** | Pas de duplication, vérification email en step 2 |
| Login | Unifié sur `/login` | Une seule porte d'entrée |
| Statut driver `pending` | Accès dashboard driver en lecture seule | Q5 = (b) |
| Stripe Connect restaurateur | In-scope, post-approbation | Q2 — flux fonctionnel bout-en-bout |
| Notification admin | Badge dashboard + email transactionnel | Q4 = (b) |
| Brouillon wizard | **Firestore** (`users.draftRestaurant`), pas localStorage | Cross-device pour parcours pro |
| Migration | Script dev unique, sans backup/rollback | Pas de prod |
| Immutabilité | Règles Firestore interdisent au user de modifier `roles.*` sur son propre doc (sauf création initiale validée) | Anti self-promotion |

---

## 4. Modèle de données

### 4.1 Type `UserData` (refonte de `src/types/user.ts`)

```ts
export interface RoleClient {
  enabled: true;                              // toujours true
  joinedAt: Timestamp;
}

export interface RoleDriver {
  joinedAt: Timestamp;                        // PAS de status ici (lu sur drivers/{uid})
}

export interface RoleRestaurant {
  restaurantId: string;                       // référence à restaurants/{id}
  joinedAt: Timestamp;                        // PAS de status ici (lu sur restaurants/{id})
}

export interface UserRoles {
  client: RoleClient;                         // obligatoire
  driver?: RoleDriver;
  restaurant?: RoleRestaurant;
}

export type ActiveRole = 'client' | 'driver' | 'restaurant';

export interface UserData {
  uid: string;
  email?: string | null;
  phoneNumber?: string | null;
  emailVerified: boolean;                     // confirmation explicite
  firstName: string;
  lastName: string;
  profileImageUrl?: string | null;

  roles: UserRoles;                           // SOURCE DE VÉRITÉ pour les rôles
  activeRole: ActiveRole;                     // espace actuellement ouvert
  lastActiveRole?: ActiveRole;                // dernier choix mémorisé pour login

  // Brouillon wizard restaurateur — purgé après soumission ou TTL 30 j
  // Apparaît à partir du wizard step 3 (restaurant), avant le compte n'existe pas
  draftRestaurant?: {
    currentStep: 3 | 4;                       // aligné sur la numérotation du wizard
    data: Partial<RestaurantDraftData>;       // forme = entrée de FoodDeliveryService.createRestaurant
    updatedAt: Timestamp;
  };

  country?: string;
  address?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;

  // ⚠️ Champ supprimé : `userType`. Plus aucune référence dans le code après P1.
}
```

### 4.2 Statut effectif d'un rôle (lecture indirecte)

Pour savoir si un user est un driver approuvé :
```ts
const driverDoc = await getDoc(doc(db, 'drivers', uid));
const isApprovedDriver = user.roles.driver != null
                       && driverDoc.exists()
                       && driverDoc.data().status === 'approved';
```

Pour un restaurateur :
```ts
const restoDoc = await getDoc(doc(db, 'restaurants', user.roles.restaurant!.restaurantId));
const isApprovedRestaurateur = user.roles.restaurant != null
                              && restoDoc.exists()
                              && restoDoc.data().status === 'approved'
                              && restoDoc.data().ownerId === user.uid;       // intégrité (B9)
```

Cette logique est encapsulée dans `src/services/roles.service.ts` (helpers `getEffectiveRoleStatus`, `isApprovedDriver`, `isApprovedRestaurateur`).

### 4.3 Extension du type `Restaurant`

Ajout de deux champs dans `src/types/food-delivery.ts` (interface `Restaurant`) :

```ts
stripeConnectStatus: 'not_started' | 'in_progress' | 'active' | 'restricted';
stripeAccountId?: string;                     // rempli après onboarding réussi
```

Conséquence sur les requêtes catalogue côté client : ajouter `where('stripeConnectStatus', '==', 'active')` aux requêtes de listing publiques (cf. `food-delivery.service.ts:188`).

### 4.4 Document `users/{uid}` après création — exemples

**Client pur :**
```json
{
  "uid": "abc123",
  "email": "marie@example.com",
  "emailVerified": true,
  "firstName": "Marie",
  "lastName": "Dupont",
  "roles": { "client": { "enabled": true, "joinedAt": "..." } },
  "activeRole": "client",
  "createdAt": "...",
  "updatedAt": "..."
}
```

**Restaurateur (post-soumission, en attente d'approbation) :**
```json
{
  "uid": "def456",
  "email": "marc@bistro.fr",
  "emailVerified": true,
  "firstName": "Marc",
  "lastName": "Lefèvre",
  "roles": {
    "client": { "enabled": true, "joinedAt": "..." },
    "restaurant": { "restaurantId": "rest_xyz", "joinedAt": "..." }
  },
  "activeRole": "restaurant",
  "lastActiveRole": "restaurant"
}
```
Le statut effectif de son restaurant est lu via `restaurants/rest_xyz.status` (`'pending_approval'` ici).

---

## 5. Migration des données de dev

### 5.1 Pourquoi version simplifiée

Pré-production, comptes de test uniquement. Pas besoin de backup/rollback/dry-run/staging. Un seul script `scripts/dev-migrate-users-to-roles.ts` exécutable sur émulateur ET projet Firebase de dev.

### 5.2 Script

```
Pour chaque doc users/{uid} :
  Si doc.roles existe → SKIP (déjà migré)

  roles = { client: { enabled: true, joinedAt: doc.createdAt ?? now } }
  activeRole = 'client'

  Si drivers/{uid} existe :
    roles.driver = { joinedAt: drivers.createdAt ?? now }
    activeRole = 'driver'

  Si restaurants where ownerId == uid existe :
    roles.restaurant = { restaurantId: restaurants[0].id, joinedAt: restaurants[0].createdAt ?? now }
    activeRole = 'restaurant'

  emailVerified = doc.emailVerified ?? firebase_auth.user.emailVerified

  Update users/{uid} :
    set roles, activeRole, lastActiveRole = activeRole, emailVerified
    delete userType                            # suppression du champ legacy
```

Idempotent (skip si `roles` existe). Loggue toute anomalie (driver sans doc, restaurant orphelin) sans bloquer.

### 5.3 Validation post-migration

Pas de script séparé. Une fois la migration jouée sur émulateurs, exécution des tests d'intégration (`jest --config jest.firestore.config.js`) qui vérifient la cohérence : tout user a `roles.client`, tout user avec `roles.driver` a un doc `drivers/{uid}`, tout user avec `roles.restaurant` a un doc `restaurants/{restaurantId}` valide. Test rouge = bloquant.

### 5.4 Rollback

En dev : suppression de la collection `users` et re-seed via fixtures. Pas de procédure formelle.

---

## 6. Flux utilisateurs détaillés

### 6.1 Inscription depuis la landing

```
[Landing /]
   │ tap "Créer un compte"
   ▼
[/auth/role]  — sélecteur 3 cartes (Client / Chauffeur / Restaurateur)
   │
   ├─ Client       → /auth/register?role=client
   ├─ Chauffeur    → /driver/register
   └─ Restaurateur → /restaurant/register
```

Écran `/auth/role` :
- Titre : « Je suis… »
- 3 cartes verticales (mobile-first), `glass-card`, accent orange.
- Footer : « Vous avez déjà un compte ? [Se connecter] ».
- **Accès direct par URL `/restaurant/register`** : autorisé (lien partageable). Le sélecteur n'est pas un péage.

### 6.2 Inscription Client (`/auth/register?role=client`)

Modifications mineures du composant `RegisterContent.tsx` :
- Lit `?role=` (défaut : `client`).
- Crée `users/{uid}` avec `roles: { client: {...} }, activeRole: 'client'`.

### 6.3 Inscription Chauffeur (`/driver/register`)

Logique métier des étapes inchangée. Modifications :
- Step0 (sélection driverType) inchangée.
- Lors de la création initiale (après Step0), le service écrit :
  - `users/{uid}` avec `roles: { client: {...}, driver: { joinedAt } }, activeRole: 'driver'`.
  - `drivers/{uid}` avec `status: 'draft'` (puis `'pending'` après step5).

### 6.4 Inscription Restaurateur (`/restaurant/register`) — refactor de `/food/create`

Wizard 4 étapes, hook orchestrateur `useRestaurantRegistration`.

**Étape 1 — Compte gérant** (NOUVELLE)
- Champs : prénom, nom, email, mot de passe (≥ 8 car.), téléphone (sélecteur pays existant).
- Création atomique :
  1. `createUserWithEmailAndPassword` (Firebase Auth).
  2. `setDoc(users/{uid}, { roles: { client }, activeRole: 'restaurant', emailVerified: false, ... })`.
  3. Si (2) échoue : `deleteUser` côté Auth pour éviter les orphelins (transaction manuelle, pas de Firestore transactions cross-Auth).
- Mapping erreur Firebase :
  - `auth/email-already-in-use` → message « Cet email est déjà utilisé. [Connectez-vous] » avec lien `/login`.
  - autres erreurs réseau → toast retry.

**Étape 2 — Vérification email** (NOUVELLE — réutilise le système existant)
- Réutilise le composant et le service de `docs/superpowers/specs/2026-04-10-email-verification-code-design.md`.
- L'utilisateur reçoit un code, le saisit, on flag `emailVerified: true` dans `users/{uid}`.
- **Bloquant** : impossible de passer à l'étape 3 sans email vérifié. Bouton « Renvoyer le code » disponible.

**Étape 3 — Restaurant** (extraite de l'actuel `/food/create` step 1 + 2)
- Champs : nom, description, type(s) de cuisine (multi-sélection `CUISINE_TYPES`), adresse via `usePlacesAutocomplete`, téléphone du restaurant, fourchette de prix.
- Image de couverture **optionnelle** à ce stade.
- Préfill possible : si user a un brouillon en `users.draftRestaurant`, restauration auto.

**Étape 4 — Disponibilité** (extraite de l'actuel `/food/create` step 3)
- Horaires d'ouverture par jour (composant existant, déplacé).
- Soumission finale (transaction Firestore atomique) :
  1. Création `restaurants/{restaurantId}` (auto-id) avec `status: 'pending_approval'`, `ownerId: uid`, `stripeConnectStatus: 'not_started'`.
  2. Update `users/{uid}.roles.restaurant = { restaurantId, joinedAt }`.
  3. Purge de `users.draftRestaurant`.
  4. Trigger Cloud Function `notifyAdminNewRestaurant` (badge + email).
- Redirection vers `/restaurant/pending`.

**Persistance du brouillon (cross-device)**
- À partir de l'étape 3 (le compte existe), à chaque modification (debounced 1.5s), écriture de `users/{uid}.draftRestaurant = { currentStep, data, updatedAt }`.
- Au login suivant, si `draftRestaurant` existe et restaurant non encore créé, bannière « Vous avez une inscription restaurateur en cours — Reprendre » sur le dashboard client.
- Cloud Function planifiée (TTL 30 j) qui purge les `draftRestaurant.updatedAt < now - 30d`.

**Page d'attente `/restaurant/pending`**
- Message « Votre dossier est en cours de validation ». Statut effectif lu sur `restaurants/{restaurantId}.status`.
- Email automatique à l'approbation (réutilise le système existant de notif chauffeur, à confirmer présent).
- Boutons : « Retour à mon espace client » (active client + redirige `/dashboard`), « Modifier mon dossier » si `status === 'rejected'`.

### 6.5 Stripe Connect restaurateur — post-approbation

Une fois `restaurants/{id}.status === 'approved'` :

```
[/restaurant/dashboard]
   │ bannière "Configurez vos paiements pour recevoir des commandes"
   ▼
[/restaurant/onboarding/payments]
   │ Stripe Connect Express onboarding
   ▼
Cloud Function: stripe webhook account.updated
   │ met à jour restaurants/{id}.stripeConnectStatus = 'active' + stripeAccountId
   ▼
Restaurant devient visible côté client (catalogue /food)
```

Tant que `stripeConnectStatus !== 'active'` :
- Le restaurant est **filtré côté requête client** (`status === 'approved' && stripeConnectStatus === 'active'`).
- L'admin voit le restaurant approuvé mais signalé « En attente Stripe Connect ».

Réutilise au maximum le code existant `functions/src/stripe/stripeConnectPayout.ts` (3 occurrences `userType` à migrer).

### 6.6 Connexion (`/login`)

```
[/login] — email + password
   │ auth réussie
   ▼
Lire users/{uid}
   │
   ├─ 1 seul rôle (client) ──→ /dashboard
   │
   ├─ 2+ rôles, lastActiveRole défini ──→ dashboard de lastActiveRole
   │
   └─ 2+ rôles, lastActiveRole absent ──→ /auth/continue-as
                                              │
                                              ▼
                                           Choix → écrit lastActiveRole
                                                   + activeRole → dashboard
```

**Fallback `activeRole` invalide** : pointe vers un rôle absent ou non-utilisable (ex : restaurant `rejected`). Ordre de fallback :
1. premier rôle pro avec statut `approved` (lecture indirecte sur drivers/{uid} ou restaurants/{id}),
2. sinon `client`.
`activeRole` corrigé en base, toast informatif.

`/driver/login` → redirect 301 vers `/login` (préserve les bookmarks).

### 6.7 Switcher de rôle (header dashboards)

`<RoleSwitcher />` dans le header des trois dashboards.
- Affiche le rôle actif (icône + libellé).
- Tap → dropdown desktop ou bottom-sheet mobile listant les rôles disponibles avec **statut effectif** :
  - Client : toujours sélectionnable.
  - Driver : selon `drivers/{uid}.status` — `approved` cliquable, `pending`/`rejected`/`suspended` grisé avec badge.
  - Restaurant : selon `restaurants/{restaurantId}.status` + `stripeConnectStatus`.
- Sélection → met à jour `activeRole` + `lastActiveRole` dans `users/{uid}` + redirect dashboard.

### 6.8 Driver `pending` — accès lecture seule (Q5)

Un user avec `roles.driver` mais `drivers/{uid}.status === 'pending'` :
- Peut basculer sur `activeRole = 'driver'` via le switcher.
- Le dashboard driver s'affiche avec **bannière persistante en haut** : « Votre candidature est en cours d'examen — Vos données sont en lecture seule jusqu'à approbation ».
- Tous les boutons d'action (accepter une course, modifier le profil pro, etc.) sont désactivés (HTML `disabled` + tooltip).
- Modes possibles côté store : `viewOnly: boolean` calculé depuis le statut effectif.

### 6.9 Devenir pro (depuis dashboard client)

`<BecomeProCard />` visible si **au moins un rôle pro est manquant** (corrigé depuis v1) :
- `roles.driver === undefined && roles.restaurant === undefined` → carte « Devenir chauffeur ou restaurateur ».
- `roles.driver === undefined && roles.restaurant !== undefined` → carte « Devenir chauffeur ».
- `roles.driver !== undefined && roles.restaurant === undefined` → carte « Ouvrir un restaurant ».

`/auth/become-pro` propose les rôles pertinents et lance le wizard correspondant **en sautant l'étape compte gérant** (utilisateur déjà authentifié + email déjà vérifié).

### 6.10 Conflit d'usage : chauffeur en course active

Si `activeRole = 'driver'` ET course en cours (lue depuis `rides` collection ou store driver) :
- Switcher Client grisé, tooltip « Terminez votre course pour basculer ».
- Re-sélection automatique possible à la fin de la course (toast « Course terminée — vous pouvez basculer »).

Pas de blocage symétrique côté restaurateur (un restaurateur peut commander un taxi à tout moment).

---

## 7. Composants & fichiers

### 7.1 Refactor / déplacement

| Source | Destination | Nature |
|---|---|---|
| `src/app/food/create/page.tsx` | `src/app/restaurant/register/page.tsx` (wrapper) + `Step3Restaurant.tsx` + `Step4Hours.tsx` | Découpage du composant monolithique en sous-étapes |
| `src/app/food/create/` (route entière) | redirect `/food/create` → `/restaurant/register` | Préserve les liens existants |

### 7.2 Nouveaux fichiers

| Fichier | Rôle |
|---|---|
| `src/app/auth/role/page.tsx` | Sélecteur de rôle plein écran |
| `src/app/auth/continue-as/page.tsx` | Choix d'espace au login multi-rôle |
| `src/app/auth/become-pro/page.tsx` | Choix d'ajout de rôle pro depuis dashboard client |
| `src/app/restaurant/register/page.tsx` | Wrapper wizard restaurateur |
| `src/app/restaurant/register/Step1Account.tsx` | Étape compte gérant (NOUVELLE) |
| `src/app/restaurant/register/Step2EmailVerification.tsx` | Vérification email (réutilise composant existant) |
| `src/app/restaurant/register/Step3Restaurant.tsx` | Issue du refactor `/food/create` step 1+2 |
| `src/app/restaurant/register/Step4Hours.tsx` | Issue du refactor `/food/create` step 3 |
| `src/app/restaurant/pending/page.tsx` | Page d'attente post-soumission |
| `src/app/restaurant/onboarding/payments/page.tsx` | Stripe Connect Express onboarding |
| `src/app/restaurant/dashboard/page.tsx` | Dashboard restaurateur (point d'entrée minimal — bannière Stripe Connect, lien menu, etc.) |
| `src/hooks/useRestaurantRegistration.ts` | Hook orchestrateur du wizard |
| `src/services/roles.service.ts` | `addRole`, `removeRole`, `getEffectiveRoleStatus`, `setActiveRole` |
| `src/components/role/RoleSwitcher.tsx` | Switcher header |
| `src/components/role/BecomeProCard.tsx` | Encart dashboard client |
| `src/components/restaurant/RegistrationDraftBanner.tsx` | Bannière reprise brouillon |
| `functions/src/admin/notifyAdminNewRestaurant.ts` | Cloud Function : email + badge admin (Q4) |
| `functions/src/scheduled/purgeRestaurantDrafts.ts` | Cloud Function planifiée TTL 30 j |
| `scripts/dev-migrate-users-to-roles.ts` | Migration dev (1 fichier — pas de backup/rollback/validation séparés) |

### 7.3 Fichiers modifiés (suppression de `userType`)

Inventaire exhaustif réalisé : **115 occurrences dans 29 fichiers**. Liste complète :

| Fichier | Occurrences | Action |
|---|---|---|
| `src/services/auth.service.ts` | 16 | Refonte `signUpWithEmail` (paramètre `roleToAdd`), suppression toutes les écritures `userType` |
| `tests/firestore.rules.test.ts` | 13 | Récriture des fixtures vers `roles` |
| `middleware.ts` | 11 | Routage utilise `roles` |
| `src/services/pushNotifications.service.ts` | 9 | Routage des notifs par `roles` |
| `src/app/dashboard/page.tsx` | 8 | Affiche switcher + BecomeProCard |
| `src/app/admin/users/page.tsx` | 6 | Filtres admin par `roles` |
| `src/hooks/usePushNotifications.ts` | 5 | Adaptation aux roles |
| `src/components/notifications/NotificationHandler.tsx` | 5 | Adaptation aux roles |
| `src/components/ChatModal.tsx` | 4 | Adaptation aux roles |
| `src/types/firestore-collections.ts` | 4 | Suppression du champ `userType` |
| `src/app/auth/register/RegisterContent.tsx` | 4 | Lit `?role=`, écrit `roles.client` |
| `firestore.rules` | 5 | Réécriture (cf. §8) |
| `functions/src/stripe/stripeConnectPayout.ts` | 3 | Adapte aux roles |
| `src/context/AuthContext.tsx` | 2 | Expose `roles` au lieu de `userType` |
| `src/hooks/useDriverRegistration.ts` | 2 | Écrit `roles.driver` |
| `src/__tests__/security/security.test.ts` | 2 | Tests roles |
| `src/__tests__/integration/phone-registration.test.tsx` | 2 | Tests roles |
| `src/types/user.ts` | 1 | Suppression `UserType`, ajout types `Role*` |
| `src/utils/test-helpers.ts` | 1 | Helpers roles |
| `functions/src/index.ts` | 1 | Adaptation |
| `functions/src/admin/adminManageUser.ts` | 1 | Adaptation |
| `functions/src/admin/adminManageRestaurant.ts` | 1 | Adaptation (déclenchement notification — Q4) |
| `functions/src/validators/schemas.ts` | 1 | Schema roles |
| `src/app/notifications/page.tsx` | 1 | Adaptation |
| `src/app/auth/register/RegisterPhoneContent.tsx` | 1 | Adaptation |
| `src/__tests__/e2e/e2e-flow.test.tsx` | 1 | Adaptation |
| `scripts/restore-collections.ts` | 1 | Adaptation |
| `.planning/codebase/CONVENTIONS.md` | 2 | Doc à jour |
| `.planning/codebase/ARCHITECTURE.md` | 2 | Doc à jour |
| `src/app/page.tsx` | 0 (mais modifié) | Retrait du lien « Espace Chauffeur » |
| `src/app/driver/login/page.tsx` | 0 (modifié) | Devient redirect vers `/login` |
| `src/app/login/page.tsx` (existant ou nouveau) | — | Routage post-auth selon `roles` |

---

## 8. Règles Firestore

Stratégie : **règles strictes, immutabilité côté serveur, lecture indirecte du statut**.

```javascript
function userDoc() {
  return get(/databases/$(database)/documents/users/$(request.auth.uid)).data;
}

function hasRole(roleName) {
  return userDoc().roles[roleName] != null;
}

function isApprovedDriver() {
  return hasRole('driver')
      && get(/databases/$(database)/documents/drivers/$(request.auth.uid)).data.status == 'approved';
}

function isApprovedRestaurateur(restaurantId) {
  return hasRole('restaurant')
      && userDoc().roles.restaurant.restaurantId == restaurantId
      && get(/databases/$(database)/documents/restaurants/$(restaurantId)).data.status == 'approved'
      && get(/databases/$(database)/documents/restaurants/$(restaurantId)).data.stripeConnectStatus == 'active';
}

// USERS — immutabilité des rôles côté user (anti self-promotion)
match /users/{uid} {
  allow read: if isOwner(uid) || isAdmin();

  // Création initiale : roles autorisé uniquement si :
  //   - roles.client présent et enabled=true
  //   - roles.driver absent OU roles.restaurant absent (ajout via wizard contrôlé)
  allow create: if isOwner(uid)
                && request.resource.data.roles.client.enabled == true;

  // Update : un user ne peut pas s'ajouter/modifier un rôle pro lui-même au runtime.
  // Les ajouts de rôle pro passent par les wizards qui :
  //   - créent le doc drivers/{uid} OU restaurants/{id} en premier
  //   - puis ajoutent roles.driver ou roles.restaurant en référence
  // La règle vérifie que la collection métier correspondante existe et appartient à l'user.
  allow update: if isOwner(uid)
                && (
                  // Pas de modif des rôles
                  request.resource.data.roles == resource.data.roles
                  // OU ajout de roles.driver, mais drivers/{uid} doit exister avec ownerId=uid
                  || (
                    request.resource.data.roles.driver != null
                    && resource.data.roles.driver == null
                    && exists(/databases/$(database)/documents/drivers/$(uid))
                  )
                  // OU ajout de roles.restaurant avec restaurantId valide et propriété confirmée
                  || (
                    request.resource.data.roles.restaurant != null
                    && resource.data.roles.restaurant == null
                    && exists(/databases/$(database)/documents/restaurants/$(request.resource.data.roles.restaurant.restaurantId))
                    && get(/databases/$(database)/documents/restaurants/$(request.resource.data.roles.restaurant.restaurantId)).data.ownerId == uid
                  )
                )
                || isAdmin();

  allow delete: if isAdmin();
}

// RESTAURANTS — un user crée son resto (1 seul), admin gère statut
match /restaurants/{restaurantId} {
  allow read: if true;                        // catalogue public
  allow create: if request.auth != null
                && request.resource.data.ownerId == request.auth.uid
                && request.resource.data.status == 'pending_approval'
                && request.resource.data.stripeConnectStatus == 'not_started';
  // Update interdit au owner sur status et stripeConnectStatus (admin ou Cloud Function uniquement)
  allow update: if (
                  resource.data.ownerId == request.auth.uid
                  && request.resource.data.status == resource.data.status
                  && request.resource.data.stripeConnectStatus == resource.data.stripeConnectStatus
                ) || isAdmin();
  allow delete: if isAdmin();
}

// DRIVERS — analogue
match /drivers/{driverUid} {
  allow read: if isOwner(driverUid) || isAdmin();
  allow create: if isOwner(driverUid)
                && request.resource.data.status == 'draft';
  allow update: if (
                  isOwner(driverUid)
                  // status modifiable par owner uniquement: draft → pending (soumission)
                  && (
                    request.resource.data.status == resource.data.status
                    || (resource.data.status == 'draft' && request.resource.data.status == 'pending')
                  )
                ) || isAdmin();
  allow delete: if isAdmin();
}
```

**Tests Firestore obligatoires** (cf. §10) :
- Un user ne peut pas écrire `users.roles.driver` sans avoir un doc `drivers/{uid}` préalable.
- Un user ne peut pas écrire `users.roles.restaurant.restaurantId = "X"` si `restaurants/X.ownerId !== uid`.
- Un owner ne peut pas modifier `restaurants/{id}.status` (seul admin/Cloud Function).
- Un owner ne peut pas auto-promouvoir `drivers/{uid}.status` à `'approved'`.

---

## 9. Cas limites & règles métier

| # | Cas | Règle |
|---|---|---|
| C1 | Inscription chauffeur ou restaurateur sur un email déjà client | Erreur `auth/email-already-in-use` au step 1 → message « Cet email est déjà utilisé. [Connectez-vous] » → après login, encart « Devenir pro » disponible. |
| C2 | User sans `roles` (incohérence post-migration ou bug) | `roles.service.ts` détecte au premier accès et écrit `roles.client` à la volée + log audit. |
| C3 | Suspension d'un rôle pro (admin) | Status sur la collection métier passe à `'suspended'`. Switcher affiche le rôle grisé avec badge. Dashboard pro inaccessible, client toujours OK. |
| C4 | Rejet de candidature | `restaurants/{id}.status = 'rejected'` + `rejectionReason`. Page `/restaurant/pending` propose « Modifier mon dossier » qui rouvre le wizard à l'étape 3 (pré-rempli) puis repasse en `pending_approval`. |
| C5 | Chauffeur en course active veut basculer client | Switcher Client grisé + tooltip ; déblocage automatique fin de course. |
| C6 | Suppression d'un rôle pro par l'utilisateur | `users.roles.driver` (ou `restaurant`) supprimé du doc + collection métier passe en `archived` (admin gère). Confirmation modale obligatoire. |
| C7 | Step 1 wizard : Firebase Auth réussit, Firestore échoue | `deleteUser` côté Auth + message d'erreur retry. Pas d'orphelin. |
| C8 | Brouillon `draftRestaurant` > 30 j | Cloud Function planifiée le purge. Au login suivant, plus de bannière de reprise. |
| C9 | Driver `pending` ouvre dashboard driver | Affichage en lecture seule + bannière candidature en cours (Q5b). |
| C10 | Restaurant approuvé sans Stripe Connect | Filtré côté catalogue client (`stripeConnectStatus !== 'active'`). Banner persistant côté dashboard restaurateur. |
| C11 | User déjà restaurateur tente de créer un 2ème restaurant | Wizard step 3 vérifie `getRestaurantByOwner`. Si déjà un restaurant → blocage avec message « Un seul restaurant par compte ». Règle Firestore renforce (`allow create` if no existing). |
| C12 | Sélecteur de rôle accédé alors que user déjà connecté | Détecté dans `useEffect` → redirect vers `lastActiveRole` dashboard. |

---

## 10. Tests

### 10.1 Tests unitaires (Jest)

- `roles.service.test.ts` : `addRole`, `removeRole`, `getEffectiveRoleStatus`, `setActiveRole`, fallback `activeRole` invalide.
- `useRestaurantRegistration.test.ts` : transitions, validation par étape, persistance brouillon Firestore (mock), gestion erreur step 1 (Auth/Firestore).
- Logique de routage post-login (pure function avec mocks Firestore).

### 10.2 Tests d'intégration Firestore (`jest --config jest.firestore.config.js`)

- Création client → doc avec `roles.client`, pas de `userType`.
- Création driver → user + drivers/{uid} en `draft`.
- Création restaurant → user + restaurants/{id} en `pending_approval` + `stripeConnectStatus: 'not_started'`.
- Lecture indirecte du statut effectif (4 cas : approved driver, pending driver, approved resto Stripe ON, approved resto Stripe OFF).
- **Sécurité** :
  - User ne peut pas écrire `users.roles.driver` sans `drivers/{uid}` préalable → `permission-denied`.
  - User ne peut pas écrire un `restaurantId` qu'il ne possède pas → `permission-denied`.
  - User ne peut pas modifier `restaurants/{id}.status` → `permission-denied`.
  - User ne peut pas auto-promouvoir `drivers/{uid}.status` à `approved` → `permission-denied`.
- Brouillon `draftRestaurant` : écriture, lecture cross-session, purge.

### 10.3 Tests E2E (Playwright)

- **E2E-1** Parcours restaurateur complet : landing → /auth/role → carte Restaurateur → step 1 → email verif → step 3 → step 4 → /restaurant/pending. Approbation admin (via Cloud Function ou seed). Login → /restaurant/dashboard. Onboarding Stripe (mocké) → restaurant visible côté catalogue client.
- **E2E-2** Login multi-rôle : compte avec `client + restaurant approved + Stripe active` → /auth/continue-as → choix → dashboard correspondant. Bascule via switcher.
- **E2E-3** Devenir pro : login client → dashboard → carte « Ouvrir un restaurant » → wizard sans étape compte → submit → /restaurant/pending.
- **E2E-4** Driver pending : compte chauffeur en `pending` → bascule sur dashboard driver → bannière + actions disabled.
- **E2E-5** Reprise brouillon cross-device : step 1 + step 3 partiel sur navigateur A → login navigateur B → bannière reprise → finalisation step 4.
- **E2E-6** Notification admin : soumission restaurant → dashboard admin badge incrémenté + email reçu (Mailtrap ou stub).

### 10.4 Tests migration

- `dev-migrate-users-to-roles.test.ts` sur émulateur : 4 cas (client, chauffeur approved, restaurateur approved, déjà migré). Vérifier idempotence et absence de `userType` post-migration.

---

## 11. Plan de revue (review gates)

5 phases, 5 revues obligatoires.

### Revue R1 — Modèle de données & migration dev (fin Phase 1)

**Critères :**
- [ ] Types `UserData`, `UserRoles`, `Role*` revus, cohérents avec `firestore-collections.ts`.
- [ ] **Inventaire `userType` validé** : 0 occurrence restante dans `src/`, `functions/src/`, `firestore.rules` (vérification `grep` automatisée dans CI).
- [ ] Script `dev-migrate-users-to-roles.ts` exécuté sur émulateurs avec données fixtures, exit code 0.
- [ ] Tests d'intégration Firestore verts post-migration.
- [ ] Doc `users` orphelins, drivers orphelins, restaurants orphelins → tous loggés (warning) mais pas bloquants.

**Livrable :** rapport `R1-data-model-review.md`.

### Revue R2 — Sécurité Firestore (fin Phase 2)

**Critères :**
- [ ] `firestore.rules` réécrites, relues section par section.
- [ ] **Tests de sécurité (10.2) tous verts**, dont les 4 tests négatifs anti self-promotion.
- [ ] Cloud Functions inventoriées et migrées (lecture des `roles` + collections métier au lieu de `userType`).
- [ ] Aucune règle ne dépend du legacy `userType`.

**Livrable :** rapport `R2-firestore-security-review.md` + suite tests passants.

### Revue R3 — UX flows inscription (fin Phase 3)

**Critères :**
- [ ] Captures de chaque écran : `/auth/role`, 4 étapes wizard restaurateur, `/restaurant/pending`, `/auth/continue-as`, switcher, `<BecomeProCard />`, bannière reprise brouillon.
- [ ] Vérif manuelle : impossible de finir avec le mauvais rôle, peu importe le chemin (URL directe, navigation arrière, refresh).
- [ ] Reprise brouillon cross-device validée manuellement.
- [ ] Accessibilité : labels ARIA, navigation clavier, contraste.
- [ ] Mobile-first 360px : pas de débordement.
- [ ] Erreurs : email déjà pris, mot de passe faible, réseau coupé, code email invalide → tous affichés correctement.

**Livrable :** rapport `R3-ux-flows-review.md` + captures + vidéo screencast cross-device.

### Revue R4 — Intégration cross-rôle + Stripe Connect (fin Phase 4)

**Critères :**
- [ ] User multi-rôle (client + restaurant approved + Stripe active) testé bout-en-bout.
- [ ] Switcher : mémorise via `lastActiveRole`, gère pending/suspended/rejected, conflit course active OK.
- [ ] `<BecomeProCard />` apparaît/disparaît correctement (3 variantes selon rôles présents).
- [ ] **Stripe Connect Express** : onboarding → webhook → `stripeConnectStatus = 'active'` → restaurant visible catalogue client.
- [ ] Driver pending : dashboard accessible en lecture seule, bannière, actions désactivées.
- [ ] Notification admin : badge incrémenté + email reçu (Mailtrap).
- [ ] **Aucune régression** sur flux existants (login client, wizard chauffeur 1-5, paiement client).

**Livrable :** rapport `R4-cross-role-integration-review.md`.

### Revue R5 — Acceptation finale (fin Phase 5)

**Critères :**
- [ ] Les **9 critères d'acceptation** (§12) cochés avec preuves.
- [ ] E2E-1 à E2E-6 verts en CI.
- [ ] Code review (skill `superpowers:requesting-code-review` ou `code-review`) sans bloquant.
- [ ] Lint / build / tests verts.
- [ ] `grep -rn "userType"` retourne 0 dans `src/` + `functions/src/` + `firestore.rules` + tests (sauf docs `.planning/`).

**Livrable :** rapport `R5-acceptance-review.md` + go/no-go pour merge.

---

## 12. Critères d'acceptation

1. **AC1** — Depuis la landing, taper « Créer un compte » ouvre `/auth/role` avec 3 cartes ; aucune pré-sélection.
2. **AC2** — Wizard restaurateur 4 étapes : un nouveau user complète le happy path en E2E sans erreur, atterrit sur `/restaurant/pending`. (Remplace l'AC2 v1 « < 3 min chrono manuel ».)
3. **AC3** — Après approbation admin **et** Stripe Connect actif, le restaurateur connecté arrive directement sur `/restaurant/dashboard`. Le restaurant apparaît dans `/food` côté client.
4. **AC4** — Compte de test pré-existant migré (driver `approved`) conserve son accès au dashboard driver post-migration. `grep "userType"` post-migration : 0 dans `src/`.
5. **AC5** — User `client + restaurant approved` bascule via switcher en < 1s, sans relogin, sans perte d'état.
6. **AC6** — User client tape « Ouvrir un restaurant » → wizard sans étape compte → un seul `users/{uid}` existe à la fin, avec `roles.restaurant` ajouté.
7. **AC7** — Tests Firestore négatifs : 4 cas anti self-promotion tous `permission-denied` (cf. §8).
8. **AC8** — Lien « Espace Chauffeur » retiré de la landing (capture).
9. **AC9** — Driver `pending` accède dashboard driver en lecture seule avec bannière. Tous les boutons d'action `disabled` (capture + test E2E-4).

---

## 13. Risques & mitigations

| Risque | Probabilité | Impact | Mitigation |
|---|---|---|---|
| Inventaire `userType` (115 occurrences) incomplet → fuite legacy | Moyenne | Élevé | CI check `grep "userType"` bloquant à la fin de P1 |
| Cloud Functions oubliées dans la migration → bug runtime | Moyenne | Élevé | Tests sur émulateur Functions avant fin P2, parcourir `functions/src/` exhaustivement |
| Charge Firestore : `get(users/...) + get(drivers/...) + get(restaurants/...)` dans règles | Moyenne | Moyen | Mesure reads/op en émulateur ; envisager custom claims si > seuil acceptable (mitigation P5 si besoin) |
| Refactor `/food/create` casse l'admin existant `/admin/restaurants` | Moyenne | Élevé | Tests régression admin en R2 + R4 |
| Stripe Connect mocking E2E complexe | Moyenne | Moyen | Utiliser `stripe-mock` ou stub côté webhook ; documenter procédure dans tests |
| Brouillon `draftRestaurant` corrompt user doc (mauvaise écriture) | Faible | Moyen | Tests unitaires hook + debounce d'écriture + retry idempotent |
| Email transactionnel admin échoue silencieusement | Faible | Moyen | Cloud Function loggue échec + retry policy ; alerte si > N échecs |
| Conflit course driver — switcher mal grisé | Faible | Élevé | Test E2E dédié + double-confirm en cas de bascule en course |

---

## 14. Hors-scope (à plus tard)

- **Multi-restaurants** par compte (1 restaurant par user dans cette V1, règle préservée).
- **Refonte du dashboard restaurateur** au-delà de la page Stripe Connect (gestion menu détaillé, gestion commandes en temps réel — chantier suivant).
- **Custom claims Firebase Auth** pour les rôles (optimisation perf, à mesurer en P5 si besoin).
- **Onboarding mobile natif Capacitor** spécifique.
- **Suppression de compte / RGPD**.
- **SSO / OAuth**.
- **i18n** au-delà du français (tout est en FR pour cette V1).

---

## 15. Phases d'implémentation (vue d'ensemble)

| Phase | Contenu principal | Revue |
|---|---|---|
| **P1** | Types `roles` + service `roles.service.ts` + script migration dev + **suppression `userType`** dans les 29 fichiers + adaptation `auth.service.ts` + tests intégration | R1 |
| **P2** | Réécriture `firestore.rules` + tests sécurité (anti self-promotion) + adaptation Cloud Functions + adaptation `middleware.ts` | R2 |
| **P3** | Sélecteur `/auth/role` + refactor `/food/create` → wizard `/restaurant/register` 4 étapes + persistance brouillon Firestore + page `/restaurant/pending` + retrait lien landing | R3 |
| **P4** | Login unifié + `/auth/continue-as` + `<RoleSwitcher />` + `<BecomeProCard />` + driver pending lecture seule + Stripe Connect restaurateur + Cloud Function notification admin | R4 |
| **P5** | E2E-1 à E2E-6 + tests régression + code review + critères d'acceptation + nettoyage final | R5 |

Le **plan d'implémentation détaillé** (tâches atomiques, dépendances, commandes de vérification, points de commit, gates de revue) sera produit par `superpowers:writing-plans` après approbation de ce spec v2.
