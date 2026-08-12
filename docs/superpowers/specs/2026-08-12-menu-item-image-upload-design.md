# Images des articles du menu — conception révisée

## Objectif

Permettre au restaurateur d’associer une image à un article du menu en choisissant une seule source : une URL directe ou un fichier téléversé. Permettre aussi de conserver, remplacer ou supprimer explicitement une image existante. Corriger en parallèle la superposition et l’accessibilité du popup d’édition.

## Constat et causes

- Le popup d’édition et `BottomNav` utilisent tous les deux `z-50`. `BottomNav` est rendu après le popup, ce qui lui permet de le recouvrir dans la zone inférieure.
- `https://share.google/CryV7q5bfSB6c8Zln` répond par une page HTML Google et redirige vers une page de visualisation d’image. Ce n’est pas une URL d’image directe exploitable de manière fiable dans le champ actuel.
- `MenuItem` ne conserve aujourd’hui que `imageUrl`; il manque le chemin Storage nécessaire pour supprimer proprement une image gérée par Firebase.
- `upsertMenuItem` génère l’identifiant Firestore à l’intérieur du service, trop tard pour construire un chemin Storage lié à l’article avant l’upload.
- Le formulaire envoie `imageUrl: undefined`; avec `setDoc(..., { merge: true })`, cela ne constitue pas une suppression explicite de l’ancien champ.
- `image-compression.service.ts` accepte actuellement tout type `image/*` et peut produire une image trop grande pour une carte de menu.

## Modèle d’état de l’image

Le formulaire utilisera une union explicite :

```ts
type MenuImageState = 'image-none' | 'image-unchanged' | 'external-url' | 'upload' | 'remove';
```

- `image-none` : état initial d’un nouvel article sans image; aucun champ image n’est envoyé à Firestore.
- `image-unchanged` : état initial de toute modification sans changement d’image, y compris lorsqu’un article existant n’a actuellement aucune image; aucun champ image n’est envoyé à Firestore.
- `external-url` : l’URL directe saisie remplace l’image actuelle; `imageStoragePath` est supprimé du document si nécessaire.
- `upload` : le fichier compressé remplace l’image actuelle; `imageUrl` et `imageStoragePath` sont remplacés.
- `remove` : suppression explicite; `deleteField()` est utilisé pour retirer `imageUrl` et `imageStoragePath`.

`remove` n’est disponible que lorsqu’une image existante est explicitement supprimée. Les transitions sont pilotées par l’interface, pas déduites uniquement de chaînes vides. Cela distingue donc clairement “aucune image lors de la création”, “aucune modification” et “supprimer une image existante”.

Le contrat de mise à jour du service exposera cette intention séparément des autres champs de l’article. Il ne construira jamais `imageUrl: undefined` pour représenter une suppression :

- `image-unchanged` omet entièrement les champs image;
- `image-none` omet entièrement les champs image lors de la création;
- `external-url` écrit l’URL et utilise `deleteField()` pour `imageStoragePath`;
- `upload` écrit l’URL et le chemin Storage;
- `remove` utilise `deleteField()` pour `imageUrl` et `imageStoragePath`.

## Expérience utilisateur

Le formulaire affiche un bloc `Source de l’image` avec un choix visible :

- `Conserver l’image actuelle` en modification lorsqu’une image existe;
- `Lien externe`;
- `Importer une image`;
- `Supprimer l’image` en modification lorsqu’une image existe.

Le choix `Lien externe` affiche l’URL directe. Le choix `Importer une image` affiche le sélecteur, l’aperçu, le nom du fichier et l’action `Remplacer`. Les modes non sélectionnés sont masqués ou désactivés, et un texte d’aide discret rappelle qu’une seule source est possible. Un tooltip n’est pas le seul moyen d’expliquer cette règle.

- Les liens `share.google` et autres liens de partage indirects sont refusés avec un message indiquant qu’un lien direct vers le fichier image est requis.
- Le fichier sélectionné est validé puis compressé immédiatement en WebP; l’échec de compression bloque l’enregistrement et n’envoie jamais le fichier original.
- L’import utilise `uploadBytesResumable()` et expose la progression, `Pause`, `Reprendre` et `Annuler l’import`. Une erreur définitive permet une nouvelle tentative depuis zéro avec le fichier compressé conservé en mémoire et un nouvel `uploadId`; une pause ou une reprise utilise la même tâche. La tâche n’est pas persistée après démontage ou rechargement de la page.
- Pendant compression ou upload, les actions de fermeture sont bloquées; l’utilisateur doit d’abord annuler l’import. Le bouton `Annuler l’import` annule la tâche, supprime tout objet temporaire déjà créé si nécessaire et réactive la fermeture.
- Le bouton final est nommé `Enregistrer`.

