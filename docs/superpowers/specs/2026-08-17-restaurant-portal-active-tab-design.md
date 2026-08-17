# Onglet actif du portail restaurant

## Objectif

Afficher correctement l’onglet actif dans la barre de navigation basse du portail restaurant lorsque les liens contiennent le paramètre `restaurantId`.

## Cause

Les éléments de navigation utilisent des URLs telles que `/food/portal?restaurantId=restaurant-1`, tandis que `usePathname()` fournit uniquement `/food/portal`. La comparaison actuelle inclut donc une query string d’un côté seulement et aucun onglet ne peut être reconnu comme actif.

## Design retenu

Modifier uniquement le calcul de l’état actif dans `src/components/ui/BottomNav.tsx` : extraire le pathname de chaque `href`, puis le comparer au pathname courant. Les URLs complètes et le passage de `restaurantId` restent inchangés.

La comparaison continuera à reconnaître les sous-chemins avec la règle existante : un élément est actif si le pathname courant est égal à son pathname ou commence par ce pathname suivi d’un `/`.

## Tests

Ajouter un test de régression ciblé sur `BottomNav` qui vérifie :

- `/food/portal?restaurantId=restaurant-1` active `Dashboard` ;
- `/food/portal/orders?restaurantId=restaurant-1` active `Commandes` ;
- les autres onglets restent inactifs dans chacun de ces cas.

La validation finale comprendra le test ciblé, la suite de tests pertinente et une vérification navigateur sur le portail restaurant.

## Hors périmètre

- aucun changement de style ;
- aucun changement de route ou de query params ;
- aucune modification de logique métier ou d’authentification.
