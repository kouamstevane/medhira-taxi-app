# Design — Forfaits Personal Driver modifiables par l’admin

## Objectif

Permettre à un administrateur de modifier les trois forfaits Personal Driver existants (`basic`, `classic`, `premium`) depuis la page `/admin/personal-driver`.

Les champs commerciaux et les paramètres de calcul seront modifiables. La logique mathématique restera contrôlée par le code :

```text
montant avant taxe = max(montant minimum, distance mensuelle × prix au kilomètre)
```

Les changements s’appliqueront aux nouveaux abonnements uniquement. Les abonnements déjà créés conserveront leur instantané de prix et de droits.

## Périmètre

### Modifiable par l’admin

- nom du forfait ;
- badge ;
- promesse commerciale ;
- prix par kilomètre ;
- distance minimale facturable ;
- montant minimum mensuel ;
- jours de la semaine autorisés ;
- minutes d’attente régulière incluses ;
- nombre de trajets spéciaux inclus ;
- liste des avantages.

### Hors périmètre

- création ou suppression de forfaits ;
- saisie d’une formule mathématique libre ;
- modification rétroactive des abonnements actifs ou payés ;
- modification de l’algorithme de recommandation depuis l’interface.

## Architecture

### Stockage Firestore

Créer une collection publique en lecture seule pour les données commerciales :

```text
personal_driver_plans/{planId}
```

Les identifiants autorisés sont uniquement `basic`, `classic` et `premium`. Chaque document contient les champs de `PersonalDriverPlan`, ainsi que `updatedAt` et `updatedBy`.

Les règles Firestore autorisent la lecture publique de cette collection, car elle ne contient aucune donnée sensible, et refusent toute écriture directe depuis le SDK client. Les écritures passent exclusivement par une Cloud Function.

Les valeurs statiques actuelles de `src/services/personal-driver/plans.ts` et `functions/src/personalDriver/pricing.ts` restent les valeurs par défaut lorsque les documents Firestore sont absents ou illisibles.

### Cloud Function admin

Étendre `adminManagePersonalDriver` avec une action `updatePlan`.

La fonction :

1. vérifie l’authentification ;
2. vérifie l’existence de `admins/{uid}` ;
3. valide l’identifiant et tous les champs avec Zod côté serveur ;
4. refuse les valeurs négatives, les jours invalides, les listes d’avantages vides et les champs texte excessivement longs ;
5. écrit le document avec les champs d’audit `updatedAt` et `updatedBy` ;
6. ne modifie aucun abonnement existant.

### Lecture client et calculs

Ajouter un service partagé de lecture des forfaits côté client. Les pages Personal Driver utiliseront cette configuration pour les cartes, le comparatif, l’assistant de choix, le configurateur et l’estimation.

Le backend chargera la configuration Firestore au moment de calculer un nouveau devis ou un renouvellement. La fonction de calcul restera pure et recevra les forfaits validés en entrée, afin d’être testable sans dépendre de Firestore.

Le renouvellement d’un abonnement relira le forfait courant et créera un nouvel instantané de prix pour la nouvelle période. L’abonnement source et ses périodes déjà payées resteront inchangés.

## Interface admin

Ajouter une section « Gestion des forfaits » au-dessus ou à côté des opérations existantes de la page Personal Driver.

Chaque forfait sera affiché dans une carte contenant un formulaire éditable. Les champs numériques utiliseront des contrôles numériques, les jours autorisés des cases à cocher et les avantages une liste de lignes éditables.

Le formulaire affichera :

- un état de chargement initial ;
- les erreurs de validation sous le champ concerné ;
- un message de succès après sauvegarde ;
- un bouton de restauration des valeurs par défaut locales, sans sauvegarde automatique ;
- la date et l’administrateur de la dernière modification lorsqu’ils existent.

Une sauvegarde réussie recharge les trois forfaits et met à jour immédiatement l’affichage admin. Les utilisateurs voient la nouvelle configuration lors de leur prochaine lecture de la page.

## Gestion des erreurs

- Si Firestore ne répond pas côté client, afficher les valeurs par défaut et un message non bloquant.
- Si la sauvegarde échoue, conserver les valeurs saisies dans le formulaire et afficher l’erreur sans masquer les champs.
- Si la configuration backend est absente ou invalide, utiliser les valeurs par défaut sûres plutôt que facturer avec des données partielles.
- Si un forfait devient incohérent avec les jours demandés, le devis est refusé avec le message métier existant.

## Tests

Ajouter ou compléter les tests pour couvrir :

- validation serveur complète de `updatePlan` ;
- refus d’un appel non authentifié ou non-admin ;
- refus des valeurs invalides et des identifiants inconnus ;
- sauvegarde des champs d’audit ;
- lecture et fusion avec les valeurs par défaut ;
- calcul backend avec une configuration modifiée ;
- conservation des instantanés d’abonnement existants ;
- rendu du formulaire admin, édition des champs, sauvegarde réussie et erreurs ;
- règles Firestore : lecture publique, écriture client refusée.

## Critères d’acceptation

1. Un admin peut modifier chacun des champs définis pour Basic, Classic et Premium depuis `/admin/personal-driver`.
2. Un utilisateur non-admin ne peut pas enregistrer une modification, même en appelant directement la callable.
3. Les nouveaux devis utilisent la configuration modifiée côté client et côté backend.
4. Les abonnements déjà créés conservent leur prix, leur nombre de trajets spéciaux et leurs droits enregistrés.
5. Une configuration absente ou temporairement indisponible ne rend pas la page publique inutilisable et ne permet pas un calcul backend non validé.
