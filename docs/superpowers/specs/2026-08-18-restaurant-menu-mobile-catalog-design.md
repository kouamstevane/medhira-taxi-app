# Gestion du menu à grande échelle — design mobile-first

## Contexte

La page actuelle de gestion du menu est organisée autour de cartes groupées par catégorie. Elle charge des pages Firestore de 50 plats, mais la recherche et les filtres ne s'appliquent qu'aux éléments déjà présents dans l'état client. Avec 1 000 à 2 000 plats, le restaurateur doit parcourir une page longue, les catégories débordent horizontalement sur mobile et le compteur affiché ne représente que les éléments chargés.

## Objectif

Transformer la page en outil de gestion de catalogue utilisable sur mobile, puis adapté aux écrans plus larges. Le restaurateur doit pouvoir retrouver rapidement un plat, comprendre son statut et le modifier sans charger ni parcourir tout le catalogue.

## Principes UX

- Mobile-first : chaque commande importante reste accessible avec une main et des zones tactiles d'au moins 44 px.
- Densité utile : une ligne compacte par plat remplace les cartes hautes et répétitives.
- Recherche honnête : le résultat doit couvrir le catalogue, pas uniquement la page déjà chargée.
- Navigation prévisible : le total réel, la page courante et les filtres actifs sont visibles.
- Hiérarchie discrète : le thème sombre et l'accent orange de Medjira sont conservés ; la couleur sert principalement à l'action principale, au statut et au focus.
- Actions sûres : la disponibilité est modifiable directement ; la suppression demande une confirmation explicite.

## Structure visuelle

### Mobile

1. En-tête sticky compact : bouton retour, titre « Gestion du menu », total réel et bouton « + » pour créer un plat.
2. Menu d'actions secondaires `⋮` contenant « Importer un catalogue » et « Connecter une boutique ».
3. Champ de recherche pleine largeur avec recherche par nom, catégorie ou référence.
4. Résumé du catalogue : total de plats et nombre de plats disponibles.
5. Barre de filtres scrollable mais courte :
   - statut : « Tous », « Disponibles », « Indisponibles » ;
   - catégorie dans un sélecteur ;
   - tri dans un sélecteur.
6. Liste de plats : miniature optionnelle, nom, catégorie, prix, statut et menu d'actions.
7. Pagination explicite en bas : « 1–50 sur 1 842 », page précédente et page suivante.
8. Navigation basse existante conservée.

Les catégories ne sont plus affichées comme une rangée de boutons générée à partir du catalogue.

### Desktop et tablette

La même barre de recherche et les mêmes filtres sont conservés. La liste prend la forme d'un tableau dans une largeur maximale adaptée au portail :

| Sélection | Plat | Catégorie | Prix | Disponibilité | Actions |
| --- | --- | --- | --- | --- | --- |
| case | miniature, nom, description | catégorie | prix | badge ou interrupteur | menu |

Les actions d'import, de connexion de boutique et de création restent visibles dans l'en-tête. La sélection multiple est limitée aux éléments de la page courante afin de garder un comportement explicite.

## Comportements

### Recherche et filtres

- La saisie est temporisée afin de ne pas déclencher une requête à chaque caractère.
- Une recherche vide affiche tous les plats selon le tri sélectionné.
- La recherche, la catégorie, le statut, le tri et la page sont synchronisés avec les paramètres d'URL.
- Toute modification de recherche ou de filtre réinitialise la pagination au premier écran.
- Un indicateur indique le nombre de résultats et les filtres actifs peuvent être supprimés individuellement.
- La recherche et les filtres doivent être exécutés côté service/requête pour couvrir les plats non encore affichés.

### Actions sur un plat

- « Modifier » ouvre l'éditeur existant dans une présentation adaptée au mobile.
- La disponibilité peut être inversée depuis la ligne, avec état de chargement local et confirmation visuelle.
- « Supprimer » affiche une confirmation avant l'appel Firestore.
- Les actions de page sélectionnée peuvent rendre disponibles ou indisponibles plusieurs plats, sans affecter les autres pages.

