# Refonte UX de l’écran des commandes restaurant

## Objectif

Améliorer la lisibilité de l’écran `food/portal/orders` sur mobile, tablette et desktop sans changer les données, les statuts métier ou les actions disponibles au restaurant.

## Problèmes observés

- Les 16 statuts sont affichés comme une longue rangée de boutons, ce qui provoque un défilement horizontal difficile à comprendre.
- Les informations d’une commande sont présentées dans une grande carte monolithique.
- Le statut, le total et l’action attendue ne sont pas assez prioritaires.
- Les articles, le client et la livraison sont visuellement mélangés.

## Design retenu

### Filtres

Remplacer la liste de statuts exposés par cinq filtres métier compacts : `Toutes`, `À traiter`, `En préparation`, `En livraison` et `Terminées`. Les statuts précis restent disponibles dans un sélecteur secondaire `Statut précis`, avec une option `Tous les statuts`.

Les groupes ne changent pas le modèle de données : ils ne font que regrouper les statuts existants pour filtrer localement les commandes.

### Carte de commande

Chaque carte suit cette hiérarchie :

1. En-tête compact avec icône de statut, identifiant, date/heure, badge de statut et total.
2. Action métier principale dans une zone clairement séparée, pleine largeur sur mobile.
3. Contenu en sections nommées : `Articles`, `Client` et `Livraison`.
4. Informations de contact conservées sous les sections concernées.

Sur mobile et tablette, les sections s’empilent. À partir de `md`, les articles occupent la zone principale et les informations client/livraison une colonne latérale. Les boutons restent accessibles sans débordement horizontal.

### États et comportements

- Le filtrage par groupe et par statut précis est exclusif et local.
- Le filtre `Toutes` affiche toutes les commandes.
- Les actions de transition et de refus existantes restent inchangées.
- L’état vide utilise le libellé du filtre courant sans modifier le chargement ni les erreurs existantes.

## Périmètre technique

- Modifier `OrdersManagementClient.tsx` pour la structure et l’état des filtres.
- Étendre `orderStatusUi.ts` avec les groupes et leurs libellés.
- Ajouter les tests unitaires de regroupement et de filtrage UI.
- Ne pas modifier le service Firebase, le modèle `FoodOrder` ou la navigation.

## Validation

- Vérifier que chaque statut restaurant appartient à un groupe métier attendu.
- Vérifier que les filtres compacts ne nécessitent plus de défilement horizontal.
- Exécuter les tests ciblés, le lint et `git diff --check`.
