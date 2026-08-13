# Correction de la validation du paiement carte Food

## Contexte

Le checkout `/food/checkout` échoue au premier clic de confirmation lorsqu’un paiement par carte est sélectionné. La requête atteint la Cloud Function `createFoodOrder` avec une authentification valide, puis reçoit `invalid-argument` / HTTP 400 avec le message `Données de commande invalides.`. Le paiement Stripe n’est donc jamais préparé.

L’investigation a relevé un contrat de validation incohérent : l’interface considère toute adresse non vide comme valide alors que la Cloud Function exige une adresse de 5 à 500 caractères. Le client transmet aussi des champs optionnels vides ou indéfinis dans le payload callable, ce qui rend le contrat plus difficile à diagnostiquer et à faire évoluer.

## Objectifs

- Empêcher l’envoi d’une commande dont l’adresse ne respecte pas le contrat serveur.
- Construire un payload callable propre, contenant uniquement les champs définis et les valeurs optionnelles réellement renseignées.
- Préserver le flux en deux étapes : création de la commande `pending_payment`, puis préparation/confirmation du paiement carte Stripe.
- Afficher une erreur utilisateur claire lorsque les données de commande sont invalides.
- Ajouter une couverture de test qui reproduit le cas carte et protège contre la régression.

## Hors périmètre

- Modifier les montants calculés par le serveur ou les règles de tarification.
- Modifier la logique Stripe PaymentIntent ou les transferts restaurant.
- Déployer automatiquement en production. Le déploiement sera une étape séparée après validation locale.
- Affaiblir la validation serveur pour accepter des commandes incomplètes.

## Conception retenue

### Validation côté checkout

Le helper d’adresse sera aligné sur `CreateFoodOrderRequestSchema` : après trim, l’adresse doit contenir entre 5 et 500 caractères. Le bouton de confirmation restera désactivé tant que l’adresse est invalide et le message affiché indiquera la contrainte attendue.

La validation locale du service conservera les contraintes structurelles de la commande. Le service préparera les champs optionnels avec une construction conditionnelle afin d’éviter d’envoyer des propriétés `undefined` au callable.

### Flux carte

1. Le checkout valide l’adresse et le prérequis de paiement.
2. `createFoodOrder` reçoit les articles, le restaurant, l’adresse, les préférences et `paymentMethod: 'card'`.
3. La fonction vérifie et calcule le total côté serveur, puis crée une commande `pending_payment`.
4. Le checkout appelle `payFoodOrderWithCard(orderId)` pour obtenir le `clientSecret`.
5. Le composant Stripe confirme le PaymentIntent.
6. Le callback de succès appelle `payFoodOrderWithCard(orderId, paymentIntentId)` pour valider définitivement la commande.

Une erreur pendant la création ou la préparation du paiement reste visible dans le checkout et aucune commande non payée ne doit être considérée comme confirmée.

### Gestion des erreurs

Le service conservera l’erreur Firebase pour les erreurs métier déjà explicites. Pour une erreur `invalid-argument` provenant du callable, l’interface affichera un message actionnable indiquant de vérifier l’adresse et les informations de commande, sans exposer de détail technique Zod.

## Tests

- Test unitaire du helper d’adresse : une chaîne de 1 à 4 caractères est invalide ; une adresse trimée de 5 caractères ou plus est valide.
- Test du service : un payload carte valide transmet `paymentMethod: 'card'` et les options renseignées au callable.
- Test du service : les options vides/indéfinies ne sont pas transmises comme propriétés du payload.
- Test de non-régression du checkout : une adresse trop courte bloque la création de commande avant l’appel Firebase.
- Exécution des tests ciblés frontend et functions, puis vérification TypeScript/build si l’environnement le permet.

## Critères d’acceptation

- Avec une adresse valide et le mode carte, la création de commande ne retourne plus `Données de commande invalides.` à cause du payload client.
- Le formulaire bloque clairement les adresses trop courtes.
- Le paiement carte atteint l’étape Stripe après création de la commande.
- Les tests ajoutés échouent avant la correction et passent après celle-ci.
- Les modifications restent limitées au checkout, au service associé et aux tests/documentation nécessaires.
