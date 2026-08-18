# Import de menus avec images — Design

## Objectif

Permettre à un restaurateur d'importer un grand catalogue sans renseigner manuellement les images, tout en retirant `preparationTime` du format d'import.

## Formats acceptés

- CSV simple : catalogue sans images.
- ZIP CSV : un fichier CSV accompagné d'un dossier d'images. La colonne `image` contient le nom relatif de l'image dans l'archive.
- XLSX : catalogue avec images intégrées au classeur. Une image est associée à la ligne de données sur laquelle son ancre supérieure gauche est positionnée, dans la colonne `image`.

Le fichier ZIP doit contenir exactement un fichier CSV de catalogue et peut contenir des images sous un dossier `images/`. Les chemins sont normalisés et les chemins absolus, `..`, les fichiers cachés de métadonnées et les extensions non image sont refusés.

## Colonnes

Colonnes obligatoires par ligne :

- `externalId` : identifiant stable et unique du plat ;
- `name` : nom du plat ;
- `price` : prix strictement positif.

Colonnes optionnelles :

- `description` ;
- `category` — valeur par défaut `Général` ;
- `isAvailable` — valeur par défaut `true` ;
- `image` — nom d'image dans un ZIP ; pour un XLSX, l'image est insérée/ancrée dans la cellule de la colonne `image`.

`preparationTime` n'est plus reconnu ni écrit lors d'un import.

## Flux de données

1. Le client accepte `.csv`, `.zip` et `.xlsx`, avec la limite existante de 15 Mo. Un CSV simple reste disponible pour les catalogues sans images ; le ZIP est utilisé dès qu'il faut joindre des images locales.
2. Le fichier est téléversé dans le chemin d'import du restaurant.
3. La fonction de prévisualisation détecte le format, extrait les lignes et collecte les images sans écrire de plat.
4. La revue affiche les lignes importables ; les références d'images manquantes ou invalides sont signalées comme erreurs.
5. Après confirmation, le worker relit l'archive, crée ou met à jour chaque plat et téléverse chaque image vers `restaurants/{restaurantId}/menu_items/{itemId}/image.{extension}`.
6. Firestore reçoit uniquement l'URL Firebase Storage de l'image ; aucun chemin local n'est conservé.

Les images sont facultatives. Une ligne sans image reste importable. Pour les mises à jour, une image fournie remplace l'ancienne URL ; une cellule image vide conserve l'image existante.

## Sécurité et limites

- Limiter le nombre d'entrées et la taille décompressée des ZIP pour éviter les ZIP bombs.
- Refuser les traversées de chemin et les extensions d'image non supportées (`jpg`, `jpeg`, `png`, `gif`, `webp`).
- Ne jamais utiliser un chemin local comme chemin de stockage.
- Vérifier la taille et le type MIME des images avant écriture.
- Pour XLSX, réutiliser la validation d'archive existante avant l'analyse ExcelJS.

## Gestion des erreurs

- CSV/ZIP sans catalogue, plusieurs CSV ou ZIP corrompu : erreur de prévisualisation globale.
- Image référencée mais absente de l'archive : ligne invalide avec le nom de l'image et le numéro de ligne.
- Plusieurs images ancrées sur une même ligne Excel : ligne invalide pour éviter une association ambiguë.
- Image Excel dans une autre colonne que `image` : ligne invalide ou image ignorée avec erreur explicite.
- Échec du téléversement d'une image : la ligne est comptée dans les erreurs du job ; les autres lignes continuent selon le comportement actuel.

## Tests et documentation

- Tests unitaires des parseurs CSV ZIP et XLSX avec images intégrées.
- Tests de sécurité des chemins ZIP et des limites d'archive.
- Tests du client pour les extensions et le template.
- Template/documentation mis à jour avec `image`, sans `preparationTime`.
