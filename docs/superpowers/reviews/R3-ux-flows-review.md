# R3 — UX Flows inscription (Phase 3)

**Date :** 2026-05-06
**Branche :** my-new-interface
**Commits couverts :** `755c849` .. `38c97f6` (13 commits)

## Critères

- [x] Sélecteur `/auth/role` : 3 cartes (Client, Chauffeur, Restaurateur), authenticated users auto-redirected.
- [x] Wizard restaurateur 4 étapes fonctionnel :
  - Step 1 : compte gérant (email/password + createUser)
  - Step 2 : OTP email (sendVerificationCode/verifyCode)
  - Step 3 : restaurant info (extrait de /food/create steps 1+2)
  - Step 4 : horaires + soumission (submitRestaurantApplication callable)
- [x] Param `?from=become-pro` : skip steps 1+2, démarrage step 3.
- [x] Persistance brouillon cross-device via `users/{uid}.draftRestaurant` (debounced 1.5s).
- [x] Bannière reprise sur dashboard client (`RegistrationDraftBanner`).
- [x] Page `/restaurant/pending` : realtime status via onSnapshot, CTA resubmit si rejected.
- [x] Page `/restaurant/suspended` : info + contact support.
- [x] Redirect `/food/create` → `/restaurant/register` (bookmarks préservés).
- [x] Landing "Créer un compte" → `/auth/role`.
- [x] Accessibilité : labels ARIA, `aria-required`, `role="alert"` sur erreurs, touch targets ≥ 44px.
- [x] TypeScript strict : 0 erreur sur fichiers P3.

## Tests passés

- Unit : `npx jest src/hooks/__tests__/useRestaurantRegistration.test.ts` → 18 passed
  - useRestaurantRegistration : 18 tests (transitions, validation, erreurs, flow, boundaries, Auth errors)
- TypeScript : 0 erreur sur fichiers restaurant/auth P3
- Build : pré-existant `firebase-messaging-sw.js` static export error (non-P3)

## Fichiers livrés

### Nouveaux (12 fichiers)
- `src/utils/restaurant-constants.ts`
- `src/app/auth/role/page.tsx`
- `src/app/restaurant/register/page.tsx`
- `src/app/restaurant/register/components/Step1Account.tsx`
- `src/app/restaurant/register/components/Step2EmailVerification.tsx`
- `src/app/restaurant/register/components/Step3Restaurant.tsx`
- `src/app/restaurant/register/components/Step4Hours.tsx`
- `src/app/restaurant/pending/page.tsx`
- `src/app/restaurant/suspended/page.tsx`
- `src/hooks/useRestaurantRegistration.ts`
- `src/hooks/__tests__/useRestaurantRegistration.test.ts`
- `src/components/restaurant/RegistrationDraftBanner.tsx`

### Modifiés (2 fichiers)
- `src/app/page.tsx` — CTA → `/auth/role`
- `src/app/food/create/page.tsx` — redirect → `/restaurant/register`

## Notes / risques pour P4

- `RegistrationDraftBanner` inséré dans le dashboard client mais `<BecomeProCard />` et `<RoleSwitcher />` arrivent en P4.
- Le dashboard restaurant (`/restaurant/dashboard`) n'existe pas encore — P4 le livrera. En P3, `/restaurant/pending` redirect vers `/dashboard?restaurant_approved=1`.
- `skipToStep3` vérifie l'auth et peuple `step1Data.email` depuis `auth.currentUser`, mais ne vérifie pas `emailVerified` côté client (la callable `submitRestaurantApplication` le vérifie côté serveur).
- Les scheduled functions `purgeRestaurantDrafts` et `purgeOrphanAuthUsers` (spec §7.2) ne sont pas incluses — à ajouter en P4 ou P5.
- Pas de `usePlacesAutocomplete` sur le champ adresse (TODO P5).
- Pas de `PhoneInput` avec sélecteur pays (TODO P5).
- Pas d'upload image couverture (TODO P4/P5).
- `LoadingSpinner` utilisé au lieu de skeleton screens — acceptable en P3.

## Go/No-go : GO pour P4.
