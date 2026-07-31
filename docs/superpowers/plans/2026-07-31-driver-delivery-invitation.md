# Parcours d’invitation Chauffeur/Livreur Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduire une invitation admin de 48 heures pour permettre la création contrôlée de comptes Chauffeur/Livreur avec Google ou email/mot de passe.

**Architecture:** Les Cloud Functions gèrent la génération, le hachage, l’envoi et la consommation atomique des invitations. Une page Next.js dédiée valide le code puis authentifie l’utilisateur avec Google ou email/mot de passe avant de reprendre l’onboarding chauffeur existant.

**Tech Stack:** Next.js App Router, TypeScript, Firebase Auth, Firestore, Firebase Cloud Functions v2, Zod, Resend, Jest, React Testing Library.

## Global Constraints

- Ne pas supprimer l’ancien onboarding Chauffeur/Livreur ; le conserver commenté avec un marqueur explicite.
- Les invitations expirent après 48 heures et ne sont utilisables qu’une fois.
- L’email Firebase doit correspondre exactement à l’email de l’invitation.
- UI et emails en français ; code et commentaires en anglais, sauf le commentaire de conservation demandé.

### Task 1: Cacher l’ancien choix de rôle

**Files:**
- Modify: `src/app/auth/role/page.tsx`
- Test: `src/app/auth/role/__tests__/RoleSelectionPage.test.tsx`

- [ ] Ajouter un marqueur de conservation autour de l’ancien rôle Chauffeur/Livreur.
- [ ] Exclure ce rôle du tableau effectivement rendu sans supprimer sa définition historique.
- [ ] Vérifier que Client et Restaurateur restent visibles et que le lien chauffeur n’est plus rendu.

### Task 2: Ajouter le modèle et les fonctions d’invitation

**Files:**
- Create: `functions/src/driver/driverInvitation.ts`
- Modify: `functions/src/index.ts`
- Modify: `functions/src/admin/index.ts`
- Test: `functions/src/driver/__tests__/driverInvitation.test.ts`

- [ ] Ajouter les schémas Zod, la génération alphanumérique, le hachage PBKDF2 et les contrôles de statut/expiration.
- [ ] Implémenter `adminCreateDriverInvitation`, `validateDriverInvitation` et `completeDriverInvitation` avec transaction Firestore.
- [ ] Envoyer l’email d’invitation via le service Resend existant.
- [ ] Exporter les callables et couvrir les scénarios valides, expirés, email différent, code incorrect et réutilisation.

### Task 3: Ajouter les emails d’invitation

**Files:**
- Modify: `functions/src/email-service.ts`
- Test: `functions/src/__tests__/email-service.test.ts`

- [ ] Ajouter un template d’invitation avec code, expiration exacte et lien d’accès.
- [ ] Ajouter le type `driver_invitation` aux logs et tags d’email.
- [ ] Vérifier le contenu français et la présence des 48 heures.

### Task 4: Créer la page publique d’invitation

**Files:**
- Create: `src/app/auth/driver-invitation/page.tsx`
- Create: `src/app/auth/driver-invitation/DriverInvitationClient.tsx`
- Create: `src/app/auth/driver-invitation/__tests__/DriverInvitationClient.test.tsx`

- [ ] Construire les étapes email/code puis création de compte.
- [ ] Ajouter Google avec `GoogleAuthProvider` et email/mot de passe avec Firebase Auth.
- [ ] Bloquer l’accès si l’identité Google ne correspond pas à l’email invité.
- [ ] Appeler la finalisation serveur puis rediriger vers `/driver/register`.

### Task 5: Ajouter l’action admin de génération

**Files:**
- Inspect and modify: `src/app/admin/drivers/page.tsx` et composants admin associés
- Test: test admin associé à la page ou au composant créé

- [ ] Ajouter un formulaire admin pour email, type de poste, nom et note.
- [ ] Afficher le statut et l’expiration de l’invitation retournée.
- [ ] Gérer les erreurs d’autorisation, d’email et d’envoi.

### Task 6: Vérification

**Files:**
- Modify: tests concernés uniquement si nécessaire

- [ ] Exécuter les tests ciblés frontend et functions.
- [ ] Exécuter lint et build selon les scripts du dépôt.
- [ ] Vérifier manuellement que `/auth/role/` ne présente plus Chauffeur/Livreur.
