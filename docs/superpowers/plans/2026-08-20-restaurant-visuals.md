# Restaurant Visuals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre aux restaurateurs d’ajouter et de modifier un logo carré et une photo de couverture pendant l’inscription et depuis les réglages, avec stockage Firebase sécurisé et fallback compatible avec `imageUrl`.

**Architecture:** Ajouter un service dédié aux assets visuels qui valide et convertit les fichiers en WebP, puis les stocke sous `restaurant-images/{restaurantId}/{logo|cover}-{uploadId}.webp`. Les composants d’inscription et de réglages partagent les mêmes contrôles de sélection et d’aperçu, tandis que les vues clientes utilisent `coverImageUrl`, puis `imageUrl` comme fallback historique.

**Tech Stack:** Next.js 16 App Router, React client components, TypeScript strict, Firebase Storage, Firestore, Jest, React Testing Library, Firebase Rules Unit Testing, Playwright.

## Global Constraints

- Code et commentaires en anglais ; textes UI en français.
- Aucun commentaire de code ajouté sauf nécessité explicite.
- Les formats acceptés sont JPEG, PNG et WebP.
- Chaque asset final est converti en WebP, recadré selon son type et limité à 2 Mo.
- Les fichiers ne sont jamais sérialisés dans `draftRestaurant`; seules les URLs enregistrées sont persistées.
- Les restaurants existants continuent d’utiliser `imageUrl` si `coverImageUrl` est absent.
- Chaque tâche suit RED → vérification de l’échec → GREEN → vérification du succès → commit.

## File Map

### New files

- `src/utils/restaurant-image.ts` — types, constantes et validation/préparation d’assets côté client.
- `src/utils/__tests__/restaurant-image.test.ts` — tests unitaires de validation et de chemins.
- `src/services/restaurant-image-storage.service.ts` — upload, URL, suppression et traduction des erreurs Storage.
- `src/services/__tests__/restaurant-image-storage.service.test.ts` — tests du service Storage.
- `src/components/restaurant/RestaurantImagePicker.tsx` — contrôle partagé logo/couverture, aperçu et suppression.
- `src/components/restaurant/__tests__/RestaurantImagePicker.test.tsx` — tests d’interaction du picker.
- `tests/firestore/restaurant-visuals.rules.test.ts` — règles Firestore des champs visuels.

### Existing files to modify

- `src/types/food-delivery.ts` and `src/types/firestore-collections.ts` — add `logoUrl`.
- `src/types/user.ts` — allow `logoUrl` in saved restaurant draft data.
- `functions/src/validators/schemas.ts` — accept `logoUrl` in restaurant applications.
- `src/hooks/useRestaurantRegistration.ts` — retain selected files in memory and upload them after restaurant submission.
- `src/app/restaurant/register/page.tsx` — pass image selections through the wizard.
- `src/app/restaurant/register/components/Step3Restaurant.tsx` — render two image pickers.
- `src/services/food-delivery.service.ts` — add the owner-scoped visual field update method.
- `src/app/food/portal/[id]/settings/RestaurantSettingsClient.tsx` — add the visual settings section.
- `src/app/food/portal/[id]/settings/__tests__/RestaurantSettingsClient.test.tsx` — cover visual loading and saving.
- `src/components/food/RestaurantCard.tsx` — prefer cover image and show logo when present.
- `src/components/food/__tests__/RestaurantCard.test.tsx` — cover fallback and logo rendering.
- `src/app/food/restaurant/[id]/RestaurantClient.tsx` — use cover for hero and logo in the detail card.
- `src/app/food/portal/[id]/RestaurantPortalHeader.tsx` — display the restaurant logo when available.
- `firestore.rules` — allow `logoUrl` in the owner’s permitted restaurant update keys and validate URL length.
- `storage.rules` — add owner-only read/write/delete rules for restaurant logo and cover assets.
- `tests/storage.rules.test.ts` — cover restaurant asset access and size/content-type restrictions.
- `functions/src/restaurant/__tests__/submitRestaurantApplication.test.ts` — cover the new optional application field.

