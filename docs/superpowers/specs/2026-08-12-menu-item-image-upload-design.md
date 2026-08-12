# Images des articles du menu — conception

## Objectif

Permettre au restaurateur d’associer une image à un article du menu en choisissant une seule source : une URL directe ou un fichier téléversé. Corriger en parallèle la superposition du popup d’édition par rapport à la navigation inférieure.

## Constat et causes

- Le popup d’édition et `BottomNav` utilisent tous les deux `z-50`. `BottomNav` est rendu après le popup, ce qui lui permet de le recouvrir dans la zone inférieure.
- `https://share.google/CryV7q5bfSB6c8Zln` répond par une page HTML Google et redirige vers une page de visualisation d’image. Ce n’est pas une URL d’image directe exploitable de manière fiable dans le champ actuel.
- Le projet possède déjà `image-compression.service.ts` et une intégration Firebase Storage réutilisable, mais le formulaire du menu ne les utilise pas.

## Expérience utilisateur

Le formulaire conserve le champ `URL directe de l’image` et ajoute un champ `Téléverser une image`. Les deux modes sont exclusifs :

- une URL non vide désactive le sélecteur de fichier;
- un fichier sélectionné désactive le champ URL;
- effacer la source active réactive l’autre mode;
- un tooltip discret explique que l’article ne peut avoir qu’une seule source d’image;
- les liens `share.google` sont refusés avec un message indiquant qu’un lien direct vers le fichier image est requis;
- le fichier sélectionné est prévisualisé et compressé en WebP avant le téléversement;
- pendant la compression ou l’envoi, le formulaire affiche un état occupé et empêche une double soumission;
- en modification, l’image existante reste affichée. La suppression de la source permet de sauvegarder l’article sans image.

Une image téléversée devient la valeur finale de `imageUrl`. Une URL directe reste stockée telle quelle si aucun fichier n’est sélectionné.

## Architecture et flux de données

1. `MenuManagementClient` maintient la source choisie (`url` ou `upload`) et le fichier local en attente.
2. À la sélection d’un fichier, le client valide le type, compresse l’image avec `imageCompressionService` en WebP et conserve le résultat pour l’aperçu et l’envoi.
3. Lors de la soumission, le fichier compressé est envoyé à Firebase Storage dans un chemin déterministe au niveau du restaurant et du propriétaire.
4. `getDownloadURL` fournit l’URL publique/accessible de l’image; cette URL est envoyée à `FoodDeliveryService.upsertMenuItem` dans `imageUrl`.
5. Sans fichier, l’URL directe validée est envoyée à `upsertMenuItem`.
6. Le popup utilise une couche z-index supérieure à `BottomNav`, avec une zone de contenu scrollable afin que les actions restent accessibles sur petit écran.

## Validation et sécurité

- Autoriser seulement les fichiers `image/*`, avec une limite avant compression et une limite Storage après compression.
- Utiliser le format WebP compressé pour réduire la taille stockée; conserver une solution de repli vers le fichier original si la compression échoue, tout en signalant l’erreur à l’utilisateur.
- Accepter uniquement les URLs `http` ou `https` et refuser au minimum les domaines de partage Google (`share.google`, `photos.google.com` si utilisé comme partage indirect).
- Ajouter une règle Storage dédiée aux images de menu : lecture nécessaire à l’affichage, écriture et suppression réservées à l’utilisateur authentifié propriétaire du restaurant, avec validation du type et de la taille.
- Ne pas modifier les anciennes valeurs `imageUrl` déjà enregistrées; les images externes existantes continuent d’être affichées lorsqu’elles sont valides.

## Tests

- Test unitaire de la validation URL : URL directe acceptée, URL non HTTP(S) et lien de partage refusés.
- Test unitaire de l’état exclusif du formulaire : URL désactive l’upload, fichier désactive l’URL, effacement réactive l’autre.
- Test du flux de soumission avec fichier : compression, upload Storage, récupération de l’URL et sauvegarde de l’article.
- Test d’erreur : échec de compression ou d’upload conserve le formulaire ouvert et affiche une erreur.
- Test de non-régression du formulaire d’édition et de la navigation.
- Vérification manuelle responsive du popup sur une hauteur mobile, y compris l’accès à `Annuler` et `Confirmer`.

## Hors périmètre

- Résoudre automatiquement les pages de partage Google vers leur image source.
- Migrer ou télécharger les images externes déjà enregistrées.
- Ajouter une bibliothèque de gestion d’images ou un recadrage avancé.