## Identifiants et flux Storage/Firestore

Le service exposera une fonction de génération d’identifiant d’article avant la soumission, basée sur `doc(menuCollection).id`. Le client obtient cet identifiant pour un nouvel article avant tout upload. Pour une modification, l’identifiant existant est réutilisé. Une fonction dédiée construira aussi le chemin Storage et une fonction dédiée supprimera un objet à partir de `imageStoragePath`; aucune suppression ne tentera de parser `imageUrl`.

Les uploads utilisent un identifiant aléatoire distinct par tentative :

```text
menu-images/{restaurantId}/{itemId}/{uploadId}.webp
```

Le document `MenuItem` ajoute :

```ts
imageStoragePath?: string;
```

Ce champ doit être ajouté dans `src/types/food-delivery.ts` (`MenuItem`) et `src/types/firestore-collections.ts` (`MenuItemSubCollection`). Les données retournées par `getRestaurantMenuFull`, lues par les composants de menu et écrites par `FoodDeliveryService.upsertMenuItem` doivent préserver ce champ. La validation Firestore et la liste des champs autorisés doivent également l’inclure.

Flux d’un upload :

1. Valider/comprimer le fichier; aucune écriture Storage n’a lieu si la compression échoue.
2. Générer `itemId` puis `uploadId`.
3. Téléverser le WebP avec `contentType: image/webp` et `cacheControl: public,max-age=31536000,immutable`.
4. Récupérer `imageUrl` avec `getDownloadURL()` puis appeler `upsertMenuItem` avec `imageUrl` et `imageStoragePath`.
5. Si l’upload échoue, si `getDownloadURL()` échoue ou si Firestore échoue, déclencher la suppression compensatoire du nouvel objet Storage et laisser le formulaire ouvert avec le fichier compressé pour permettre une reprise.
6. Si Firestore réussit et qu’une ancienne `imageStoragePath` gérée existe, la supprimer après la sauvegarde. Une erreur de suppression ne doit pas annuler l’article sauvegardé; elle doit être journalisée pour le nettoyage.
7. Si la suppression compensatoire du nouvel objet après un échec échoue, journaliser l’erreur avec `restaurantId`, `itemId`, `uploadId` et `imageStoragePath`.

Flux URL externe : sauvegarder `imageUrl`, supprimer `imageStoragePath` du document avec `deleteField()`, puis supprimer l’ancien fichier Storage après la réussite Firestore. Une erreur de suppression ne doit pas annuler la sauvegarde réussie et doit être journalisée.

Flux suppression : sauvegarder les autres champs avec `deleteField()` pour `imageUrl` et `imageStoragePath`, puis supprimer l’ancien fichier Storage après la réussite Firestore. Une erreur de suppression ne doit pas annuler la sauvegarde réussie et doit être journalisée.

Dans les trois flux de changement d’image — upload, URL externe et suppression — la suppression de l’ancien fichier est toujours postérieure à la réussite Firestore. Une suppression échouée ne provoque jamais de rollback de la sauvegarde Firestore.

Flux conservation : ne toucher à aucun champ image. Le service doit accepter une structure de mise à jour explicite plutôt que d’inférer une suppression depuis `undefined`.

Les chemins Storage et l’URL doivent être enregistrés ensemble pour ne jamais tenter de reconstruire un chemin depuis une URL Firebase. Un nettoyage périodique des objets `menu-images` non référencés devra être prévu comme tâche d’exploitation ultérieure; les erreurs de suppression seront journalisées avec `restaurantId`, `itemId` et le chemin concerné.

## Rendu des images et compatibilité Next.js

Les deux emplacements d’affichage — `src/components/food/MenuItemCard.tsx` côté public et `src/app/food/portal/[id]/menu/MenuManagementClient.tsx` côté administration — choisiront le rendu selon la source :

- une URL Firebase Storage identifiée par son domaine/format attendu utilisera `next/image`, avec `sizes="96px"`, afin de bénéficier de l’optimisation Next.js;
- une URL externe utilisera un `<img>` natif avec `loading="lazy"`, `decoding="async"`, dimensions explicites et gestion d’erreur; elle ne sera pas passée à `next/image` par défaut;
- aucun `remotePatterns` générique tel que `hostname: '**'` ne sera ajouté. Un domaine externe ne pourra utiliser `next/image` que s’il est explicitement autorisé et validé dans la configuration;
- le build mobile conserve `images.unoptimized: true` via `next.config.ts` lorsque `MOBILE_BUILD=true`; les tests couvriront ce mode et le rendu natif/optimisé attendu dans les deux emplacements.