---

### Task 1: Define image asset contracts and validation

**Files:**
- Create: `src/utils/restaurant-image.ts`
- Test: `src/utils/__tests__/restaurant-image.test.ts`

**Interfaces:**
- Produces `RestaurantImageKind = 'logo' | 'cover'`.
- Produces `RestaurantImageSelection = { logo: File | null; cover: File | null }`.
- Produces `validateRestaurantImageFile(file, kind): string | null`.
- Produces `getRestaurantImagePath(restaurantId, kind, uploadId): string`.
- Produces `getRestaurantImagePathFromUrl(url): string | null`.
- Produces `prepareRestaurantImage(file, kind): Promise<Blob>`.

- [ ] **Step 1: Write the failing tests**

```ts
it('accepts image MIME types and rejects non-images', () => {
  expect(validateRestaurantImageFile(new File(['x'], 'logo.png', { type: 'image/png' }), 'logo')).toBeNull();
  expect(validateRestaurantImageFile(new File(['x'], 'logo.pdf', { type: 'application/pdf' }), 'logo')).toContain('format');
});

it('builds stable logo and cover Storage paths', () => {
  expect(getRestaurantImagePath('rest-1', 'logo', 'up-1')).toBe('restaurant-images/rest-1/logo-up-1.webp');
  expect(getRestaurantImagePath('rest-1', 'cover', 'up-1')).toBe('restaurant-images/rest-1/cover-up-1.webp');
});

it('rejects an asset larger than 2 MiB', () => {
  const file = new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'cover.webp', { type: 'image/webp' });
  expect(validateRestaurantImageFile(file, 'cover')).toContain('2 Mo');
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npm test -- --runInBand src/utils/__tests__/restaurant-image.test.ts`

Expected: FAIL because the utility module and its exports do not exist.

- [ ] **Step 3: Implement the minimal utility**

Use the browser `Image` and `canvas.toBlob()` APIs in `prepareRestaurantImage`. Use a 1:1 crop for `logo` and a 16:9 crop for `cover`; reject a null blob with the French upload error. Keep MIME/type validation and the 2 MiB final-size check in one exported utility so the picker and service use the same contract.

- [ ] **Step 4: Run the focused test and confirm GREEN**

Run: `npm test -- --runInBand src/utils/__tests__/restaurant-image.test.ts`

Expected: PASS with all image validation and path tests green.

- [ ] **Step 5: Commit**

```bash
git add src/utils/restaurant-image.ts src/utils/__tests__/restaurant-image.test.ts
git commit -m "feat: add restaurant image asset contracts"
```

### Task 2: Add data contracts and Firebase security rules

**Files:**
- Modify: `src/types/food-delivery.ts`
- Modify: `src/types/firestore-collections.ts`
- Modify: `src/types/user.ts`
- Modify: `functions/src/validators/schemas.ts`
- Modify: `firestore.rules`
- Modify: `storage.rules`
- Test: `tests/firestore/restaurant-visuals.rules.test.ts`
- Test: `tests/storage.rules.test.ts`
- Test: `functions/src/restaurant/__tests__/submitRestaurantApplication.test.ts`

**Interfaces:**
- `Restaurant.logoUrl?: string` and `RestaurantCollection.logoUrl?: string` are optional.
- `RestaurantDraftData.logoUrl?: string` is optional.
- `RestaurantApplicationDataSchema` accepts `logoUrl: z.string().max(1024).nullish()`.
- Storage paths match `restaurant-images/{restaurantId}/logo-{uploadId}.webp` and `restaurant-images/{restaurantId}/cover-{uploadId}.webp`.

- [ ] **Step 1: Write failing Firestore, Storage and schema tests**

Add tests proving: the owner can update only `logoUrl`/`coverImageUrl` while preserving protected fields; another user and unauthenticated clients fail; owner uploads valid versioned WebP assets; invalid MIME, over-2-MiB assets, another owner and unauthenticated clients fail; the callable schema accepts `logoUrl: null` and a valid URL.

