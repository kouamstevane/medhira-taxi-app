# 🚨 REGISTRE DES PROBLÈMES - Medjira VTC App

**Date** : 3 avril 2026  
**Marché cible** : 🇨🇦 Canada (CAD)

---

## 🔴 CRITIQUE 

### SEC-02 : Clés API Google Maps Hardcodées
**Statut** : ⚠️ ACTIF  
**Fichiers** :
- `src/hooks/useGoogleMaps.ts` (ligne 138)
- `src/app/create-collections/page.tsx` (lignes 32, 327)

**Problème** : La clé `AIzaSyDMXeXZCFAVGeSFW_-3MYkrqV2bN1SXY-8` est dans le code source



---

### SEC-03 : Clés Firebase Project Exposées
**Statut** : ⚠️ ACTIF  
**Fichier** : `src/app/create-collections/page.tsx` (lignes 31-38, 326-333)

**Problème** : Credentials Firebase hardcodées comme fallbacks



---

### SEC-04 : Pages Admin/Débug Accessibles Publiquement
**Statut** : ⚠️ ACTIF  
**Fichiers** :
- `src/app/create-collections/page.tsx`
- `src/app/test-matching/page.tsx`

**Problème** : Pages administratives accessibles sans authentification



---

### SEC-05 : API Routes Corrompues (.tmp_build)
**Statut** : ⚠️ ACTIF  
**Fichiers** :
- `src/app/api/admin/delete-driver-complete/route.ts.tmp_build`
- `src/app/api/admin/send-email/route.ts.tmp_build`
- `src/app/api/debug/log/route.ts.tmp_build`
- `src/app/api/reverse-geocode/route.ts.tmp_build`

**Problème** : Extension `.tmp_build` au lieu de `.ts` → Next.js ne les sert pas



---

### SEC-06 : Encryption Service Déprécié
**Statut** : ⚠️ ACTIF  
**Fichier** : `src/services/encryption.service.ts`

**Problème** : Service marqué `@deprecated` avec salt dans localStorage (vulnérable XSS)



---

### SEC-07 : Token Auth dans localStorage
**Statut** : ⚠️ ACTIF  
**Fichier** : `src/config/api.ts` (lignes 48-50)

**Problème** : `APIClient` lit `localStorage.getItem('auth-token')`



---

### SEC-08 : Endpoint Debug Log Non Authentifié
**Statut** : ⚠️ PENDING (actif après renommage .tmp_build)  
**Fichier** : `src/app/api/debug/log/route.ts.tmp_build`

**Problème** : Endpoint acceptera POST sans auth une fois renommé



---

## 🟠 HAUTE PRIORITÉ (À traiter dans les 2 semaines)

### PERF-01 : Admin Drivers - Collection Entière Téléchargée
**Statut** : 🔄 ACTIF  
**Fichier** : `src/app/admin/drivers/page.tsx` (lignes 151-180)

**Problème** : Télécharge TOUS les chauffeurs avec `onSnapshot`, filtre côté client

**Impact** : 1000 chauffeurs = 1000 reads/ouverture = ~$0.18/ouverture

---

### PERF-04 : Google Maps Loading par Polling
**Statut** : 🔄 ACTIF  
**Fichier** : `src/hooks/useGoogleMaps.ts` (lignes 162-176)

**Problème** : Polling 100ms pendant max 10s



---

### PERF-05 : useEffect Sans Cleanup (Memory Leaks)
**Statut** : ✅ RÉSOLU (2026-04-04)
**Solution** : Guard `isMounted` ajouté dans `useAdminAuth.ts` pour le fetch async. Les useEffect avec onSnapshot avaient déjà leur cleanup.
**Fichiers** : 198 occurrences trouvées

**Problème** : useEffect ne retournent pas de fonction cleanup
> Les `onSnapshot` principaux dans les pages admin ont déjà un cleanup. Reste à auditer les autres useEffect.


---

### PERF-06 : Pagination Absente
**Statut** : ✅ RÉSOLU (2026-04-03)  
**Fichiers** :
- `src/app/admin/drivers/page.tsx`
- `src/app/admin/users/page.tsx`
- `src/app/admin/restaurants/page.tsx`

**Solution** : Pagination client-side (25 par page) + "Charger plus" Firestore (augmente `limit` dynamiquement) ajoutée aux pages admin/drivers et admin/users.



---

