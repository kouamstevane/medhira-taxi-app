# Images des articles du menu — plan d’implémentation

> **Pour les agents d’exécution :** utiliser la sous-skill obligatoire `superpowers:subagent-driven-development` (recommandée) ou `superpowers:executing-plans` pour exécuter ce plan tâche par tâche. Les étapes utilisent la syntaxe `- [ ]`.

**Objectif :** permettre au restaurateur de gérer l’image d’un article par URL directe ou upload WebP compressé, corriger l’affichage public/admin et rendre le modal accessible.

**Architecture :** un contrat d’image explicite sépare `image-none`, `image-unchanged`, `external-url`, `upload` et `remove`. Un composant partagé choisit `next/image` pour Firebase Storage et `<img>` natif pour les URLs externes. Un service Storage encapsule `uploadBytesResumable`, `getDownloadURL` et le nettoyage compensatoire; Firestore conserve `imageUrl` et `imageStoragePath`.

**Technologies :** Next.js 16, React 19, TypeScript strict, Firebase Firestore/Storage, Canvas WebP, Jest/RTL, Firebase Emulator Suite.

## Contraintes globales

- Entrée image : `10 * 1024 * 1024` octets maximum.
- Refuser avant Canvas si le plus grand côté dépasse 6000 px ou si la résolution dépasse 16 mégapixels.
- Sortie WebP, dimension maximale 1200 px, cible 150–300 Ko.
- Limite contractuelle : `500 * 1024` octets; définir la valeur en TypeScript/tests et la reproduire explicitement dans `storage.rules`.
- Trois tentatives de qualité WebP maximum; échec au-dessus de `500 * 1024`.
- Firebase Storage : `next/image` sans `unoptimized` sur web; `unoptimized` seulement dans le build mobile.
- URL externe : `<img>` natif, sans `remotePatterns` générique.
- Upload resumable avec progression, pause, reprise et annulation.
- Lecture Storage pour tout utilisateur authentifié; création/suppression réservées au propriétaire; update refusé.
- Toute fermeture du modal est bloquée pendant compression/upload; toute fermeture avec modifications non sauvegardées demande confirmation.
- Le code reste en anglais et l’interface en français.
- Préserver les modifications locales existantes.

## Carte des fichiers

- Créer `src/utils/menu-image.ts` : constantes, états, validation URL, détection Firebase et validation de chargement avec timeout.
- Créer `src/components/food/MenuItemImage.tsx` : rendu partagé, fallback et placeholder.
- Modifier `src/services/image-compression.service.ts` : limites, timeout, essais WebP et nettoyage ObjectURL.
- Créer `src/services/menu-image-storage.service.ts` : chemins, upload resumable, URL, suppression tolérante.
- Modifier `src/types/food-delivery.ts` et `src/types/firestore-collections.ts` : `imageStoragePath`.
- Modifier `src/services/food-delivery.service.ts` : payload image explicite et mise à jour disponibilité sans image.
- Modifier `MenuManagementClient.tsx` : formulaire image, upload, modal accessible et suppression `unoptimized` web.
- Modifier `MenuItemCard.tsx` : utiliser `MenuItemImage`.
- Modifier `firestore.rules` et `storage.rules`.
- Ajouter tests unitaires sous `src/utils/__tests__`, `src/services/__tests__`, `src/components/food/__tests__`, `src/hooks/__tests__` et compléter le test menu existant.
- Modifier `tests/firestore/food-restoration.rules.test.ts` et `tests/storage.rules.test.ts`.

---

### Tâche 1 : Contrat d’image et types

**Fichiers :**
- Créer `src/utils/menu-image.ts`
- Modifier `src/types/food-delivery.ts`
- Modifier `src/types/firestore-collections.ts`
- Créer `src/utils/__tests__/menu-image.test.ts`

**Interfaces :**
- `MenuImageState = image-none | image-unchanged | external-url | upload | remove`.
- `MENU_IMAGE_MAX_BYTES = 500 * 1024`.
- `MENU_IMAGE_MAX_INPUT_BYTES = 10 * 1024 * 1024`.
- `MENU_IMAGE_MAX_DIMENSION = 6000`.
- `MENU_IMAGE_MAX_PIXELS = 16_000_000`.
- `MENU_IMAGE_MAX_OUTPUT_DIMENSION = 1200`.
- `isKnownShareUrl(value): boolean`.
- `validateMenuImageUrl(value): résultat valid/invalid avec message`.
- `isFirebaseStorageImageUrl(value): boolean`.
- `validateExternalImageLoad(url, options): Promise<void>`, annulable et avec timeout.