```ts
test('restaurant owner can update logoUrl and coverImageUrl without changing protected fields', async () => {
  const ownerDb = testEnv.authenticatedContext('owner-1').firestore();
  await assertSucceeds(updateDoc(doc(ownerDb, 'restaurants', 'rest-1'), {
    logoUrl: 'https://firebasestorage.googleapis.com/logo.webp',
    coverImageUrl: 'https://firebasestorage.googleapis.com/cover.webp',
    updatedAt: Timestamp.now(),
  }));
});
```

- [ ] **Step 2: Run the rules/schema tests and confirm RED**

Run: `npm test -- --runInBand tests/firestore/restaurant-visuals.rules.test.ts tests/storage.rules.test.ts functions/src/restaurant/__tests__/submitRestaurantApplication.test.ts`

Expected: FAIL because `logoUrl` is not yet allowed by the schema/rules and the new Storage match does not exist.

- [ ] **Step 3: Implement the contracts and rules**

Add `logoUrl` to the types and schema. Add it to the owner update allow-list and validate both URL fields as strings of at most 1024 characters. Add a Storage match that allows public reads and owner-only create/delete when the parent restaurant owner matches the authenticated UID, the filename matches `^(logo|cover)-[a-zA-Z0-9_-]+\\.webp$`, the MIME is `image/webp`, and the size is at most 2 MiB.

- [ ] **Step 4: Run the rules/schema tests and confirm GREEN**

Run: `npm test -- --runInBand tests/firestore/restaurant-visuals.rules.test.ts tests/storage.rules.test.ts functions/src/restaurant/__tests__/submitRestaurantApplication.test.ts`

Expected: PASS with protected restaurant fields still rejected and all asset access restrictions enforced.

- [ ] **Step 5: Commit**

```bash
git add src/types/food-delivery.ts src/types/firestore-collections.ts src/types/user.ts functions/src/validators/schemas.ts firestore.rules storage.rules tests/firestore/restaurant-visuals.rules.test.ts tests/storage.rules.test.ts functions/src/restaurant/__tests__/submitRestaurantApplication.test.ts
git commit -m "feat: secure restaurant visual fields"
```

### Task 3: Build the restaurant image Storage service

**Files:**
- Create: `src/services/restaurant-image-storage.service.ts`
- Test: `src/services/__tests__/restaurant-image-storage.service.test.ts`

**Interfaces:**
- Produces `uploadRestaurantImage(restaurantId, kind, file): Promise<{ path: string; url: string }>`.
- Produces `deleteRestaurantImage(path: string): Promise<void>`.
- Produces `getRestaurantImageStorageErrorMessage(error): string`.

- [ ] **Step 1: Write the failing service tests**

Mock only Firebase Storage boundaries. Assert that upload uses the stable path, `image/webp` metadata, and `getDownloadURL`; assert that delete ignores `storage/object-not-found`; assert that unauthorized errors map to the French permission message.

```ts
it('uploads a prepared WebP asset to a versioned restaurant path', async () => {
  const result = await uploadRestaurantImage('rest-1', 'cover', new File(['webp'], 'cover.webp', { type: 'image/webp' }));
  expect(uploadBytes).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({ contentType: 'image/webp' }));
  expect(result.path).toMatch(/^restaurant-images\/rest-1\/cover-[a-z0-9_-]+\.webp$/);
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npm test -- --runInBand src/services/__tests__/restaurant-image-storage.service.test.ts`

Expected: FAIL because the service and exports do not exist.

- [ ] **Step 3: Implement the service**

Prepare the file with `prepareRestaurantImage`, generate a unique upload id, upload it with `uploadBytes` and `{ contentType: 'image/webp', cacheControl: 'public,max-age=31536000' }`, then return the versioned path and download URL. Wrap deletion in an `object-not-found` guard and centralize Storage error translations.

