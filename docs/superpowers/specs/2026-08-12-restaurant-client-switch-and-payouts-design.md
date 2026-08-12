# Espace client et configuration des revenus du restaurateur

## Objectif

Corriger le parcours qui laisse un restaurateur sur son portail après avoir activé ou sélectionné l’espace client, et rendre la configuration du moyen de réception des revenus immédiatement accessible depuis ce portail.

Le message `Extension context invalidated` provenant de `content.js` est produit par une extension du navigateur et reste hors du périmètre applicatif.

## Diagnostic

`RestaurantClientActivation` met à jour `activeRole` dans Firestore puis appelle `/dashboard`. Le `AuthContext` conserve cependant les anciennes données utilisateur jusqu’à son prochain chargement. La page `/dashboard` lit alors encore `activeRole: restaurant` et redirige vers le portail restaurant. Le correctif doit donc synchroniser le profil local avec Firestore avant la navigation.

Le portail restaurant charge déjà `stripeConnectStatus` dans `restaurant`. Le composant `StripeConnectBanner` sait déjà afficher le bon état et pointer vers `/restaurant/onboarding/payments`, mais il n’est actuellement visible que depuis le tableau de bord restaurant qui redirige automatiquement vers le portail lorsque le restaurant est approuvé.

## Conception retenue

### Bascule vers l’espace client

Dans `RestaurantClientActivation` :

1. Conserver l’activation Cloud Function pour un rôle client absent.
2. Écrire `activeRole: client` et `lastActiveRole: client` après activation ou pour une bascule existante.
3. Appeler `reloadUser()` depuis `useAuth` après cette écriture afin que `AuthContext` relise le document utilisateur.
4. Utiliser `router.replace('/dashboard')` après le rechargement.
5. Afficher l’erreur existante si l’activation, l’écriture Firestore ou le rechargement échoue ; le bouton reste désactivé pendant toute l’opération.

La Cloud Function `activateClientRole` ne sera pas modifiée : elle attribue le rôle sans imposer le rôle actif, ce qui conserve la séparation entre activation et bascule.

### Configuration des revenus

Dans `PortalClient`, afficher `StripeConnectBanner` immédiatement sous l’alerte de validation du restaurant et avant les statistiques, uniquement lorsque le restaurant est approuvé.

Le composant existant conserve ses états :

- `not_started` : « Configurez vos paiements » → `/restaurant/onboarding/payments` ;
- `in_progress` : « Reprendre » → `/restaurant/onboarding/payments` ;
- `restricted` : « Réparer » → `/restaurant/onboarding/payments?mode=update` ;
- `active` : aucun bandeau.

Cette position est visible sans interrompre la gestion des commandes et évite de créer un second parcours de paiement.

## Flux de données

```text
clic sur l’action client
        ↓
activateClientRole si nécessaire
        ↓
mise à jour activeRole / lastActiveRole
        ↓
reloadUser() → AuthContext à jour
        ↓
router.replace('/dashboard')

portail restaurant approuvé
        ↓
restaurant.stripeConnectStatus
        ↓
StripeConnectBanner sous l’alerte de validation
        ↓
parcours Stripe Connect existant
```

## Gestion des erreurs

- Une erreur Firebase ou Cloud Function est affichée dans le composant d’activation et n’entraîne pas de navigation partielle.
- Une erreur de rechargement du profil empêche la redirection, afin d’éviter de revenir sur le portail avec un rôle local incohérent.
- Une erreur `content.js` provenant d’une extension navigateur n’est pas traitée dans l’application.
- Les statuts Stripe non actifs restent actionnables ; le statut actif masque le bandeau.

## Tests et vérification

Ajouter ou adapter des tests pour vérifier :

- l’activation/bascule appelle `reloadUser` avant `router.replace('/dashboard')` ;
- une erreur empêche la navigation et expose le message à l’utilisateur ;
- le bandeau de paiement est affiché au bon endroit pour `not_started`, `in_progress` et `restricted` ;
- le bandeau est absent pour `active` et pour un restaurant non approuvé.

Exécuter ensuite les tests ciblés, le lint et le build de production si les tests ciblés passent.