- [ ] Écrire d’abord les tests rouges pour les constantes, les cinq états, les URLs Firebase, HTTP/HTTPS, `share.google`, `photos.google.com`, URL trop longue, timeout et annulation.
- [ ] Lancer `npx jest src/utils/__tests__/menu-image.test.ts --runInBand`. Attendu : échec car le module n’existe pas.
- [ ] Implémenter les exports sans dépendance React.
- [ ] Relancer le test ciblé puis `npm run typecheck`. Attendu : PASS.
- [ ] Commit : `git add src/utils/menu-image.ts src/utils/__tests__/menu-image.test.ts src/types/food-delivery.ts src/types/firestore-collections.ts && git commit -m "feat: define menu image contract"`.

### Tâche 2 : Compression WebP

**Fichiers :**
- Modifier `src/services/image-compression.service.ts`
- Créer `src/services/__tests__/image-compression.service.test.ts`

**Contrat :** `CompressionOptions` ajoute `timeoutMs`, `maxOutputBytes`, `qualityAttempts`, `maxWidth` et `maxHeight`. La valeur par défaut de `maxOutputBytes` est `500 * 1024`; `qualityAttempts` est limité à trois.

- [ ] Tester en rouge MIME non autorisé, entrée >10 Mo, côté >6000 px, >16 MP, timeout configurable, trois qualités et sortie >500 * 1024.
- [ ] Lancer `npx jest src/services/__tests__/image-compression.service.test.ts --runInBand`. Attendu : échec sur les nouveaux comportements.
- [ ] Implémenter la validation avant décodage/Canvas, les essais WebP du plus élevé au plus compressé et l’échec sans fallback vers l’original.
- [ ] Révoquer chaque ObjectURL dans les succès, erreurs, timeout, remplacement, suppression et démontage; ignorer les résultats obsolètes d’une sélection précédente.
- [ ] Relancer le test ciblé, puis `npm run typecheck`.
- [ ] Commit : `git add src/services/image-compression.service.ts src/services/__tests__/image-compression.service.test.ts && git commit -m "feat: harden menu image compression"`.

### Tâche 3 : Service Storage resumable

**Fichiers :**
- Créer `src/services/menu-image-storage.service.ts`
- Créer `src/services/__tests__/menu-image-storage.service.test.ts`

**Interfaces :**
- `createMenuItemId(restaurantId): string`.
- `createMenuImagePath(restaurantId, itemId, uploadId): string`.
- `uploadMenuImage(input): tâche resumable, chemin et uploadId`.
- `getMenuImageDownloadUrl(path): Promise<string>`.
- `deleteMenuImage(path): Promise<void>`.
- `isStorageObjectNotFound(error): boolean`.