Une URL externe valide syntaxiquement doit être chargée dans l’aperçu avant l’enregistrement. Si le navigateur ne peut pas décoder sa réponse comme image, l’aperçu passe en erreur et l’enregistrement est bloqué avec un message demandant une URL directe vers un fichier image. La vérification client ne remplace pas les validations de sécurité Firestore.

Le durcissement obligatoire de `https` pour les URLs externes est hors périmètre immédiat dans le contexte actuel de développement mono-utilisateur. La validation conserve les URLs `http` et `https` selon le comportement existant; une règle HTTPS stricte pourra être ajoutée avant la mise en production.

## Compression, taille et performances

Le service de compression doit appliquer les garde-fous suivants avant Canvas :

- liste blanche MIME : `image/jpeg`, `image/png`, `image/webp`;
- taille d’entrée maximale : 10 Mo;
- vérifier le MIME et la taille avant décodage, puis refuser l’image avant l’allocation du Canvas si son plus grand côté dépasse 6000 px ou si sa résolution dépasse 16 mégapixels;
- nettoyage de chaque `ObjectURL` dans tous les chemins de sortie;
- résultat strictement WebP; aucun fallback silencieux vers le fichier original;
- protection contre les sélections rapides : chaque sélection reçoit un identifiant de requête et un résultat obsolète est ignoré.

Le timeout de compression est configurable et remplace le délai fixe actuel de 5 secondes. La valeur par défaut doit être adaptée aux appareils mobiles et aux images jusqu’à 16 mégapixels; son expiration annule la compression, libère les ressources et affiche un message clair invitant à choisir une image plus légère ou à réessayer.

La compression WebP tentera au maximum trois niveaux de qualité prédéfinis, du plus élevé au plus compressé. Elle s’arrête dès que le résultat respecte la limite absolue de 500 Ko; si les trois tentatives restent au-dessus de 500 Ko, elle échoue avec un message clair et n’envoie aucun fichier original en fallback.

Tout `ObjectURL` d’aperçu ou de compression sera révoqué lors du remplacement du fichier, de la suppression de l’image, de l’annulation de l’import et au démontage du composant. Après suppression, la valeur du `<input type="file">` sera réinitialisée afin de permettre la sélection du même fichier.

Pour les images de menu, la cible est une largeur/hauteur maximale de 1200 px, un poids généralement compris entre 150 et 300 Ko et une limite dure de 500 Ko après compression. Une compression WebP bornée par plusieurs niveaux de qualité peut être utilisée; si la limite dure ne peut pas être respectée, l’enregistrement échoue avec un message clair.

Les images Firebase Storage seront servies via l’optimiseur `next/image` avec `sizes="96px"`; `next.config.ts` possède déjà le `remotePattern` Firebase nécessaire en mode web. Les URLs externes utiliseront le rendu natif décrit ci-dessus. Une miniature Storage dédiée reste hors périmètre immédiat.

## Validation et sécurité

### Firestore

Ajouter `imageStoragePath` à `MenuItem`, aux interfaces de données Firestore et à la liste des champs autorisés dans `firestore.rules`.

Dans `isValidMenuItem`, valider les champs optionnels lorsqu’ils existent :

- `imageUrl` est une chaîne d’au plus 2048 caractères, correspondant à `^https?://...`, et ne peut pas utiliser au minimum `share.google` ou `photos.google.com` comme domaine de partage;
- `imageStoragePath` est une chaîne d’au plus 512 caractères correspondant au chemin `menu-images/{restaurantId}/{itemId}/{uploadId}.webp`;
- lorsqu’un `imageStoragePath` existe, `imageUrl` doit être présent et être une URL Firebase de forme validée;
- lorsqu’aucun `imageStoragePath` n’existe, `imageUrl` peut être une URL externe HTTP(S) validée.

Les règles Firestore valident uniquement la forme et la longueur de `imageStoragePath`; elles ne tenteront pas de corréler exactement le chemin encodé avec l’URL Firebase et ses tokens. La protection réelle du chemin, du type, de la taille et du propriétaire est assurée par les règles Storage. Le service applicatif garantit la correspondance exacte entre `imageUrl` et `imageStoragePath` avant l’écriture Firestore. Les règles doivent conserver les contrôles existants de propriétaire et de champs autorisés. `deleteField()` doit être couvert par un test de règles pour les mises à jour d’articles existants.

### Storage

Ajouter une règle dédiée à `menu-images/{restaurantId}/{itemId}/{uploadId}.webp` :

