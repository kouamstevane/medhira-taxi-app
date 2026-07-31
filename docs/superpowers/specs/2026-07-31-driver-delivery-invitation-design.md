# Parcours d’invitation Chauffeur/Livreur

## Objectif

Remplacer l’accès public au parcours d’inscription Chauffeur/Livreur par un processus de candidature manuelle : le postulant envoie son CV à `medjiraservices@gmail.com`, l’administrateur étudie la candidature, génère une invitation alphanumérique valable 48 heures, puis le postulant crée directement son compte avec Google ou avec un email et un mot de passe.

## Contraintes

- Le bloc Chauffeur/Livreur ne doit plus être rendu sur `/auth/role/`.
- L’ancien code d’onboarding ne doit pas être supprimé ; il doit rester commenté et identifié comme ancien parcours à conserver.
- Une invitation est liée à une adresse email, un type de poste et une seule utilisation.
- Une invitation expire automatiquement après 48 heures.
- Le compte ne peut être créé qu’après validation serveur de l’invitation.
- Google doit utiliser exactement l’adresse email autorisée par l’administrateur.
- Le code ne doit pas être stocké en clair.
- Les textes UI et emails sont en français ; le code et les commentaires sont en anglais, sauf le marqueur explicite de conservation demandé.

## Parcours

1. L’administrateur crée une invitation depuis l’espace admin avec l’email et le type de poste.
2. Une Cloud Function génère un code alphanumérique, stocke uniquement sa version hachée et envoie un email Resend au postulant.
3. Le postulant ouvre la page d’invitation, saisit son email et son code.
4. Le serveur vérifie l’email, le code, l’état de l’invitation et la date d’expiration.
5. Le postulant choisit Google ou email/mot de passe.
6. Une finalisation serveur vérifie à nouveau l’identité Firebase, crée le document utilisateur et réserve l’invitation dans une transaction.
7. Le postulant est redirigé vers le formulaire Chauffeur/Livreur existant pour compléter son dossier.

## Données

Collection `driverInvitations/{invitationId}` :

- `email`, normalisé en minuscules ;
- `role`: `chauffeur | livreur | les_deux` ;
- `codeHash`, `codeSalt` ;
- `status`: `active | used | expired | revoked` ;
- `expiresAt`, `createdAt`, `usedAt` ;
- `createdBy`, `usedBy` ;
- `emailMessageId` ;
- `applicantName` et `adminNote` optionnels.

## Fonctions serveur

- `adminCreateDriverInvitation`: réservé aux administrateurs, génère et envoie le code.
- `validateDriverInvitation`: vérifie une invitation sans la consommer et retourne uniquement les métadonnées nécessaires à l’UI.
- `completeDriverInvitation`: authentifié, exige que l’email Firebase corresponde à l’invitation, marque l’invitation comme utilisée et initialise le compte chauffeur.

Les fonctions appliquent une limitation de débit, des validations Zod et des erreurs génériques pour éviter l’énumération des invitations.

## Email

L’email précise le code, sa validité de 48 heures, sa date d’expiration et l’impossibilité de l’utiliser après expiration. Aucun CV ni mot de passe n’est demandé par email.

## UI et compatibilité

- `/auth/role/` conserve uniquement Client et Restaurateur visibles.
- Une page `/auth/driver-invitation` prend en charge la validation et les deux méthodes d’authentification.
- L’ancien lien `/driver/register` reste conservé dans le code commenté, mais n’est plus exposé depuis la sélection de rôle.
- Les tests couvrent l’affichage de `/auth/role/`, l’expiration, la correspondance email, l’usage unique et les deux méthodes d’authentification.
