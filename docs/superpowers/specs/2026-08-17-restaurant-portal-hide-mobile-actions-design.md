# Masquer les cartes d’action du portail restaurant sur mobile et tablette

## Objectif

Réduire la redondance du portail restaurant sur les petits écrans. Les cartes « Gérer le Menu » et « Commandes » du dashboard pointent vers les mêmes pages que les entrées « Menu » et « Commandes » de la navbar fixe mobile ; elles doivent donc être masquées sur mobile et tablette.

## Design

Le bloc contenant les deux cartes d’action dans `src/app/food/portal/[id]/PortalClient.tsx` restera inchangé fonctionnellement et sera rendu visible uniquement à partir du breakpoint Tailwind `lg` (≥ 1024 px). Il sera donc masqué pour les largeurs mobile et tablette, tandis que les statistiques, les commandes récentes, la sidebar et la navbar resteront inchangées.

La navigation et les destinations existantes ne seront pas modifiées : les cartes et les entrées de navbar continueront d’utiliser les mêmes chemins du portail restaurant.

## Tests et vérification

- Ajouter un test de rendu ciblé confirmant que les libellés des deux cartes restent présents dans le DOM pour préserver leur contenu desktop.
- Vérifier les classes responsive appliquées au bloc d’actions.
- Contrôler visuellement le dashboard à une largeur mobile/tablette et à une largeur desktop.
- Vérifier la console du navigateur après le changement.

## Hors périmètre

- Suppression ou modification des entrées de la navbar.
- Modification des routes, des droits d’accès ou de la logique de chargement du portail.
- Refonte des statistiques ou de la liste des commandes récentes.
