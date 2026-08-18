# Import de menus avec images Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Importer des catalogues CSV/XLSX avec images locales, retirer `preparationTime` du contrat d’import et stocker les images dans Firebase Storage.

**Architecture:** Le client téléverse un CSV, un ZIP CSV ou un XLSX. Le backend choisit un parseur sécurisé : CSV direct, CSV + assets dans ZIP, ou lignes XLSX avec images ExcelJS ancrées sur la colonne `image`. Les lignes conservent leurs métadonnées pendant la prévisualisation puis le worker téléverse chaque image sous le document du plat et écrit l’URL Storage dans Firestore.

**Tech Stack:** Next.js/React, TypeScript, Firebase Storage, Firestore, Cloud Functions v2, ExcelJS, yauzl, csv-parse, Jest.

## Global Constraints

- Code and comments remain in English; UI copy remains in French.
- Existing 15 MiB upload limit, 10,000 data-row limit and 64-column limit remain active.
- No local filesystem path is persisted or trusted as an image location.
- Images are optional; missing images do not invalidate an otherwise valid row unless the row explicitly references a missing ZIP asset.
- `preparationTime` is removed from the import contract, template and writes; existing manually managed menu fields are not migrated by this feature.
- Do not add a new archive dependency: `yauzl` is already available in `functions/package.json`.

---

### Task 1: Define the import format and image metadata contracts

**Files:**
- Modify: `functions/src/restaurant/menuImportContracts.ts`
- Modify: `src/services/menu-import-client.service.ts`
- Modify: `src/types/food-delivery.ts`
- Modify: `src/types/firestore-collections.ts`
- Test: `functions/src/restaurant/__tests__/menuImportJobs.test.ts`
- Test: `src/services/__tests__/menu-import-client.service.test.ts`

**Interfaces:**
- Add a file format distinction (`csv`, `xlsx`, `zip`) while keeping `MenuImportType` as `csv` or `excel` for source identity and existing update semantics.
- Extend parsed/import preview metadata with an optional image filename and image availability indicator.
- Extend upload path helpers to accept `zip`.
- Remove `preparationTime` from `ParsedMenuRow` and `MenuRowZodSchema`.

- [ ] **Step 1: Write failing contract tests**

Add tests proving that `preparationTime` is not part of the normalized import result, that `image` is accepted as an optional field, and that upload rejects unsupported extensions while accepting `.zip`.

- [ ] **Step 2: Run the focused tests and verify they fail for the missing contract**

Run:

```powershell
& 'C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' './node_modules/jest/bin/jest.js' '--runTestsByPath' 'functions/src/restaurant/__tests__/menuImportJobs.test.ts' 'src/services/__tests__/menu-import-client.service.test.ts' '--runInBand' '--watch=false'
```

Expected: failures for the new image/file-format expectations.

- [ ] **Step 3: Implement the shared contracts**

Use `image` as the normalized column name. Accept header aliases `image`, `imageurl`, `photo`, `imagefile`, and `fichierimage`; do not accept or emit `preparationTime`. Keep `category`, `description`, and `isAvailable` defaults unchanged.

