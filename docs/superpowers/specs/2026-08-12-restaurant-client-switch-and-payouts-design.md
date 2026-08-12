# Espace restaurant : rôles, déconnexion et revenus

## Objectif

Corriger les parcours du portail restaurant afin que le restaurateur puisse changer d’espace, se déconnecter réellement et configurer le moyen de réception de ses revenus depuis un emplacement visible. Le toggle doit rester compact sur Android et afficher les icônes des rôles disponibles.

Le message `Extension context invalidated` provenant de `content.js` est produit par une extension du navigateur et reste hors du périmètre applicatif.

## Diagnostic

`RestaurantClientActivation` met à jour `activeRole` dans Firestore puis appelle `/dashboard`. Le `AuthContext` conserve cependant les anciennes données utilisateur jusqu’à son prochain chargement. La page `/dashboard` lit alors encore `activeRole: restaurant` et redirige vers le portail restaurant. Le correctif doit donc synchroniser le profil local avec Firestore avant la navigation.

Le bouton `Quitter le portail` ne fait actuellement qu’une navigation vers `/dashboard`; il ne ferme pas la session Firebase. Il doit appeler le service de déconnexion commun avant de rediriger vers `/login`.

`RoleSwitcher` est actuellement un bouton compact qui ouvre une liste. Cette interaction ne correspond pas au toggle demandé. Le composant doit devenir un seul contrôle en forme de pilule, composé de segments d’icônes reliés, tout en conservant les garde-fous de statut et de course active.

Le portail restaurant charge déjà `stripeConnectStatus` dans `restaurant`. Le composant `StripeConnectBanner` sait déjà afficher le bon état et pointer vers `/restaurant/onboarding/payments`, mais il n’est actuellement visible que depuis le tableau de bord restaurant qui redirige automatiquement vers le portail lorsque le restaurant est approuvé.

## Conception retenue

### Toggle des espaces

Dans `RoleSwitcher` :

1. Afficher un seul toggle en forme de pilule avec une icône par rôle disponible : Client, Restaurateur et Chauffeur. Le rôle Client reste affichable pour un compte professionnel qui ne l’a pas encore activé afin de permettre son activation.
2. Mettre en évidence le rôle actif avec un segment sélectionné et contigu aux autres segments ; aucun menu déroulant ne sera utilisé.
3. Utiliser `aria-label`, `title` et un état `aria-pressed` pour rendre les icônes compréhensibles sans occuper l’espace des libellés.
4. Conserver l’activation Cloud Function pour un rôle client absent.
5. Écrire `activeRole` et `lastActiveRole`, appeler `reloadUser()` depuis `useAuth`, puis utiliser `router.replace()` vers le tableau de bord du rôle.
6. Désactiver les rôles interdits pendant une course active ou lorsque le rôle restaurant est suspendu.
7. Afficher une erreur sans navigation partielle et désactiver le toggle pendant toute l’opération.

La Cloud Function `activateClientRole` ne sera pas modifiée : elle attribue le rôle sans imposer le rôle actif, ce qui conserve la séparation entre activation et bascule.

`RestaurantClientActivation` sera supprimé du header du portail si le toggle couvre son usage. Aucun parcours d’activation ne sera perdu : l’icône Client reprend cette responsabilité.

### Déconnexion du portail

Dans `PortalClient` :

1. Remplacer le bouton texte par une action compacte avec l’icône `logout`.
2. Appeler `AuthService.signOut()` afin de gérer Firebase Auth et la déconnexion Google native lorsque l’application fonctionne dans Capacitor.
3. Rediriger avec `router.replace('/login')` uniquement après une déconnexion réussie.
4. Désactiver le bouton et afficher un état de chargement pendant l’opération.
5. En cas d’erreur, conserver l’utilisateur sur la page et afficher une erreur actionnable.

### Configuration des revenus

Dans `PortalClient`, afficher `StripeConnectBanner` immédiatement sous l’alerte de validation du restaurant et avant les statistiques, uniquement lorsque le restaurant est approuvé. `getRestaurantById` fournit déjà `stripeConnectStatus`.

Le composant existant conserve ses états :

- `not_started` : « Configurez vos paiements » → `/restaurant/onboarding/payments` ;
- `in_progress` : « Reprendre » → `/restaurant/onboarding/payments` ;
- `restricted` : « Réparer » → `/restaurant/onboarding/payments?mode=update` ;
- `active` : aucun bandeau.

Cette position est visible sans interrompre la gestion des commandes et évite de créer un second parcours de paiement.

### Images de menu et erreur Storage

Le `403 permission-denied` du screenshot concerne les règles Firebase Storage `menu-images/{restaurantId}/{itemId}/{uploadId}`. Les règles resteront propriétaires uniquement. L’investigation vérifiera :

- que l’UID Firebase courant correspond à `restaurants/{restaurantId}.ownerId` ;
- que l’identifiant restaurant utilisé par le menu est celui du profil authentifié ;
- que le fichier est bien un WebP de 500 Ko maximum ;
- que l’upload attend la fin de la tâche resumable avant de demander son URL.

Si l’erreur vient d’un identifiant incohérent ou d’une session non rafraîchie, le correctif portera sur la source de données et son message d’erreur. Les règles ne seront pas élargies à des utilisateurs non propriétaires.

## Flux de données

```text
clic sur une icône du toggle
        ↓
activation client si nécessaire
        ↓
mise à jour activeRole / lastActiveRole
        ↓
reloadUser() → AuthContext à jour
        ↓
router.replace(route du rôle)

clic sur logout
        ↓
AuthService.signOut()
        ↓
router.replace('/login')

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
- Une erreur de déconnexion empêche la navigation et est affichée au restaurateur.
- Une erreur `content.js` provenant d’une extension navigateur n’est pas traitée dans l’application.
- Les statuts Stripe non actifs restent actionnables ; le statut actif masque le bandeau.
- Une erreur Storage ne donne pas d’accès supplémentaire ; elle expose plutôt un message expliquant l’absence de droits ou la contrainte de fichier.

## Tests et vérification

Ajouter ou adapter des tests pour vérifier :

- le toggle rend uniquement les rôles disponibles et utilise des icônes sans libellés longs ;
- l’activation/bascule appelle `reloadUser` avant `router.replace()` ;
- une erreur empêche la navigation et expose le message à l’utilisateur ;
- la déconnexion appelle `AuthService.signOut()` avant `router.replace('/login')` ;
- le bandeau de paiement est affiché au bon endroit pour `not_started`, `in_progress` et `restricted` ;
- le bandeau est absent pour `active` et pour un restaurant non approuvé.
- un upload Storage respecte le chemin, le type et la limite attendus, et un propriétaire incorrect reste refusé.

Exécuter ensuite les tests ciblés, le typecheck, le lint et le build de production si les tests ciblés passent.
