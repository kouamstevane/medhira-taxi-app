# Gestion des visuels du restaurant

## Objectif

Permettre au restaurateur de choisir et de modifier les deux visuels attendus sur les plateformes de livraison canadiennes : un logo carré et une photo de couverture horizontale. Le parcours doit fonctionner pendant l’inscription et après la création du restaurant, sans casser les restaurants existants qui possèdent déjà `imageUrl` ou `coverImageUrl`.

## Décision

Le modèle retenu est :

- `logoUrl` : logo carré de l’établissement ;
- `coverImageUrl` : photo de couverture utilisée sur les cartes et la page restaurant ;
- `imageUrl` : champ historique conservé comme solution de repli pour les données existantes.

Les photos des plats restent gérées par le catalogue du menu et ne sont pas incluses dans ce changement.

## Parcours utilisateur

### Création et resoumission

L’étape « Votre restaurant » présente deux zones de téléversement indépendantes : « Logo du restaurant » et « Photo de couverture ». Chaque zone permet de sélectionner un fichier, de voir un aperçu, de remplacer le fichier ou de le supprimer. Les fichiers sélectionnés restent en mémoire pendant le wizard ; les valeurs déjà enregistrées sont restaurées depuis le brouillon ou le restaurant rejeté.

Le restaurant est créé ou resoumis avec les informations textuelles, puis les fichiers sélectionnés sont téléversés dans son espace Storage avant la navigation vers la page d’attente. Le bouton reste en chargement pendant toutes les opérations. Si le téléversement échoue après la création, l’erreur indique que le restaurant a été soumis mais que le visuel doit être réessayé depuis les réglages ; aucune URL partielle ne doit être enregistrée.

### Réglages après création

La page de réglages ajoute une section « Identité visuelle » au-dessus des horaires. Elle charge les deux visuels existants, affiche les mêmes aperçus et permet d’enregistrer le logo et la couverture séparément ou ensemble. Le bouton d’enregistrement est désactivé lorsqu’aucun visuel n’a changé. Une erreur de téléversement ou de sauvegarde conserve les visuels précédents et affiche un message réessayable.

### Affichage client et portail

- La carte restaurant et l’en-tête de la page restaurant utilisent `coverImageUrl`, puis `imageUrl` comme fallback historique.
- Le logo est affiché dans le portail restaurant et dans la fiche restaurant lorsque `logoUrl` est disponible.
- En l’absence de couverture, le placeholder restaurant actuel reste visible.
- En l’absence de logo, l’icône restaurant actuelle reste visible.

## Validation des fichiers

Les formats acceptés sont JPEG, PNG et WebP. Les fichiers sont redimensionnés côté client et convertis en WebP avant l’envoi. Le logo est recadré en carré ; la couverture est recadrée en ratio 16:9. La taille finale est limitée à 2 Mo par fichier, avec un message d’erreur en français lorsque le fichier est invalide ou trop volumineux.

Les aperçus utilisent une URL locale révoquée après remplacement ou démontage afin d’éviter les fuites mémoire. Les fichiers ne sont jamais sérialisés dans `draftRestaurant` ; seuls les URLs déjà enregistrées le sont.

## Architecture et flux de données

Un service dédié aux visuels du restaurant encapsule la génération des chemins, la conversion WebP, l’upload, la récupération de l’URL et la suppression tolérante. Les fichiers sont stockés sous :

```text
restaurant-images/{restaurantId}/logo-{uploadId}.webp
restaurant-images/{restaurantId}/cover-{uploadId}.webp
```

Le document Firestore conserve les URLs publiques dans `logoUrl` et `coverImageUrl`. Les uploads utilisent d’abord l’identité du propriétaire et l’existence du document restaurant comme garde-fous Storage. Chaque upload utilise un nom versionné ; le service met à jour Firestore uniquement après un upload réussi, supprime les nouveaux objets si la sauvegarde échoue et supprime l’ancien objet seulement après la confirmation de la nouvelle URL.

Le schéma de candidature Cloud Function accepte `logoUrl` en plus des champs visuels déjà présents. Les règles Firestore autorisent `logoUrl` dans les mises à jour limitées du propriétaire et conservent les restrictions existantes sur le statut, la commission, Stripe et le propriétaire. Les règles Storage autorisent uniquement le propriétaire du restaurant à créer ou supprimer les fichiers `logo-{uploadId}.webp` et `cover-{uploadId}.webp`; la lecture reste publique pour permettre l’affichage côté client.

## Gestion des erreurs et compatibilité

- Une image supprimée retire son URL du document sans modifier les autres champs du restaurant.
- Une ancienne valeur `imageUrl` continue de s’afficher si aucune couverture moderne n’est enregistrée.
- Une URL existante est conservée si un nouvel upload échoue.
- Le formulaire reste utilisable sans image : les placeholders actuels sont le comportement par défaut.
- Les erreurs Storage sont traduites en messages distincts pour session expirée, droits insuffisants, fichier invalide et erreur réseau.

## Tests

Les tests couvriront :

- validation et conversion des images dans le service dédié ;
- sélection, aperçu, remplacement, suppression et erreurs dans l’étape de création ;
- chargement des visuels, état dirty, sauvegarde réussie et échec dans les réglages ;
- fallback `coverImageUrl` puis `imageUrl` dans la carte et la page restaurant ;
- règles Storage pour propriétaire, autre utilisateur et utilisateur non authentifié ;
- règles Firestore pour l’ajout et la modification de `logoUrl`/`coverImageUrl` sans possibilité de modifier les champs protégés ;
- parcours navigateur : ajouter les deux images lors de la création, puis remplacer la couverture depuis les réglages.

## Hors périmètre

La galerie de plusieurs photos, la modération manuelle, l’édition avancée type DoorDash, l’import depuis Instagram et la gestion des photos de plats ne font pas partie de cette livraison.