- [ ] **Step 4: Run the focused tests and verify they pass**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add functions/src/restaurant/menuImportContracts.ts src/services/menu-import-client.service.ts src/types/food-delivery.ts src/types/firestore-collections.ts functions/src/restaurant/__tests__/menuImportJobs.test.ts src/services/__tests__/menu-import-client.service.test.ts
git commit -m "feat: define menu image import contracts"
```

### Task 2: Add secure ZIP CSV and embedded XLSX image parsing

**Files:**
- Create: `functions/src/restaurant/menuImportAssets.ts`
- Modify: `functions/src/restaurant/menuImportJobs.ts`
- Modify: `functions/src/restaurant/xlsxLimits.ts`
- Test: `functions/src/restaurant/__tests__/menuImportAssets.test.ts`
- Test: `functions/src/restaurant/__tests__/menuImportJobs.test.ts`

**Interfaces:**
- `parseZipCsvBuffer(buffer: Buffer): Promise<ParsedImportRecord[]>`
- `parseXlsxImportBuffer(buffer: Buffer): Promise<ParsedImportRecord[]>`
- `ParsedImportRecord` contains a raw row and optional `{ buffer, extension, originalName }` image asset.
- `normalizeMenuRow` consumes the raw row and returns the validated row without binary data.

- [ ] **Step 1: Write failing parser tests**

Cover: one CSV plus an image in a ZIP, missing referenced image, path traversal rejection, unsupported image extension rejection, one embedded XLSX image mapped to the data row, and multiple embedded images on one row rejected.

- [ ] **Step 2: Run the parser tests and verify the expected failures**

Run:

```powershell
& 'C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' './node_modules/jest/bin/jest.js' '--runTestsByPath' 'functions/src/restaurant/__tests__/menuImportAssets.test.ts' '--runInBand' '--watch=false'
```

Expected: FAIL because the new parser module and image-aware XLSX path do not yet exist.

- [ ] **Step 3: Implement bounded archive extraction**

Use `yauzl` with lazy entries. Enforce the existing 15 MiB upload limit plus archive limits for entry count, total uncompressed bytes, per-image bytes, safe relative paths, exactly one CSV, and supported image extensions (`jpg`, `jpeg`, `png`, `gif`, `webp`). Resolve the `image` cell relative to the archive root and `images/` folder, and attach the matching asset to the record.

- [ ] **Step 4: Implement embedded XLSX image mapping**

Load the workbook only after the existing XLSX archive-limit check. Read the first worksheet, identify the `image` header column, inspect `worksheet.getImages()`, map an image whose top-left native row equals a data row and whose top-left native column equals the image column, and reject ambiguous mappings. Keep the raw tabular values available to the existing row normalizer.

- [ ] **Step 5: Run parser tests and verify they pass**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add functions/src/restaurant/menuImportAssets.ts functions/src/restaurant/menuImportJobs.ts functions/src/restaurant/xlsxLimits.ts functions/src/restaurant/__tests__/menuImportAssets.test.ts functions/src/restaurant/__tests__/menuImportJobs.test.ts
git commit -m "feat: parse menu archives and embedded spreadsheet images"
```

### Task 3: Store imported images and integrate the preview/worker pipeline

**Files:**
- Modify: `functions/src/restaurant/menuImportJobs.ts`
- Modify: `functions/src/restaurant/menuImportContracts.ts`
- Create: `functions/src/restaurant/menuImportStorage.ts`
- Test: `functions/src/restaurant/__tests__/menuImportJobs.test.ts`
- Test: `functions/src/restaurant/__tests__/menuImportStorage.test.ts`

**Interfaces:**
- `uploadMenuItemImage(restaurantId: string, itemId: string, asset: MenuImportImageAsset): Promise<string>` returns a Firebase Storage download URL.
- The preview parser marks a row with a missing/invalid referenced image as invalid.
- The worker retains an existing image when the import row has no image; when an image asset is present, it uploads and writes `imageUrl`.

- [ ] **Step 1: Write failing storage and integration tests**

Test that a valid asset is written under the menu item path with the correct content type, that an image-less update does not delete the existing URL, and that a supplied image updates `imageUrl`.

- [ ] **Step 2: Run the tests and verify the expected failures**

Run:

```powershell
& 'C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' './node_modules/jest/bin/jest.js' '--runTestsByPath' 'functions/src/restaurant/__tests__/menuImportJobs.test.ts' 'functions/src/restaurant/__tests__/menuImportStorage.test.ts' '--runInBand' '--watch=false'
```

- [ ] **Step 3: Implement Storage upload and image-aware worker writes**

Upload with a deterministic item path, validated metadata, and a long-lived read URL. Pass the same parsed asset through preview and worker parsing, preserve existing URLs when no asset is supplied, and keep row-level failure accounting.

- [ ] **Step 4: Update preview/start validation for `.zip`**

Validate the file extension against the declared format, parse ZIP archives during preview, and persist the declared file format in the import job so the worker selects the same parser.

