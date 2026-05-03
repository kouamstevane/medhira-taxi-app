# Spec — Onboarding multi-rôles & espace Restaurateur

**Date :** 2026-05-03
**Statut :** En revue (à approuver par l'utilisateur avant écriture du plan d'implémentation)
**Branche cible :** `my-new-interface`
**Approche retenue :**
- **A** pour le point d'entrée d'inscription (sélecteur de rôle plein écran après tap sur "Créer un compte")
- **B** pour le wizard restaurateur (3 étapes légères, complétion post-approbation)
- **Modèle "Client = base universelle"** pour la cohabitation des rôles (un compte ↔ un humain ↔ N rôles)

---

## 1. Contexte et problème

L'application Medjira propose aujourd'hui trois rôles fonctionnels — **Client**, **Chauffeur/Livreur**, **Restaurateur** — mais leur onboarding souffre de trois défauts :

1. **Aucun choix de rôle explicite à l'inscription.** Le bouton « Créer un compte » de la landing crée toujours un compte `userType: 'client'`. Un chauffeur qui clique dessus se retrouve client par erreur.
2. **Pas d'espace Restaurateur.** Il n'existe ni route `/restaurant/register`, ni wizard, ni `userType: 'restaurateur'` natif dans le service auth. Un restaurateur doit aujourd'hui s'inscrire comme client puis aller sur `/food/create` pour soumettre son restaurant — friction et incohérence avec le flux chauffeur.
3. **`userType` exclusif.** Le type est `'client' | 'chauffeur' | 'restaurateur'` (cf. `src/types/user.ts:14`). Un humain ne peut donc pas être à la fois chauffeur et client, alors qu'en pratique il l'est presque toujours (un chauffeur commande aussi des courses ou des repas).

L'objectif est de livrer un onboarding où :

- Le rôle choisi à l'inscription est **explicite et impossible à confondre**.
- Le restaurateur dispose d'un parcours dédié, de qualité équivalente à celui des chauffeurs.
- Un même utilisateur peut **cumuler plusieurs rôles** sans dupliquer son compte, et basculer entre les espaces.
- La **landing actuelle** (logo Medjira, tagline, chips Taxi/Repas/Colis, deux boutons) reste **inchangée visuellement**.

---

## 2. Objectifs & non-objectifs

### Objectifs (in-scope)