### Pagination

- La taille par défaut est de 50 éléments.
- La pagination conserve le curseur Firestore et expose « précédent », « suivant » et le total réel.
- Les changements de filtre invalident le curseur courant.
- Le composant ne doit pas concaténer indéfiniment toutes les pages dans `menuItems`.

## Architecture et flux de données

Le composant de page conserve les états de présentation et délègue la construction des requêtes à `FoodDeliveryService`.

Le service devra fournir une page de catalogue avec au minimum :

- `items` ;
- `totalCount` ;
- `hasNextPage` ;
- `hasPreviousPage` ou un mécanisme de navigation arrière compatible avec le curseur ;
- curseur de page suivant ;
- paramètres de recherche, catégorie, statut et tri utilisés pour produire la page.

Le total devra être obtenu par une agrégation Firestore ou par une valeur maintenue côté backend. Il ne doit pas être déduit de `menuItems.length`.

La recherche textuelle doit reposer sur des champs indexables ou une capacité de recherche existante. Une simple recherche `Array.filter` sur les 50 éléments affichés n'est pas acceptable pour ce flux. Si le modèle de données ne permet pas une recherche partielle fiable, la première implémentation doit documenter la règle retenue, par exemple la recherche par préfixe normalisé, et afficher clairement le comportement à l'utilisateur.

Les paramètres d'URL permettent de conserver le contexte après retour depuis l'éditeur et facilitent le rechargement sans ambiguïté.

## États d'interface

- Chargement initial : skeleton de lignes, sans flash de contenu vide.
- Chargement d'une nouvelle page : état de progression dans le contrôle de pagination, liste précédente conservée.
- Catalogue vide : message explicatif et bouton « Ajouter un plat ».
- Aucun résultat : message indiquant que les filtres ou la recherche ne renvoient aucun plat, avec action « Réinitialiser ».
- Erreur de chargement : message court, conservation des critères saisis et bouton « Réessayer ».
- Erreur d'action : toast existant, sans retirer ou modifier optimistement la ligne si l'opération échoue.
- Suppression : confirmation avant suppression et retour de succès après nettoyage éventuel de l'image.

## Accessibilité et responsive

- Tous les boutons iconographiques ont un nom accessible et un état de focus visible.
- Les statuts ne dépendent pas uniquement de la couleur.
- La liste ne nécessite pas de défilement horizontal sur mobile.
- Les contrôles de filtre et de pagination sont utilisables au clavier sur desktop.
- Les animations respectent `prefers-reduced-motion`.
- La navigation basse garde un espace inférieur suffisant pour éviter de masquer la pagination ou les dernières lignes.

## Hors périmètre

- Refonte de l'éditeur complet d'un plat.
- Refonte du portail de commandes.
- Migration vers un moteur de recherche externe.
- Modification du parcours d'import CSV ou de connexion WooCommerce, hors déplacement de leurs boutons dans le menu d'actions.

## Vérification attendue

Les tests devront couvrir :

- le chargement initial avec total et pagination ;
- la réinitialisation du curseur après changement de recherche ou filtre ;
- l'affichage de l'état vide et de l'état sans résultat ;
- les actions de disponibilité, modification et suppression ;
- la persistance des paramètres d'URL ;
- l'absence de chargement de toutes les pages en mémoire ;
- le rendu mobile et desktop via vérification navigateur ou tests de composants adaptés.

## Critères d'acceptation

1. Sur mobile, un restaurateur peut atteindre un plat précis sans parcourir une liste de cartes par catégorie.
2. Le compteur affiché correspond au catalogue complet, pas uniquement aux éléments chargés.
3. Une recherche ou un filtre ne donne pas l'impression que les plats des pages suivantes n'existent pas.
4. L'écran reste utilisable avec 2 000 plats sans concaténer toutes les pages dans le DOM.
5. Les actions secondaires ne compressent pas le bouton de création sur petit écran.
6. La version desktop exploite l'espace disponible avec un tableau lisible.
7. Les erreurs et les résultats vides donnent une action de récupération claire.