- [ ] **Step 5: Run focused backend tests and verify they pass**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add functions/src/restaurant/menuImportJobs.ts functions/src/restaurant/menuImportContracts.ts functions/src/restaurant/menuImportStorage.ts functions/src/restaurant/__tests__/menuImportJobs.test.ts functions/src/restaurant/__tests__/menuImportStorage.test.ts
git commit -m "feat: store images during menu imports"
```

### Task 4: Update the client upload flow and import UI

**Files:**
- Modify: `src/services/menu-import-client.service.ts`
- Modify: `src/components/food/BulkCsvImportModal.tsx`
- Modify: `src/types/food-delivery.ts`
- Test: `src/services/__tests__/menu-import-client.service.test.ts`
- Test: `src/components/food/__tests__/BulkCsvImportModal.test.tsx`

**Interfaces:**
- File picker accepts `.csv`, `.zip`, and `.xlsx`.
- The UI explains that ZIP is for CSV plus local images and XLSX images must be anchored in the `image` column on the corresponding row.
- The CSV template contains `image` and no `preparationTime`.

- [ ] **Step 1: Write failing client/UI tests**

Test `.zip` upload metadata/path, the new template header, accepted file input extensions, and the explanatory French copy.

- [ ] **Step 2: Run the focused client tests and verify failure**

Run:

```powershell
& 'C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' './node_modules/jest/bin/jest.js' '--runTestsByPath' 'src/services/__tests__/menu-import-client.service.test.ts' 'src/components/food/__tests__/BulkCsvImportModal.test.tsx' '--runInBand' '--watch=false'
```

- [ ] **Step 3: Implement client support and French guidance**

Derive `type` and storage extension from `.csv`, `.zip`, and `.xlsx`, update accepted MIME extensions, change the template header to `externalId,name,description,price,category,isAvailable,image`, and explain that image filenames must match ZIP entries or XLSX row anchors.

- [ ] **Step 4: Run focused client tests and verify they pass**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/services/menu-import-client.service.ts src/components/food/BulkCsvImportModal.tsx src/types/food-delivery.ts src/services/__tests__/menu-import-client.service.test.ts src/components/food/__tests__/BulkCsvImportModal.test.tsx
git commit -m "feat: support zip and xlsx image menu imports"
```

### Task 5: Documentation, full focused verification and type/lint checks

**Files:**
- Modify: `docs/superpowers/specs/2026-08-18-menu-import-images-design.md`
- Modify: `docs/superpowers/plans/2026-08-18-menu-import-images.md`

- [ ] **Step 1: Document the final CSV, ZIP and XLSX examples**

Include the exact `image` column format, ZIP folder layout, Excel image anchoring rule, limits, and the fact that local machine paths are not accepted.

- [ ] **Step 2: Run all focused import tests**

Run:

```powershell
& 'C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' './node_modules/jest/bin/jest.js' '--runTestsByPath' 'functions/src/restaurant/__tests__/menuImportAssets.test.ts' 'functions/src/restaurant/__tests__/menuImportJobs.test.ts' 'functions/src/restaurant/__tests__/menuImportStorage.test.ts' 'src/services/__tests__/menu-import-client.service.test.ts' 'src/components/food/__tests__/BulkCsvImportModal.test.tsx' '--runInBand' '--watch=false'
```

Expected: all selected import tests pass.

- [ ] **Step 3: Run backend and frontend type checks**

Run:

```powershell
& 'C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' './node_modules/typescript/bin/tsc' '--noEmit' '--pretty' 'false'
& 'C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' './node_modules/typescript/bin/tsc' '--project' 'functions/tsconfig.json' '--noEmit' '--pretty' 'false'
```

Expected: both commands exit 0.

- [ ] **Step 4: Run targeted ESLint**

Run ESLint on every modified TypeScript source and test file. Expected: no new lint errors.

- [ ] **Step 5: Update the plan checkboxes and report any unrelated full-suite failures**

Do not claim the entire repository test suite passes if unrelated existing suites fail.