1. **Refonte du modèle d'identité** : passage de `userType` exclusif à `roles` cumulatif, avec migration non destructive des comptes existants.
2. **Sélecteur de rôle plein écran** (`/auth/role`) déclenché au tap sur « Créer un compte ».
3. **Wizard restaurateur** en 3 étapes (`/restaurant/register`) avec création du compte client de base + ajout du rôle `restaurant` en `pending_approval`.
4. **Login unifié** sur `/login` qui route automatiquement vers le bon dashboard en fonction des rôles présents (avec écran « Continuer en tant que… » si plusieurs rôles).
5. **Switcher de rôle** dans le header des dashboards (style Uber).
6. **Encart « Devenir pro »** dans le dashboard client (ajout d'un rôle chauffeur ou restaurateur sur un compte existant).
7. **Règles Firestore** mises à jour pour autoriser l'accès en fonction des `roles`, pas plus du `userType`.
8. **Tests automatisés** couvrant la migration, le routage post-login, et les trois flux d'inscription.

### Non-objectifs (out-of-scope)

- Refonte visuelle de la landing.
- Refonte des wizards chauffeur (étapes 0–5) ou client existants — on ne touche que leur câblage à la nouvelle entrée et leur écriture des `roles`.
- Refonte du dashboard restaurateur lui-même (les pages post-approbation : menu, photos, Stripe Connect, commandes). On suppose qu'elles existent ou seront ajoutées dans un chantier ultérieur ; ce spec couvre uniquement l'**onboarding** jusqu'à l'approbation admin.
- Suppression de compte / RGPD (autre chantier).
- SSO / OAuth (autre chantier).

### Critères d'arrêt explicites

Le chantier est terminé quand :
- Les 8 critères d'acceptation de la section 12 sont validés avec preuves (logs, captures, tests verts).
- Aucun compte existant n'est cassé après migration (vérifié par script de validation post-migration).
- La revue de phase 1 (sécurité Firestore) et la revue de phase 2 (UX cross-rôle) sont closes sans bloquant.

---

## 3. Décisions architecturales clés

| Décision | Choix | Raison |
|---|---|---|
| Modèle d'identité | `roles: { client, driver?, restaurant? }` cumulatif | Reflète la réalité (un humain peut être client + pro), aligné Uber/Bolt |
| Rôle de base | `roles.client = true` toujours présent | Tout user peut commander, pas de fonctionnalité perdue |
| Champ legacy `userType` | Conservé temporairement, dérivé de `roles` | Compatibilité Cloud Functions et écrans non-migrés |
| Champ `activeRole` | Stocké côté user, modifiable | Permet au switcher de mémoriser le dernier choix |
| Sélecteur de rôle | Route plein écran `/auth/role` | UX forte, choix obligatoire, pas une rustine modale |
| Login | Unifié sur `/login`, `/driver/login` devient redirect | Une seule porte d'entrée, routage par rôles |
| Wizard restaurateur | 3 étapes légères, complétion post-approbation | Réduit friction, conforme au standard du marché |
| Statut par rôle | Indépendant : `roles.driver.status` et `roles.restaurant.status` | Suspension/validation ciblée par rôle |
| Migration | Script Firebase Admin one-shot, idempotent, dry-run | Cohérent avec le précédent (`feature livreur`) |
| Règles Firestore | Vérifient `roles.X.status == 'approved'`, fallback `userType` pour rétrocompat | Sécurité granulaire sans casser l'existant |

---

## 4. Modèle de données

### 4.1 Nouveau type `UserData` (refonte de `src/types/user.ts`)

```ts
export interface RoleClient {
  enabled: true;                              // toujours true
  joinedAt: Timestamp;
}

export interface RoleDriver {
  status: 'draft' | 'pending' | 'approved' | 'suspended' | 'rejected';
  driverType: 'chauffeur' | 'livreur' | 'les_deux';
  joinedAt: Timestamp;
  approvedAt?: Timestamp;
  suspensionReason?: string;
}

export interface RoleRestaurant {
  status: 'pending_approval' | 'approved' | 'suspended' | 'rejected';
  restaurantId: string;                       // référence à /restaurants/{restaurantId}
  joinedAt: Timestamp;
  approvedAt?: Timestamp;
  rejectionReason?: string;
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
  firstName: string;
  lastName: string;
  profileImageUrl?: string | null;

  // Nouveau modèle de rôles (source de vérité)
  roles: UserRoles;
  activeRole: ActiveRole;                     // dernier espace ouvert

  // Champ legacy maintenu pour rétrocompat — dérivé automatiquement de `roles`
  // Voir section 4.3 pour la règle de dérivation
  userType: 'client' | 'chauffeur' | 'restaurateur';

  country?: string;
  address?: string;
  createdAt: Date | Timestamp;
  updatedAt: Date | Timestamp;
}
```

### 4.2 Pourquoi conserver `userType`

`userType` est utilisé par au moins :
- Cloud Functions (cf. mention `feature livreur` : « JAMAIS modifié — compatibilité Cloud Function »).
- Règles Firestore historiques.
- Composants UI non encore migrés.

Le supprimer d'un coup casse la prod. On le **conserve** comme champ dérivé, mis à jour par le service `userService.syncUserType(uid)` chaque fois que `roles` change. Il est marqué `@deprecated` dans le type ; suppression future planifiée dans un chantier dédié.

### 4.3 Règle de dérivation `userType` ← `roles`

Priorité (premier match gagne) :
1. `roles.driver?.status === 'approved'` → `userType = 'chauffeur'`
2. `roles.restaurant?.status === 'approved'` → `userType = 'restaurateur'`
3. sinon → `userType = 'client'`

Cette règle est volontairement simple ; un user multi-pro reste classé sur son rôle pro **principal** (driver prioritaire — choix arbitraire, à confirmer en revue). Le vrai aiguillage runtime se fait via `roles` et `activeRole`, pas via `userType`.

### 4.4 Document `users/{uid}` après migration — exemple

```json
{
  "uid": "abc123",
  "email": "marie@example.com",
  "firstName": "Marie",
  "lastName": "Dupont",
  "roles": {
    "client": { "enabled": true, "joinedAt": "2025-01-15T..." },
    "restaurant": {
      "status": "approved",
      "restaurantId": "rest_xyz",
      "joinedAt": "2025-02-10T...",
      "approvedAt": "2025-02-12T..."
    }
  },
  "activeRole": "restaurant",
  "userType": "restaurateur",
  "createdAt": "2025-01-15T...",
  "updatedAt": "2026-05-03T..."
}
```

---

## 5. Migration des comptes existants

### 5.1 Script `scripts/migrate-users-to-roles.ts`

- Exécution Firebase Admin SDK avec service account.
- **Dry-run par défaut** (flag `--apply` requis pour écrire).
- Backup automatique : export JSON de la collection `users` dans `backups/users-pre-roles-YYYYMMDD.json` avant écriture.
- Idempotent : si `roles` existe déjà sur un document, on skip.

### 5.2 Logique de migration par compte

```
Pour chaque doc users/{uid} :
  Si doc.roles existe → SKIP (déjà migré)

  roles = { client: { enabled: true, joinedAt: doc.createdAt } }
  activeRole = 'client'

  Si doc.userType === 'chauffeur' :
    Lire drivers/{uid}
    Si trouvé → roles.driver = {
      status: drivers.status,
      driverType: drivers.driverType ?? 'chauffeur',
      joinedAt: drivers.createdAt,
      approvedAt: drivers.approvedAt
    }
    activeRole = 'driver'

  Si doc.userType === 'restaurateur' :
    Chercher restaurants where ownerId == uid
    Si trouvé → roles.restaurant = {
      status: restaurants[0].status === 'approved' ? 'approved' : 'pending_approval',
      restaurantId: restaurants[0].id,
      joinedAt: restaurants[0].createdAt,
      approvedAt: restaurants[0].approvedAt
    }
    activeRole = 'restaurant'

  Update users/{uid} avec roles + activeRole + updatedAt
```

### 5.3 Validation post-migration

Script séparé `scripts/validate-roles-migration.ts` qui vérifie pour chaque user :
- Présence de `roles.client`.
- Cohérence `userType` ⇄ `roles` selon règle 4.3.
- Si `roles.driver`, présence d'un doc `drivers/{uid}`.
- Si `roles.restaurant`, présence d'un doc `restaurants/{restaurantId}` avec `ownerId === uid`.

Sortie : rapport `migration-report-YYYYMMDD.json` listant les anomalies. **Bloquant** : si > 0 anomalie, on rollback depuis le backup.

### 5.4 Rollback

Procédure documentée : restaurer la collection `users` depuis le backup JSON via script `scripts/rollback-roles-migration.ts`. Testée en local sur l'émulateur Firestore avant exécution prod.

---

## 6. Flux utilisateurs détaillés

### 6.1 Inscription depuis la landing

```
[Landing /]
   │
   │ tap "Créer un compte"
   ▼
[/auth/role]  — sélecteur 3 cartes (Client / Chauffeur / Restaurateur)
   │
   ├─ Client       → /auth/register?role=client
   ├─ Chauffeur    → /driver/register (existant, inchangé)
   └─ Restaurateur → /restaurant/register (NOUVEAU)
```

L'écran `/auth/role` :
- Titre : « Je suis… »
- 3 cartes verticales pleine largeur (mobile-first), même langage visuel que la landing (`glass-card`, accent orange).
- Chaque carte : icône Material, titre, 1 phrase de promesse, chevron `arrow_forward`.
- Footer : « Vous avez déjà un compte ? [Se connecter] »

### 6.2 Inscription Client (`/auth/register?role=client`)

Inchangée fonctionnellement. Modification mineure :
- Lit le query param `role` (défaut : `client`).
- Au moment de la création, écrit `roles: { client: {...} }` au lieu de `userType: 'client'` seul (le service met à jour les deux).

### 6.3 Inscription Chauffeur (`/driver/register`)

Inchangée fonctionnellement. Modification :
- Lors de la création initiale (étape 0 ou 1), le service écrit `roles.client + roles.driver` au lieu de `userType: 'chauffeur'`.
- `userType` est dérivé après écriture (règle 4.3).

### 6.4 Inscription Restaurateur (`/restaurant/register`) — NOUVEAU

Wizard 3 étapes, structure inspirée de `useDriverRegistration` :

**Étape 1 — Compte gérant**
- Champs : prénom, nom, email, mot de passe (min 8 caractères), téléphone (avec sélecteur pays existant).
- Validation côté client.
- Soumission : crée Firebase Auth user, crée doc `users/{uid}` avec `roles: { client: {...} }` (le rôle restaurant sera ajouté à l'étape 3).
- Conserve l'utilisateur authentifié pour les étapes suivantes.

**Étape 2 — Restaurant**
- Champs : nom, type(s) de cuisine (multi-sélection prédéfinie), adresse via `usePlacesAutocomplete`, fourchette de prix (€, €€, €€€).
- Photo de couverture **optionnelle** (peut être ajoutée après approbation).

**Étape 3 — Disponibilité**
- Horaires d'ouverture par jour (réutilise le composant existant de `/food/create` page.tsx).
- Soumission finale :
  1. Création du doc `restaurants/{restaurantId}` avec `status: 'pending_approval'` et `ownerId: uid`.
  2. Mise à jour `users/{uid}.roles.restaurant = { status: 'pending_approval', restaurantId, joinedAt: now }`.
  3. Mise à jour `activeRole: 'restaurant'`.
  4. Recalcul `userType` (règle 4.3) → `'restaurateur'` après approbation, ou reste `'client'` tant que pending.
- Redirection vers `/restaurant/pending` (page d'attente).

**Reprise après abandon.** L'état du wizard (étape courante + données saisies) est persisté dans `localStorage` sous la clé `restaurant-registration-draft-{uid}`. Si l'utilisateur abandonne entre l'étape 1 (compte créé) et l'étape 3 (restaurant soumis), au prochain login il atterrit sur son dashboard client avec une bannière « Vous avez une inscription restaurateur en cours — Reprendre ». Le draft est purgé au succès de l'étape 3 ou après 30 jours d'inactivité.

**Page d'attente `/restaurant/pending`**
- Message « Votre dossier est en cours de validation ». Délai indicatif. Email de notification à l'approbation (réutiliser le système existant de notification chauffeur).
- Bouton « Retour à mon espace client » (active le rôle client, route vers `/dashboard`).

### 6.5 Connexion (`/login`)

```
[/login] — email + password
   │
   │ auth réussie
   ▼
Lire users/{uid}.roles
   │
   ├─ 1 seul rôle (client uniquement) ──→ /dashboard
   │
   ├─ 2+ rôles, activeRole défini, "remember" ON ──→ dashboard de activeRole
   │
   └─ 2+ rôles, sinon ──→ /auth/continue-as
                              │
                              ▼
                          Choix → met à jour activeRole → dashboard correspondant
```

**Fallback `activeRole` invalide.** Si `activeRole` pointe vers un rôle absent (suppression) ou non utilisable (statut `rejected` ou `suspended`), le service de routage applique l'ordre suivant : (1) premier rôle pro `approved` trouvé, (2) sinon `client`. `activeRole` est alors corrigé en base et un toast informe l'utilisateur du basculement automatique.

### 6.6 Switcher de rôle (header dashboard)

Composant `<RoleSwitcher />` à intégrer dans le header de chaque dashboard.
- Affiche le rôle actif avec son icône.
- Au tap : dropdown (web) ou bottom-sheet (mobile) listant les rôles disponibles.
- Rôles `pending` ou `suspended` affichés en grisé avec badge de statut, non sélectionnables.
- Sélection : update `activeRole` en Firestore + redirect vers le dashboard correspondant.

### 6.7 Devenir pro (depuis dashboard client)

Carte `<BecomeProCard />` visible uniquement si `roles.driver === undefined && roles.restaurant === undefined`.
- Texte : « Vous êtes professionnel ? Devenez chauffeur ou ajoutez votre restaurant. »
- Tap → `/auth/become-pro` qui propose 2 cartes (chauffeur / restaurateur).
- Chaque carte → wizard correspondant, **en sautant l'étape compte** (utilisateur déjà authentifié).

### 6.8 Conflit d'usage : chauffeur en course active

Règle UI : si `roles.driver` actif et qu'une course est en cours (à détecter via `rides` collection ou store côté driver), le switcher Client devient grisé avec tooltip « Terminez votre course pour basculer ». Pas de blocage côté restaurateur — un restaurateur peut commander un taxi à tout moment.

---

## 7. Composants & fichiers

### 7.1 Nouveaux fichiers

| Fichier | Rôle |
|---|---|
| `src/app/auth/role/page.tsx` | Sélecteur de rôle plein écran (3 cartes) |
| `src/app/auth/continue-as/page.tsx` | Choix de l'espace au login multi-rôle |
| `src/app/auth/become-pro/page.tsx` | Choix d'ajout de rôle pro depuis dashboard client |
| `src/app/restaurant/register/page.tsx` | Wrapper wizard restaurateur |
| `src/app/restaurant/register/Step1Account.tsx` | Étape compte gérant |
| `src/app/restaurant/register/Step2Info.tsx` | Étape restaurant |
| `src/app/restaurant/register/Step3Hours.tsx` | Étape horaires |
| `src/app/restaurant/pending/page.tsx` | Page d'attente post-soumission |
| `src/hooks/useRestaurantRegistration.ts` | Hook orchestrant le wizard restaurateur |
| `src/services/restaurant.service.ts` | (si absent) création + mise à jour de `restaurants/{id}` |
| `src/services/roles.service.ts` | Ajout/suppression de rôles, recalcul `userType` |
| `src/components/role/RoleSwitcher.tsx` | Switcher dans header dashboards |
| `src/components/role/BecomeProCard.tsx` | Encart dashboard client |
| `scripts/migrate-users-to-roles.ts` | Migration one-shot |
| `scripts/validate-roles-migration.ts` | Validation post-migration |
| `scripts/rollback-roles-migration.ts` | Rollback depuis backup |

### 7.2 Fichiers modifiés

| Fichier | Modification |
|---|---|
| `src/types/user.ts` | Ajout types `RoleClient/Driver/Restaurant`, `UserRoles`, `ActiveRole` ; refonte `UserData` |
| `src/types/firestore-collections.ts` | Cohérence avec nouveau modèle de rôles |
| `src/services/auth.service.ts` | `signUpWithEmail` accepte `roleToAdd: 'client' \| 'driver' \| 'restaurant'`, écrit `roles` |
| `src/hooks/useDriverRegistration.ts` | Écrit `roles.driver` au lieu de `userType: 'chauffeur'` |
| `src/app/auth/register/RegisterContent.tsx` | Lit query `?role=`, écrit `roles.client` |
| `src/app/page.tsx` | Suppression du lien « Espace Chauffeur » bas de page |
| `src/app/login/page.tsx` (ou existant) | Routage post-auth selon `roles` |
| `src/app/driver/login/page.tsx` | Devient redirect vers `/login` |
| `src/app/dashboard/page.tsx` | Intègre `<RoleSwitcher />` + `<BecomeProCard />` |
| `firestore.rules` | Vérifications via `roles.X.status` + fallback `userType` |
| `functions/src/*` | Cloud Functions qui lisent `userType` : ajouter lecture `roles` en parallèle |

### 7.3 Inventaire à compléter avant l'implémentation

> **Action de revue P0** : avant le plan d'implémentation, faire un `grep -rn "userType" src/` exhaustif pour lister **tous** les usages et décider, fichier par fichier, s'il faut migrer vers `roles` ou laisser l'usage legacy. Cet inventaire alimente directement le découpage en tâches.

---

## 8. Règles Firestore

Stratégie : **double check** pendant la phase de transition.

```
function hasRole(roleName) {
  return get(/databases/$(database)/documents/users/$(request.auth.uid))
           .data.roles[roleName] != null;
}

function isApprovedDriver() {
  let user = get(/databases/$(database)/documents/users/$(request.auth.uid)).data;
  return user.roles.driver != null && user.roles.driver.status == 'approved';
}

function isApprovedRestaurateur(restaurantId) {
  let user = get(/databases/$(database)/documents/users/$(request.auth.uid)).data;
  return user.roles.restaurant != null
      && user.roles.restaurant.status == 'approved'
      && user.roles.restaurant.restaurantId == restaurantId;
}

// Restaurants : lecture publique, écriture par owner approuvé
match /restaurants/{restaurantId} {
  allow read: if true;
  allow create: if request.auth != null
                && request.resource.data.ownerId == request.auth.uid
                && request.resource.data.status == 'pending_approval';
  allow update: if isApprovedRestaurateur(restaurantId)
                || isAdmin();
}
```

> **Action de revue P0** : faire valider ces règles par revue de sécurité dédiée (cf. section 11) avant déploiement.

---

## 9. Cas limites & règles métier

| # | Cas | Règle |
|---|---|---|
| C1 | Inscription chauffeur ou restaurateur sur un email déjà client | Détection au step compte → message « Cet email est déjà utilisé. Connectez-vous puis ajoutez le rôle pro depuis votre espace. » avec lien vers `/login`. |
| C2 | User sans `roles` (compte non migré ou bug) | Service `roles.service.ts` détecte l'absence et crée `roles.client` à la volée au premier accès. Logué pour audit. |
| C3 | Suspension du rôle pro | Switcher affiche le rôle en grisé avec badge « Suspendu » + raison. Dashboard pro inaccessible, dashboard client toujours accessible. |
| C4 | Rejet de candidature chauffeur ou restaurateur | `roles.X.status = 'rejected'` + `rejectionReason`. UI propose « Soumettre un nouveau dossier » qui passe le statut à `pending` et relance le wizard. |
| C5 | Chauffeur en course active veut basculer client | Switcher Client grisé avec tooltip ; déblocage automatique à la fin de la course. |
| C6 | Suppression du rôle pro (« quitter ») | `roles.driver` supprimé du document, historique préservé. Confirmation modale. Re-création possible plus tard. |
| C7 | Migration : doc `users` sans `userType` | Skip avec warning logué, sera traité manuellement. |
| C8 | Cloud Function legacy lit `userType` après migration | `userType` est toujours présent (dérivé), donc compatible. |

---

## 10. Tests

### 10.1 Tests unitaires (Jest)

- `roles.service.test.ts` : addRole, removeRole, deriveUserType, syncUserType.
- `useRestaurantRegistration.test.ts` : transitions d'étapes, validation, soumission, gestion d'erreurs.
- Logique de routage post-login (pure function).

### 10.2 Tests d'intégration Firestore (jest.firestore)

- Création compte client → `roles.client` présent, `userType = 'client'`.
- Création compte chauffeur → `roles.client + roles.driver`, `userType = 'chauffeur'` après approbation.
- Création compte restaurateur → `roles.client + roles.restaurant`, `userType` reste `'client'` tant que pending.
- Règles Firestore : un user `pending` ne peut pas écrire dans `restaurants/{id}` ; un user `approved` peut.

### 10.3 Tests E2E (Playwright)

- Parcours complet : landing → carte Restaurateur → wizard 3 étapes → page pending.
- Login multi-rôle : compte avec `client + restaurant approved` → écran `continue-as` → switch → dashboard restaurateur.
- Devenir pro : compte client existant → carte « Devenir pro » → wizard chauffeur sans étape compte.

### 10.4 Tests de migration

- Script `migrate-users-to-roles.test.ts` : 4 cas (client pur, chauffeur, restaurateur, déjà migré) sur émulateur.
- Idempotence : ré-exécution ne modifie rien.
- Rollback : backup → migration → rollback → état identique au backup.

---

## 11. Plan de revue (review gates)

L'utilisateur a demandé explicitement « des revues que tu feras pour être sûr que tout est complet ». Le chantier est découpé en **5 phases avec une revue obligatoire à la fin de chacune**. Aucune phase ne démarre tant que la précédente n'a pas passé sa revue.

### Revue R1 — Modèle de données & migration (fin Phase 1)

**Critères :**
- [ ] Types `UserRoles`, `RoleDriver`, `RoleRestaurant` revus, pas d'incohérence avec `firestore-collections.ts`.
- [ ] Script de migration exécuté en dry-run sur un export prod, rapport sans anomalie.
- [ ] Backup vérifiable (taille, lisibilité du JSON).
- [ ] Plan de rollback testé sur émulateur.

**Livrable :** rapport `R1-data-model-review.md`.

### Revue R2 — Sécurité Firestore (fin Phase 2)

**Critères :**
- [ ] Toutes les règles Firestore relues par section.
- [ ] Tests négatifs : un user non-restaurateur ne peut pas écrire dans `restaurants/{id}` ; un user `pending` non plus.
- [ ] Cloud Functions inventoriées : lesquelles lisent `userType`, lesquelles doivent migrer.
- [ ] Aucune règle ne dépend exclusivement du legacy `userType` pour autoriser une écriture sensible.

**Livrable :** rapport `R2-firestore-security-review.md` + tests passants.

### Revue R3 — UX rôles & flux d'inscription (fin Phase 3)

**Critères :**
- [ ] Capture d'écran de chaque écran (sélecteur de rôle, 3 étapes restaurateur, page pending, continue-as, switcher).
- [ ] Vérif manuelle : on ne peut pas finir avec le mauvais rôle, peu importe le chemin.
- [ ] Accessibilité : labels ARIA présents, navigation clavier fonctionnelle.
- [ ] Mobile-first : aucun débordement à 360px de large.
- [ ] Chargements et états d'erreur testés (réseau coupé, email déjà pris, mot de passe trop court).

**Livrable :** rapport `R3-ux-flows-review.md` + captures.

### Revue R4 — Intégration cross-rôle (fin Phase 4)

**Critères :**
- [ ] User multi-rôles (client + restaurant approved) testé bout en bout.
- [ ] Switcher fonctionne, mémorise le choix, gère les rôles suspendus/pending.
- [ ] Encart « Devenir pro » apparaît/disparaît selon les rôles présents.
- [ ] Conflit chauffeur en course → switcher Client grisé.
- [ ] Aucune régression sur les flux existants (login client, wizard chauffeur).

**Livrable :** rapport `R4-cross-role-integration-review.md`.

### Revue R5 — Acceptation finale (fin Phase 5)

**Critères :**
- [ ] Les 8 critères d'acceptation de la section 12 cochés avec preuves.
- [ ] Tests E2E verts sur CI.
- [ ] Migration prod jouée sur staging, rapport de validation propre.
- [ ] Revue de code (`gsd:review` ou `code-review`) sans bloquant.

**Livrable :** rapport `R5-acceptance-review.md` + go/no-go pour merge.

---

## 12. Critères d'acceptation

Chaque critère doit être vérifiable et accompagné d'une preuve (test, capture, log).

1. **AC1** — Depuis la landing, taper « Créer un compte » ouvre `/auth/role` avec 3 cartes ; aucune carte n'est pré-sélectionnée par défaut.
2. **AC2** — Un nouveau restaurateur peut compléter le wizard 3 étapes en moins de 3 minutes (chrono manuel) et arrive sur la page `/restaurant/pending`.
3. **AC3** — Après approbation admin, le restaurateur se connecte et arrive directement sur le dashboard restaurateur sans repasser par le sélecteur de rôle.
4. **AC4** — Un user existant qui était chauffeur avant migration conserve son statut `approved` post-migration, et son flux de connexion l'amène toujours au dashboard chauffeur.
5. **AC5** — Un user qui a `client + restaurant` peut basculer dans son header sans relogin et sans perte d'état.
6. **AC6** — Un user client peut taper « Devenir restaurateur » depuis son dashboard et compléter le wizard sans recréer de compte ; un seul `users/{uid}` existe à la fin.
7. **AC7** — Tests Firestore négatifs : un user `pending_approval` ne peut pas modifier un document `restaurants/{id}` (échoue avec `permission-denied`).
8. **AC8** — Suppression du lien « Espace Chauffeur » de la landing confirmée par capture d'écran.

---

## 13. Risques & mitigations

| Risque | Probabilité | Impact | Mitigation |
|---|---|---|---|
| Migration corrompt des comptes prod | Faible | Critique | Dry-run obligatoire, backup automatique, validation post-migration, rollback testé |
| Cloud Function legacy plante après refonte `userType` | Moyenne | Élevé | `userType` conservé et synchronisé ; tests sur émulateur Functions avant déploiement |
| Régression UX sur le wizard chauffeur | Moyenne | Moyen | Tests E2E existants exécutés à chaque PR ; pas de modification de la logique métier des étapes 1–5 |
| Conflit d'email pour passer client → pro | Faible | Faible | Cas C1 traité explicitement, message clair vers `/login` |
| Charge Firestore : `get(users/...)` dans chaque règle | Moyenne | Moyen | Mesure du nombre de reads avant/après en staging ; cache éventuel via custom claims si > 20% d'augmentation |
| Le switcher en course fait basculer accidentellement | Faible | Élevé | UI grisée + tooltip + double-confirm si bascule en course (cas C5) |

---

## 14. Hors-scope (à plus tard)

- Suppression effective du champ `userType` (chantier après stabilisation).
- Custom claims Firebase Auth pour les rôles (optimisation perf).
- Mode « les_deux » pour restaurateur (un user qui possède plusieurs restaurants distincts).
- Migration des `restaurants` existants pour aligner `status` sur les nouveaux libellés si écart.
- Onboarding mobile natif (Capacitor) — l'écran web responsif suffit.

---

## 15. Phases d'implémentation (vue d'ensemble)

| Phase | Contenu | Revue |
|---|---|---|
| **P1** | Types + service `roles.service.ts` + script de migration + dry-run + backup | R1 |
| **P2** | Règles Firestore + adaptation auth.service + Cloud Functions + tests sécurité | R2 |
| **P3** | Sélecteur `/auth/role` + wizard restaurateur + page pending + RegisterContent adaptation | R3 |
| **P4** | Login unifié + écran continue-as + switcher + encart « devenir pro » | R4 |
| **P5** | E2E + migration staging + revue de code + critères d'acceptation | R5 |

Le **plan d'implémentation détaillé** (tâches atomiques, ordre, dépendances, commandes de vérification, points de commit) sera produit par la skill `superpowers:writing-plans` dans un document séparé après approbation de ce spec.
