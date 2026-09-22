# Actions de masse du catalogue restaurant

## Objectif

Permettre au restaurateur de sélectionner quelques plats ou tous les plats correspondant aux filtres et à la recherche actifs, puis de rendre ces plats indisponibles ou de les supprimer définitivement.

## Comportement retenu

- La sélection individuelle reste disponible sur chaque ligne.
- « Tout sélectionner » porte sur tous les résultats correspondant aux filtres/recherche actifs, y compris les pages non encore affichées.
- La sélection affiche un état partiel lorsque seule une partie des résultats est sélectionnée.
- « Rendre indisponibles » s’exécute immédiatement, car l’action est réversible.
- « Supprimer » ouvre une confirmation explicite indiquant le nombre de plats concernés.
- La suppression physique retire les documents `restaurants/{restaurantId}/menu_items/{itemId}` de Firestore.
- Les images Storage associées sont nettoyées après suppression du document, avec signalement des nettoyages échoués.

## Architecture

Le hook `useMenuCatalogQuery` reste responsable de la recherche, des filtres, de la pagination et de l’état de sélection.

Le service `FoodDeliveryService` expose une lecture de tous les plats correspondant à la requête active afin d’obtenir les IDs et les chemins Storage nécessaires. Les opérations Firestore sont exécutées par lots de 500 maximum : `update` pour l’indisponibilité et `delete` pour la suppression.

La page `MenuManagementClient` orchestre les actions, la confirmation, le rechargement du catalogue et les messages de résultat. Les composants de toolbar/table rendent les contrôles de sélection accessibles sur mobile et desktop.

## Gestion des erreurs

- Une action est bloquée si aucun plat n’est sélectionné.
- Le bouton d’action est désactivé pendant le traitement pour éviter les doubles soumissions.
- Une erreur globale affiche un message d’échec et conserve la sélection.
- Après une réussite, le catalogue est rechargé et la sélection est vidée.
- Le nettoyage Storage est best-effort : l’échec est signalé sans annuler la suppression Firestore déjà effectuée.

## Tests

- Sélection individuelle, désélection et sélection complète des résultats filtrés.
- État partiellement sélectionné.
- Mise en indisponibilité en masse avec les IDs sélectionnés.
- Confirmation obligatoire avant suppression en masse.
- Suppression Firestore en lots et nettoyage des images associés.
- Conservation de la sélection et message d’erreur en cas d’échec.
- Vérification des règles Firestore : seul le propriétaire du restaurant peut supprimer les plats.