- [ ] **Step 4: Run the focused test and confirm GREEN**

Run: `npm test -- --runInBand src/services/__tests__/restaurant-image-storage.service.test.ts`

Expected: PASS with upload, URL, delete and error-message tests green.

- [ ] **Step 5: Commit**

```bash
git add src/services/restaurant-image-storage.service.ts src/services/__tests__/restaurant-image-storage.service.test.ts
git commit -m "feat: add restaurant image storage service"
```

### Task 4: Add the shared image picker and creation-flow support

**Files:**
- Create: `src/components/restaurant/RestaurantImagePicker.tsx`
- Test: `src/components/restaurant/__tests__/RestaurantImagePicker.test.tsx`
- Modify: `src/app/restaurant/register/components/Step3Restaurant.tsx`
- Modify: `src/app/restaurant/register/page.tsx`
- Modify: `src/hooks/useRestaurantRegistration.ts`

**Interfaces:**
- `RestaurantImagePickerProps = { kind: RestaurantImageKind; value?: string; file: File | null; onFileChange: (file: File | null) => void; disabled?: boolean }`.
- `Step3Restaurant.onNext` becomes `(data: Step3Data, files: RestaurantImageSelection) => void`.
- `useRestaurantRegistration` exposes `restaurantImageFiles`, `setRestaurantImageFiles`, and keeps the files only in React state.

- [ ] **Step 1: Write the failing picker and Step 3 tests**

Cover the French labels, existing URL preview, file selection, remove action, invalid file error, and that Step 3 submits both selected files without writing them to the draft payload.

```tsx
it('lets the owner replace and remove a cover image', async () => {
  render(<RestaurantImagePicker kind="cover" file={null} value="https://example.test/old.webp" onFileChange={onFileChange} />);
  fireEvent.change(screen.getByLabelText('Photo de couverture'), { target: { files: [validCoverFile] } });
  expect(onFileChange).toHaveBeenCalledWith(validCoverFile);
  fireEvent.click(screen.getByRole('button', { name: 'Supprimer la photo de couverture' }));
  expect(onFileChange).toHaveBeenLastCalledWith(null);
});
```

- [ ] **Step 2: Run the focused tests and confirm RED**

Run: `npm test -- --runInBand src/components/restaurant/__tests__/RestaurantImagePicker.test.tsx src/app/restaurant/register/components/__tests__/Step3Restaurant.test.tsx`

Expected: FAIL because the picker props and Step 3 visual controls do not exist.

- [ ] **Step 3: Implement the picker and wire Step 3**

Render one shared picker for `logo` and one for `cover`. Use object URLs for local previews, revoke replaced URLs, call the common validation utility, and keep French `aria-label`/button names. In `page.tsx`, pass the two files to the hook state while keeping `handleDraftSave` limited to serializable `Step3Data`.

- [ ] **Step 4: Implement post-submit upload in the registration hook**

After `submitRestaurantApplication` returns `restaurantId`, upload each selected file with `uploadRestaurantImage`, then call `FoodDeliveryService.updateRestaurantVisuals` with only the successful URLs. If one upload fails, delete any successful sibling upload, show the explicit retry message and do not write a partial visual update; the restaurant submission remains available for retry from settings. On resubmission, existing URLs remain in `Step3Data` unless the user removes them.

- [ ] **Step 5: Run the focused tests and confirm GREEN**

Run: `npm test -- --runInBand src/components/restaurant/__tests__/RestaurantImagePicker.test.tsx src/app/restaurant/register/components/__tests__/Step3Restaurant.test.tsx src/hooks/__tests__/useRestaurantRegistration.test.ts`

Expected: PASS with picker interactions, Step 3 submission and post-submit upload behavior covered.

- [ ] **Step 6: Commit**

```bash
git add src/components/restaurant src/app/restaurant/register/components/Step3Restaurant.tsx src/app/restaurant/register/page.tsx src/hooks/useRestaurantRegistration.ts
git commit -m "feat: add restaurant visuals to registration"
```