- [ ] Tester en rouge le chemin `menu-images/restaurant/item/upload.webp`, metadata `contentType: image/webp) et `cacheControl: public,max-age=31536000,immutable`.
- [ ] Tester progression, pause, reprise, annulation, getDownloadURL et suppression.
- [ ] Implémenter avec `getFirebaseStorage`, `ref` et `uploadBytesResumable`.
- [ ] Supprimer uniquement si l’objet a été créé; après cancel ou cleanup, ignorer `storage/object-not-found`; journaliser les autres erreurs avec `restaurantId`, `itemId`, `uploadId` et `imageStoragePath`.
- [ ] Relancer `npx jest src/services/__tests__/menu-image-storage.service.test.ts --runInBand`.
- [ ] Commit : `git add src/services/menu-image-storage.service.ts src/services/__tests__/menu-image-storage.service.test.ts && git commit -m "feat: add resumable menu image storage"`.

### Tâche 4 : Contrat Firestore et disponibilité

**Fichiers :**
- Modifier `src/services/food-delivery.service.ts`
- Créer `src/services/__tests__/menu-item-image-updates.test.ts`
- Modifier `src/app/food/portal/[id]/menu/__tests__/MenuManagementClient.test.tsx`

**Interfaces :**
- `MenuImageUpdate` est une union discriminée : `image-none/image-unchanged`, `external-url` avec `imageUrl`, `upload` avec `imageUrl/imageStoragePath`, `remove` sans URL.
- `upsertMenuItem(restaurantId, itemData, imageUpdate?): Promise<string>`.
- `updateMenuItemAvailability(restaurantId, itemId, isAvailable): Promise<void>`.
- `createMenuItemId(restaurantId): string`.

- [ ] Tester en rouge que `image-none` et `image-unchanged` omettent les champs image; `external-url` utilise `deleteField` sur `imageStoragePath`; `upload` écrit URL/path; `remove` utilise `deleteField` sur URL/path.
- [ ] Tester que `updateMenuItemAvailability` n’accepte et ne transmet aucune propriété image.
- [ ] Implémenter sans `imageUrl: undefined`; utiliser `deleteField` uniquement pour `external-url/remove`.
- [ ] Adapter `toggleAvailability` pour appeler `updateMenuItemAvailability(restaurantId, item.id, !item.isAvailable)`, jamais `upsertMenuItem` avec l’article complet.
- [ ] Relancer les tests services et le test menu existant.
- [ ] Commit : `git add src/services/food-delivery.service.ts src/services/__tests__/menu-item-image-updates.test.ts src/app/food/portal/[id]/menu/__tests__/MenuManagementClient.test.tsx && git commit -m "feat: separate menu availability updates"`.

### Tâche 5 : Composant partagé d’image

**Fichiers :**
- Créer `src/components/food/MenuItemImage.tsx`
- Créer `src/components/food/__tests__/MenuItemImage.test.tsx`
- Modifier `src/components/food/MenuItemCard.tsx`
- Modifier `src/app/food/portal/[id]/menu/MenuManagementClient.tsx`

**Interface :** `MenuItemImageProps` contient `src?`, `alt`, `className?`, `sizes?`, `width?`, `height?` et `fill?`.

- [ ] Tester Firebase Storage vers `next/image` sans `unoptimized` sur web.
- [ ] Tester URL externe vers `img` avec `loading="lazy"` et `decoding="async"`.
- [ ] Tester URL absente et `onError` vers placeholder/icône, sans erreur React.
- [ ] Implémenter la détection via `src/utils/menu-image.ts` et centraliser le fallback.
- [ ] Remplacer les deux implémentations locales dans `MenuItemCard.tsx` et `MenuManagementClient.tsx`.
- [ ] Supprimer `unoptimized` de l’image Firebase dans l’administration; le build mobile reste gouverné par `next.config.ts`.
- [ ] Relancer `npx jest src/components/food/__tests__/MenuItemImage.test.tsx --runInBand`.
- [ ] Commit : `git add src/components/food/MenuItemImage.tsx src/components/food/__tests__/MenuItemImage.test.tsx src/components/food/MenuItemCard.tsx src/app/food/portal/[id]/menu/MenuManagementClient.tsx && git commit -m "feat: centralize menu image rendering"`.

### Tâche 6 : Formulaire et modal accessible

**Fichiers :**
- Modifier `src/app/food/portal/[id]/menu/MenuManagementClient.tsx`
- Modifier `src/app/food/portal/[id]/menu/__tests__/MenuManagementClient.test.tsx`
- Créer `src/hooks/useMenuImageUrlValidation.ts`
- Créer `src/hooks/__tests__/useMenuImageUrlValidation.test.ts`

- [ ] Tester en rouge création `image-none`, modification `image-unchanged` avec et sans image, `remove`, changement URL vers upload, upload vers URL, URL externe non-image, URL lente annulée/expirée, sélection rapide et même fichier resélectionné après suppression.
- [ ] Implémenter le hook de validation URL avec timeout configurable, annulation de l’ancien chargement et ignore des résultats obsolètes.
- [ ] Ajouter le choix visible Conserver, Lien externe, Importer, Supprimer; afficher le tooltip secondaire sans en faire l’unique explication.
- [ ] Compresser à la sélection; conserver le WebP compressé en mémoire; afficher aperçu, progression, Pause, Reprendre et Annuler l’import.
- [ ] À l’upload, générer itemId/uploadId, appeler getDownloadURL, puis Firestore; compenser sur échec upload/getDownloadURL/Firestore seulement si l’objet existe. Ignorer object-not-found; journaliser les autres échecs.
- [ ] Après réussite Firestore, supprimer l’ancienne image pour upload, URL externe et remove; une erreur de suppression ne fait pas échouer la sauvegarde.
- [ ] Ajouter fallback des anciennes URLs invalides via MenuItemImage.
- [ ] Rendre le modal `z-[60]`, `role="dialog"`, `aria-modal`, focus initial/trap/restauration, Escape, verrouillage scroll, `100dvh`, safe-area, zone scrollable, footer sticky, confirmation dirty et fermeture bloquée pendant compression/upload.
- [ ] Renommer Confirmer en Enregistrer.
- [ ] Relancer les tests hook/menu puis `npm run typecheck`.
- [ ] Commit : `git add src/app/food/portal/[id]/menu/MenuManagementClient.tsx src/app/food/portal/[id]/menu/__tests__/MenuManagementClient.test.tsx src/hooks/useMenuImageUrlValidation.ts src/hooks/__tests__/useMenuImageUrlValidation.test.ts && git commit -m "feat: add accessible menu image editor"`.

### Tâche 7 : Règles Firestore

**Fichiers :**
- Modifier `firestore.rules`
- Modifier `tests/firestore/food-restoration.rules.test.ts`

- [ ] Écrire les tests rouges pour `imageStoragePath` valide/invalide, `imageUrl` forme valide/invalide, `deleteField`, article existant sans image, `image-unchanged` et availability-only.
- [ ] Lancer `firebase emulators:exec "npx jest --config jest.firestore.config.js tests/firestore/food-restoration.rules.test.ts --runInBand"`. Attendu : échec.
- [ ] Ajouter `imageStoragePath` à `hasOnly` et valider types, longueurs et forme sans corréler URL/path dans les règles Firestore.
- [ ] Vérifier que les mises à jour partielles de disponibilité restent autorisées et ne retransmettent pas l’image.
- [ ] Relancer la commande émulateur.
- [ ] Commit : `git add firestore.rules tests/firestore/food-restoration.rules.test.ts && git commit -m "test: enforce menu image firestore rules"`.

### Tâche 8 : Règles Storage

**Fichiers :**
- Modifier `storage.rules`
- Modifier `tests/storage.rules.test.ts`

- [ ] Écrire les tests rouges : seed restaurant, create propriétaire WebP à `500 * 1024`, create au-dessus de la limite, mauvais MIME, lecture authentifiée autre utilisateur, lecture anonyme refusée, update refusé, delete propriétaire et delete autre utilisateur refusé.
- [ ] Implémenter `match /menu-images/{restaurantId}/{itemId}/{uploadId}.webp` avec lookup propriétaire, create/delete séparés et update explicitement refusé.
- [ ] Reproduire littéralement `500 * 1024` dans `storage.rules` et vérifier cette valeur dans les tests TypeScript.
- [ ] Relancer `firebase emulators:exec "npx jest --config jest.firestore.config.js tests/storage.rules.test.ts --runInBand"`.
- [ ] Commit : `git add storage.rules tests/storage.rules.test.ts && git commit -m "feat: secure menu image storage rules"`.

### Tâche 9 : Vérification intégrée

**Fichiers :** aucun nouveau fichier de production.

- [ ] Lancer les tests unitaires ciblés :
  `npx jest src/utils/__tests__/menu-image.test.ts src/services/__tests__/image-compression.service.test.ts src/services/__tests__/menu-image-storage.service.test.ts src/services/__tests__/menu-item-image-updates.test.ts src/components/food/__tests__/MenuItemImage.test.tsx src/hooks/__tests__/useMenuImageUrlValidation.test.ts src/app/food/portal/[id]/menu/__tests__/MenuManagementClient.test.tsx --runInBand`.
- [ ] Lancer les règles :
  `firebase emulators:exec "npx jest --config jest.firestore.config.js tests/firestore/food-restoration.rules.test.ts tests/storage.rules.test.ts --runInBand"`.
- [ ] Lancer `npm run typecheck` et ESLint ciblé sur les fichiers modifiés.
- [ ] Vérifier manuellement web : Firebase `next/image` optimisé sans `unoptimized`, externe `<img>`, fallback cassé et popup au-dessus de BottomNav.
- [ ] Vérifier le build mobile : `images.unoptimized: true`.
- [ ] Exécuter `git diff --check` et `git status --short`; ne pas inclure les modifications locales préexistantes dans les commits.

## Critères d’acceptation

- `share.google` et les domaines de partage connus sont refusés.
- Création sans image utilise `image-none`.
- Modification sans changement utilise `image-unchanged`, même sans image actuelle.
- `remove` supprime réellement `imageUrl` et `imageStoragePath` avec `deleteField`.
- Upload respecte 10 Mo, 16 MP, 6000 px, 1200 px et `500 * 1024` octets.
- Upload resumable supporte progression, pause, reprise et annulation.
- Échec upload/getDownloadURL/Firestore déclenche une compensation conditionnelle; `object-not-found` est toléré; les autres erreurs de cleanup sont journalisées.
- L’ancienne image est supprimée uniquement après Firestore et une suppression échouée ne casse pas la sauvegarde.
- Public et administration utilisent `MenuItemImage` : Firebase via `next/image` web, externe via `<img>`, fallback sans erreur React.
- `toggleAvailability` ne modifie aucune propriété image.
- Les règles Firestore et Storage reproduisent exactement le contrat.
- Le modal est accessible, scrollable et au-dessus de BottomNav.