### ARCH-01 : Structure de Dossiers Non Conventionnelle
**Statut** : ✅ RÉSOLU (2026-04-04)
**Solution** : Utilitaires inline extraits vers modules dédiés :
- `retryWithBackoff` → `src/utils/retry.ts`
- `redirectWithFallback` → `src/utils/navigation.ts`
- `useConnectivityMonitor` → `src/hooks/useConnectivityMonitor.ts`

**Problème** : Services/hooks mal organisés



---

### ARCH-02 : Code Dupliqué
**Statut** : ✅ RÉSOLU (2026-04-03)

**Solution** : Hook `useAdminAuth` créé dans `src/hooks/useAdminAuth.ts`. La logique `checkAdmin` était copy-collée dans les 3 pages admin — centralisée et supprimée des pages.

---

### ARCH-03 : Service de Matching Monolithique
**Statut** : ✅ DÉJÀ RÉSOLU  
**Fichier** : `src/services/matching/`

**Note** : Le service est déjà découpé en 6 fichiers distincts : `assignment.ts`, `broadcast.ts`, `findAvailableDrivers.ts`, `automaticSearch.ts`, `retry.ts`, `index.ts`. Ce problème n'existe plus.



---

### ARCH-05 : Gestion d'État Morcelée
**Statut** : ✅ RÉSOLU (2026-04-04)
**Solution** : `src/store/driverStore.ts` Zustand créé. `useDriverProfile` utilise le store pour éviter les double-fetches entre dashboard et profil.

**Problème** : État global géré via useState, Zustand, Firebase listeners sans cohérence



---

### CODE-01 : Utilisation du Type `any`
**Statut** : ✅ RÉSOLU (2026-04-04)
**Solution** : Tous les `any` remplacés dans config/api.ts (8), logger.ts (5+), driver/dashboard (5+).
**Fichiers** : 87+ instances → réduction en cours

**Solution partielle (2026-04-03)** : `createdAt: any` → `createdAt: unknown` dans `admin/drivers/page.tsx` et `admin/users/page.tsx`. `err: any` → `err` + `instanceof Error` dans les 3 pages admin.

**Reste** : ~80+ instances dans d'autres fichiers.



---

### PAY-01 : Méthodes Paiement Canadiennes
**Statut** : 📢 Optionnel  
**Description** : Ajouter Interac, Apple Pay, Google Pay (Stripe déjà OK)



---

## 🟡 MOYENNE PRIORITÉ

### TEST-01 : Tests de Matching Stub
**Statut** : ✅ RÉSOLU (2026-04-03)  
**Fichier** : `src/services/matching/__tests__/assignment.test.ts`

**Solution** : 8 vrais tests unitaires écrits pour `assignDriver` et `cancelAssignment` couvrant : attribution succès, course déjà attribuée, chauffeur indisponible, candidature absente, candidature expirée, course introuvable, annulation avec libération chauffeur, annulation course fantôme.

---

### TEST-02 : Couverture Tests Insuffisante
**Statut** : 📊 ~5% (amélioration en cours)

---

## 🟢 BASSE PRIORITÉ

### MAINT-01 : Fichiers ESLint Disable Complets
**Fichiers** :
- `src/app/auth/register/RegisterContent.tsx`
- `src/app/driver/login/page.tsx`
- `src/app/driver/verify-email/page.tsx`

---

### MAINT-02 : Console Logs en Production
**Statut** : 🔄 PARTIELLEMENT RÉSOLU  
**Occurrences** : 326 → réduction en cours

**Solution partielle (2026-04-03)** : Tous les `console.error/log` dans les 3 pages admin remplacés par `createLogger()`. Le service `assignment.ts` utilisait déjà `logger` correctement.

---

### MAINT-03 : Fichiers Monolithiques > 800 Lignes
**Statut** : ✅ RÉSOLU (2026-04-04)
**Solution** :
- `driver/register/page.tsx` : 1198 → ~111 lignes (logique → `useDriverRegistration`)
- `driver/profile/page.tsx` : 806 → ~120 lignes (logique → `useDriverProfile`)
**Fichiers** :
- `src/app/driver/register/page.tsx` (1249 lignes) — à découper
- `src/app/driver/dashboard/page.tsx` (946 lignes) — déjà découpé partiellement (`RideRequestCard`, `CurrentTripCard`)
- `src/app/driver/profile/page.tsx` (806 lignes) — à découper


---

**Document à jour** : 4 avril 2026 (révision)  
**Prochaine révision** : Quand TEST-02, MAINT-02 sont traités