### Task 5: Add the Firestore visual update method and settings UI

**Files:**
- Modify: `src/services/food-delivery.service.ts`
- Modify: `src/app/food/portal/[id]/settings/RestaurantSettingsClient.tsx`
- Modify: `src/app/food/portal/[id]/settings/__tests__/RestaurantSettingsClient.test.tsx`

**Interfaces:**
- Produces `FoodDeliveryService.updateRestaurantVisuals(restaurantId, updates): Promise<void>` where `updates` is `{ logoUrl?: string | null; coverImageUrl?: string | null }`.
- Consumes `RestaurantImagePicker` and `uploadRestaurantImage` from earlier tasks.

- [ ] **Step 1: Write the failing service/UI tests**

Assert the service sends only `logoUrl`, `coverImageUrl`, and `updatedAt`; assert settings renders existing images, enables save after a change, uploads the selected file, removes a visual when requested, and preserves the old visual after an upload/update failure.

```tsx
it('renders the existing logo and cover controls', async () => {
  mockGetRestaurantById.mockResolvedValue(makeRestaurant({
    logoUrl: 'https://example.test/logo.webp',
    coverImageUrl: 'https://example.test/cover.webp',
  }));
  render(<RestaurantSettingsClient />);
  expect(await screen.findByAltText('Logo de Chez Medjira')).toBeInTheDocument();
  expect(screen.getByAltText('Photo de couverture de Chez Medjira')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the focused tests and confirm RED**

Run: `npm test -- --runInBand src/app/food/portal/[id]/settings/__tests__/RestaurantSettingsClient.test.tsx src/__tests__/unit/food-delivery.service.test.ts`

Expected: FAIL because no visual update method or settings controls exist.

- [ ] **Step 3: Implement the service method**

Use `updateDoc` with a narrow object containing the requested visual fields and `serverTimestamp()`. Convert `null` to `deleteField()` so removing an image removes the field without touching hours or protected restaurant data.

- [ ] **Step 4: Implement the settings section**

Add local `logoFile`, `coverFile`, `logoRemoved`, and `coverRemoved` state. Reuse the picker, compute visual dirty state alongside the existing hours dirty state, upload changed files first, call `updateRestaurantVisuals`, delete the previous Storage objects only after the Firestore update succeeds, and delete new uploads if the Firestore update fails. Keep the hours save behavior unchanged and show `showSuccess('Visuels enregistrés.')` only after all requested visual updates succeed.

- [ ] **Step 5: Run the focused tests and confirm GREEN**

Run: `npm test -- --runInBand src/app/food/portal/[id]/settings/__tests__/RestaurantSettingsClient.test.tsx src/__tests__/unit/food-delivery.service.test.ts`

Expected: PASS with existing hours tests and new visual tests green.

- [ ] **Step 6: Commit**

```bash
git add src/services/food-delivery.service.ts src/app/food/portal/[id]/settings/RestaurantSettingsClient.tsx src/app/food/portal/[id]/settings/__tests__/RestaurantSettingsClient.test.tsx
git commit -m "feat: manage restaurant visuals in settings"
```

### Task 6: Update public cards, restaurant detail and portal branding

**Files:**
- Modify: `src/components/food/RestaurantCard.tsx`
- Modify: `src/components/food/__tests__/RestaurantCard.test.tsx`
- Modify: `src/app/food/restaurant/[id]/RestaurantClient.tsx`
- Modify: `src/app/food/portal/[id]/RestaurantPortalHeader.tsx`
- Modify: `src/app/food/portal/[id]/__tests__/RestaurantPortalHeader.test.tsx`

**Interfaces:**
- Consumes optional `logoUrl` and `coverImageUrl` from `Restaurant`.
- The public image source is `restaurant.coverImageUrl ?? restaurant.imageUrl`.

- [ ] **Step 1: Write the failing display tests**

Add tests that a cover image is preferred over the legacy `imageUrl`, that a legacy image remains the fallback, and that the portal header renders a logo when present.

```tsx
it('prefers the cover image over the legacy image URL', () => {
  render(<RestaurantCard restaurant={{ ...restaurant, imageUrl: 'legacy.webp', coverImageUrl: 'cover.webp' }} />);
  expect(screen.getByLabelText('Chez Medjira')).toHaveAttribute('src', 'cover.webp');
});
```

- [ ] **Step 2: Run the focused tests and confirm RED**

Run: `npm test -- --runInBand src/components/food/__tests__/RestaurantCard.test.tsx src/app/food/portal/[id]/__tests__/RestaurantPortalHeader.test.tsx`

Expected: FAIL because the public components still use only `imageUrl` and the portal header has no logo slot.

- [ ] **Step 3: Implement the display fallback and branding**

Use `coverImageUrl ?? imageUrl` for card/detail hero images. Add a small logo overlay or identity block only when `logoUrl` exists, with the existing icon fallback otherwise. Preserve accessible alt text and the current placeholder layout.

- [ ] **Step 4: Run the focused tests and confirm GREEN**

Run: `npm test -- --runInBand src/components/food/__tests__/RestaurantCard.test.tsx src/app/food/portal/[id]/__tests__/RestaurantPortalHeader.test.tsx`

Expected: PASS with both modern and legacy image data covered.

- [ ] **Step 5: Commit**

```bash
git add src/components/food/RestaurantCard.tsx src/components/food/__tests__/RestaurantCard.test.tsx src/app/food/restaurant/[id]/RestaurantClient.tsx src/app/food/portal/[id]/RestaurantPortalHeader.tsx src/app/food/portal/[id]/__tests__/RestaurantPortalHeader.test.tsx
git commit -m "feat: display restaurant cover and logo"
```

### Task 7: Run integration verification and browser regression checks

**Files:**
- Modify only if a test exposes a defect: files from Tasks 1–6.
- Browser verification: the running local app at `/restaurant/register` and `/food/portal/settings?restaurantId={id}`.

- [ ] **Step 1: Run all focused unit and rules tests**

Run: `npm test -- --runInBand src/utils/__tests__/restaurant-image.test.ts src/services/__tests__/restaurant-image-storage.service.test.ts src/components/restaurant/__tests__/RestaurantImagePicker.test.tsx src/app/restaurant/register/components/__tests__/Step3Restaurant.test.tsx src/app/food/portal/[id]/settings/__tests__/RestaurantSettingsClient.test.tsx src/components/food/__tests__/RestaurantCard.test.tsx src/app/food/portal/[id]/__tests__/RestaurantPortalHeader.test.tsx tests/firestore/restaurant-visuals.rules.test.ts tests/storage.rules.test.ts functions/src/restaurant/__tests__/submitRestaurantApplication.test.ts`

Expected: PASS with zero failed tests.

- [ ] **Step 2: Run lint and production build**

Run: `npm run lint`

Expected: exit code 0 with no new lint errors.

Run: `npm run build`

Expected: exit code 0 and a successful Next.js production build.

- [ ] **Step 3: Run the browser regression path**

Start the existing development server if needed with `npm run dev`, then run the authenticated restaurant E2E test or use the in-app browser to verify:

1. Step 3 shows logo and cover pickers.
2. Selecting both images shows previews and submission remains disabled only while uploading.
3. The restaurant card displays the cover image.
4. Settings displays both saved images.
5. Replacing and saving the cover updates the public card after reload.

- [ ] **Step 4: Inspect the final diff and status**

Run: `git diff HEAD~7..HEAD --stat; git status --short`

Confirm only the intended feature files and commits are present, and preserve unrelated pre-existing modifications.

- [ ] **Step 5: Commit any final correction**

If verification requires a correction, stage only the corrected feature files and run `git commit -m "fix: complete restaurant visual verification"`; otherwise leave the verified commits unchanged.
