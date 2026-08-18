# Suppression de la carte des commandes récentes

## Objectif

Retirer du tableau de bord restaurateur la carte « Commandes Récentes », jugée inutile par l'utilisateur.

## Périmètre

- Supprimer uniquement le rendu de la carte dans `PortalClient`.
- Conserver la page dédiée aux commandes et les deux cartes d'actions desktop.
- Ne modifier ni les données Firestore, ni les requêtes, ni les statuts de commande.

## Vérification

- Ajouter une assertion au test de `PortalClient` confirmant que le titre « Commandes Récentes » n'est plus rendu.
- Exécuter le test ciblé, puis le contrôle TypeScript et le lint sur le fichier modifié.
