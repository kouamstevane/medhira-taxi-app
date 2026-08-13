# Paramètres du portail restaurant — gestion des horaires

## Objectif

Permettre au gérant de modifier facilement les horaires hebdomadaires de son restaurant depuis le portail restaurant. L’accès sera identifié par le libellé **Paramètres**, plus précis que « Profil » pour des réglages opérationnels.

## Périmètre

Inclus :

- Ajouter « Paramètres » à la navigation basse du portail restaurant.
- Créer la route statique `/food/portal/settings?restaurantId=...`.
- Afficher et modifier les horaires des sept jours.
- Permettre de marquer chaque jour comme ouvert ou fermé.
- Enregistrer les changements dans `restaurants/{restaurantId}.openingHours`.
- Conserver séparément le bouton d’ouverture temporaire `isOpen`.
- Afficher les horaires réels du jour sur le tableau de bord au lieu de l’horaire codé en dur.

Hors périmètre : modification du nom, de l’adresse, du téléphone, de la photo ou des informations administratives du restaurant.

## Approche retenue

Une page dédiée est préférable à une modale ou au profil global : elle offre assez d’espace pour les sept jours, fonctionne sur mobile et pourra accueillir d’autres réglages restaurant ultérieurement. Elle réutilise l’en-tête, les cartes, les couleurs et la navigation du portail existant.

## Architecture

### Navigation et routes

- Étendre `RestaurantPortalSection` avec `settings`.
- Ajouter `{ icon: 'settings', label: 'Paramètres' }` à `portalNavItems`.
- Ajouter `src/app/food/portal/settings/page.tsx`, avec `Suspense` comme les pages Menu et Commandes.
- Ajouter un client dédié sous `src/app/food/portal/[id]/settings/` pour conserver le pattern existant de composants liés au portail.

### Modèle et normalisation

Les données historiques peuvent avoir deux formes : l’inscription utilise `{ open, close, closed }`, alors que le type `Restaurant` documente actuellement `null` pour un jour fermé. Le formulaire utilisera une forme interne unique :

```ts
type RestaurantOpeningHour = {
  open: string;
  close: string;
  closed: boolean;
};
```

Une fonction de normalisation convertira les deux formes vers cette structure et appliquera les horaires par défaut `09:00–22:00`, dimanche fermé, lorsqu’aucune donnée n’existe. L’enregistrement conservera la forme `{ open, close, closed }`, déjà acceptée par les validateurs et les règles Firestore.

### Accès aux données

Ajouter au service restaurant une opération explicite `updateRestaurantOpeningHours(restaurantId, openingHours)` qui écrit seulement `openingHours` et `updatedAt`. Elle ne réutilisera pas `updateRestaurantStatus`, car celui-ci est destiné aux changements administratifs de statut.

La page vérifiera l’utilisateur connecté et que `restaurant.ownerId === user.uid`, comme le portail actuel. Les règles Firestore existantes limitent déjà les écritures du propriétaire aux champs autorisés, dont `openingHours` et `updatedAt`.

## Expérience utilisateur

- Titre : « Paramètres » avec sous-titre « Gérez les horaires de votre restaurant ».
- Carte principale : « Horaires d’ouverture » et une courte explication.
- Chaque ligne montre le jour, un contrôle ouvert/fermé et deux champs `time` si le jour est ouvert.
- Les champs fermés sont masqués plutôt que désactivés pour réduire le bruit visuel.
- Le bouton « Enregistrer les horaires » reste désactivé sans modification.
- Pendant l’écriture, le bouton affiche « Enregistrement… » et empêche les doubles soumissions.
- Après succès, une confirmation toast est affichée et l’état local reste à jour.
- En cas d’erreur, la page conserve les valeurs saisies et affiche un message actionnable.
- Un lien secondaire « Retour au tableau de bord » est disponible en haut de la page.
- Le bouton `isOpen` du tableau de bord reste séparé, avec son libellé « Ouvert actuellement », afin de distinguer l’état immédiat de la programmation hebdomadaire.

Le tableau de bord calculera le jour courant à partir des clés partagées `monday` à `sunday`. Il affichera « Fermé aujourd’hui » si le jour est fermé ou absent, sinon `HH:mm – HH:mm`, avec un lien « Modifier les horaires » vers Paramètres.

## Validation et erreurs

- Au moins un jour doit être ouvert.
- Pour chaque jour ouvert, `open` et `close` doivent être au format `HH:mm`.
- L’heure de fermeture doit être strictement postérieure à l’heure d’ouverture. Les horaires de nuit après minuit ne sont pas inclus dans cette version, car le modèle actuel ne les distingue pas.
- Les données absentes ou historiques sont normalisées avant affichage.
- Les erreurs de lecture, d’autorisation et d’écriture utilisent les messages français existants du portail et ne redirigent vers le tableau de bord qu’en cas d’accès invalide.

## Tests

- Tests unitaires de normalisation, valeurs par défaut et validation des horaires.
- Test de navigation vérifiant la présence et le libellé « Paramètres ».
- Tests du formulaire vérifiant le préremplissage, le masquage d’un jour fermé, le refus de tous les jours fermés et l’enregistrement réussi.
- Test de régression du tableau de bord vérifiant l’affichage de l’horaire du jour depuis les données du restaurant.
- Exécuter les tests ciblés, le lint, le typecheck et le build avant de déclarer le changement terminé.

## Critères d’acceptation

1. Le gérant trouve « Paramètres » dans la navigation basse du portail.
2. La page affiche les horaires existants, y compris les restaurants créés avec l’ancien format.
3. Les horaires modifiés sont enregistrés et persistent après rechargement.
4. Les données invalides sont bloquées avec un message clair.
5. Le tableau de bord ne montre plus un horaire fixe incorrect.
6. Un utilisateur qui n’est pas propriétaire ne peut pas utiliser l’écran pour modifier le restaurant.