- lecture pour tout utilisateur authentifié, alignée sur la règle Firestore actuelle de lecture des `menu_items`;
- `create` seulement si l’utilisateur authentifié est le propriétaire Firestore du restaurant, que le chemin est valide, que `contentType == 'image/webp'` et que la taille est inférieure ou égale à 500 Ko;
- `update` explicitement refusé, car chaque remplacement crée un nouvel `uploadId`;
- `delete` seulement pour le propriétaire du restaurant ou le mécanisme serveur de nettoyage autorisé.

Les tests Storage couvriront propriétaire, autre utilisateur, utilisateur non authentifié, mauvais type MIME et taille excessive. Le client vérifiera aussi que le fichier est réellement décodable comme image avant compression; cela rejette les fichiers dont le contenu ne correspond pas au type annoncé. Les règles Storage garantissent le type et la taille des métadonnées reçues, mais une validation complète des octets resterait une responsabilité d’un traitement serveur de confiance si elle devenait nécessaire. Les contrôles client ne sont jamais considérés comme une frontière de sécurité.

## Modal accessible et comportement mobile

Le popup passera au-dessus de `BottomNav` avec une couche `z-[60]`, mais le z-index seul ne sera pas considéré comme suffisant. Il devra fournir :

- `role="dialog"`, `aria-modal="true"` et `aria-labelledby`;
- focus initial dans le dialogue;
- focus trap sur `Tab` et `Shift+Tab`;
- restauration du focus sur le bouton ayant ouvert le popup à la fermeture;
- fermeture avec `Escape`;
- blocage et restauration du scroll du document arrière;
- hauteur et placement basés sur `100dvh`, avec respect de `safe-area-inset-bottom`;
- contenu interne scrollable et footer d’actions sticky;
- backdrop non fermant pendant compression/upload;
- confirmation en cas de fermeture avec modifications non sauvegardées.

Le bouton `Enregistrer` reste accessible au clavier et désactivé pendant les opérations asynchrones. Les états de compression/upload et les erreurs seront exposés avec un texte associé et, si nécessaire, `aria-live="polite"`.

## Tests

- Tests unitaires de la validation URL : URL directe HTTP(S) acceptée, URL non HTTP(S), lien de partage et URL trop longue refusés.
- Tests de la machine d’état : nouvel article sans image, conservation, URL externe, upload et suppression; vérifier que `image-none` et `image-unchanged` n’envoient aucun champ image et que `remove` utilise `deleteField()`.
- Test de génération anticipée de `itemId` et de chemin unique `uploadId`.
- Test du flux upload : compression WebP, upload Storage, `getDownloadURL()`, URL/chemin sauvegardés et suppression de l’ancien fichier après réussite Firestore.
- Tests de compensation : échec upload, échec `getDownloadURL()` et échec Firestore déclenchent le nettoyage du nouvel upload; si ce nettoyage échoue, l’erreur est journalisée avec `restaurantId`, `itemId`, `uploadId` et `imageStoragePath`; échec de suppression ancienne image ne fait pas échouer la sauvegarde.
- Tests d’erreurs : entrée trop volumineuse, MIME non autorisé, pixels excessifs, compression impossible, upload resumable mis en pause puis repris, upload annulé, nouvelle tentative depuis zéro après échec définitif, sélection rapide de deux fichiers.
- Tests de règles Firestore : propriétaire, champs autorisés, URL/chemin valides, suppression réelle de `imageUrl` et `imageStoragePath`, conservation d’une image existante.
- Tests de règles Storage : lecture authentifiée autorisée, lecture non authentifiée refusée, propriétaire autorisé à créer/supprimer, autre utilisateur refusé, mauvais type, taille excessive et update refusé.
- Tests du modal : `role`, focus initial, piège clavier, restauration du focus, `Escape`, verrouillage du scroll, fermeture bloquée pendant upload, confirmation des modifications et footer accessible sur mobile.
- Vérification de non-régression dans les deux écrans : URL Firebase via `next/image`, URL externe via `<img>`, erreur d’une URL valide mais non-image, article existant sans image, création sans image, changement URL → upload, changement upload → URL, resélection du même fichier après suppression, annulation d’un upload, comportement mobile avec `images.unoptimized: true` et optimisation/cache des images Firebase.

## Hors périmètre immédiat

- Résoudre automatiquement les pages de partage Google vers leur image source.
- Migrer ou télécharger les images externes déjà enregistrées.
- Générer une miniature Storage séparée ou un recadrage avancé.
- Déployer immédiatement une fonction planifiée de nettoyage; le contrat de chemin, la journalisation des suppressions échouées et les critères de détection des orphelins seront toutefois définis pour permettre cette évolution.
- Gérer les conflits entre utilisateurs, les conflits entre onglets et une stratégie multi-utilisateur avancée; le contexte actuel est un développement mono-utilisateur.
- Imposer le durcissement HTTPS en production avant la mise en production elle-même.
