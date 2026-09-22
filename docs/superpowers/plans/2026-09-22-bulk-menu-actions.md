# Actions de masse du catalogue restaurant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Permettre la sélection de quelques plats ou de tous les résultats filtrés, puis leur mise en indisponibilité ou leur suppression physique en masse.

**Architecture:** Le service Firestore réutilisera les mêmes contraintes de recherche, catégorie et disponibilité que la pagination pour charger tous les plats correspondant aux critères. Le hook conservera les `MenuItem` sélectionnés, y compris ceux des pages non visibles, et la page orchestrera les opérations en lots et le nettoyage Storage.

**Tech Stack:** Next.js 16 App Router, React, TypeScript, Firebase Firestore Web SDK, Firebase Storage, Jest, React Testing Library.

## Global Constraints

- Code et commentaires en anglais ; texte de l’interface en français et anglais via les traductions existantes.
- Ne pas modifier les changements utilisateur préexistants dans le working tree.
- Les opérations Firestore sont découpées en lots de 500 documents maximum.
- La suppression physique reste protégée par la règle propriétaire du restaurant déjà déployée.
- Aucun nouveau package.

---

### Task 1: Ajouter les primitives Firestore pour les résultats filtrés et les lots

**Files:**
- Modify: `src/services/food-delivery.service.ts:674-780`
- Test: `src/services/__tests__/food-delivery-bulk-menu.service.test.ts`

**Interfaces:**
- Produce `getRestaurantMenuItemsMatchingQuery(restaurantId: string, options: MenuCatalogQuery): Promise<MenuItem[]>`.
- Produce `bulkUpdateMenuItemAvailability(restaurantId: string, itemIds: string[], isAvailable: boolean): Promise<void>` with chunked batches.
- Produce `bulkDeleteMenuItems(restaurantId: string, itemIds: string[]): Promise<void>` with chunked batches.

- [ ] **Step 1: Write failing service tests**

Test that matching items use the active `where` constraints, that availability updates commit one batch per chunk, and that bulk deletion calls `batch.delete` for every ID. Use the existing Firestore module mocking pattern from `food-menu-pagination.service.test.ts`.

- [ ] **Step 2: Run the service tests and verify they fail**

Run: `npx jest src/services/__tests__/food-delivery-bulk-menu.service.test.ts --runInBand`

Expected: FAIL because the matching-items and bulk-delete functions do not exist and availability still commits one batch for every input size.

- [ ] **Step 3: Implement shared query constraints and chunked operations**

Extract a private `buildMenuCatalogConstraints(options)` helper from the existing pagination logic. Use it for the paginated query and the all-matching query. Query the collection with the catalog constraints only (no pagination limit) for selection. Add a `chunkArray` helper and commit batches of at most 500 writes. `bulkDeleteMenuItems` must call `batch.delete` on `restaurants/{restaurantId}/menu_items/{itemId}`.

- [ ] **Step 4: Run the service tests and verify they pass**

Run: `npx jest src/services/__tests__/food-delivery-bulk-menu.service.test.ts --runInBand`

Expected: PASS with all service behaviors covered.

---

### Task 2: Make selection persistent and support all filtered results

**Files:**
- Modify: `src/hooks/useMenuCatalogQuery.ts:10-185`
- Test: `src/hooks/__tests__/useMenuCatalogQuery.test.tsx`

**Interfaces:**
- Add `selectedItems: MenuItem[]` to the hook result.
- Add `selectAllMatching(): Promise<void>` to load and select every item matching the current query.
- Preserve `toggleSelected(itemId)` and `clearSelection()` for existing callers.

- [ ] **Step 1: Write failing hook tests**

Test that selecting an individual visible item exposes both its ID and full item, `selectAllMatching()` calls the service with search/category/availability/sort/pageSize options and selects results beyond the current page, and changing criteria clears the selection.

- [ ] **Step 2: Run the hook tests and verify they fail**

Run: `npx jest src/hooks/__tests__/useMenuCatalogQuery.test.tsx --runInBand`

Expected: FAIL because `selectedItems` and `selectAllMatching` are not available and the current selection model only stores visible IDs.

- [ ] **Step 3: Implement the selection model**

Store selected `MenuItem` objects in hook state, derive `selectedIds`, have `toggleSelected` resolve the item from the current page, preserve selected items while changing pages, clear them when search/category/availability/sort changes, and implement `selectAllMatching` with the new service method. If all matching items are already selected, the method clears the selection; otherwise it replaces the selection with all matching items.

- [ ] **Step 4: Run the hook tests and verify they pass**

Run: `npx jest src/hooks/__tests__/useMenuCatalogQuery.test.tsx --runInBand`

Expected: PASS with selection IDs and item metadata synchronized.

---

### Task 3: Add the bulk confirmation dialog and translations

**Files:**
- Create: `src/components/restaurant/menu/DeleteMenuItemsDialog.tsx`
- Create: `src/components/restaurant/menu/__tests__/DeleteMenuItemsDialog.test.tsx`
- Modify: `src/locales/fr/restaurant.ts:236-307`
- Modify: `src/locales/en/restaurant.ts:239-307`

**Interfaces:**
- `DeleteMenuItemsDialogProps`: `{ count: number; onCancel: () => void; onConfirm: () => void; isProcessing?: boolean }`.

- [ ] **Step 1: Write the failing dialog test**

Render the dialog with a count, assert the count is announced, assert cancel does not confirm, assert confirm invokes `onConfirm`, and assert both actions are disabled while processing.

- [ ] **Step 2: Run the dialog test and verify it fails**

Run: `npx jest src/components/restaurant/menu/__tests__/DeleteMenuItemsDialog.test.tsx --runInBand`

Expected: FAIL because the component and translation keys do not exist.

- [ ] **Step 3: Implement the dialog and bilingual copy**

Use the existing `DeleteMenuItemDialog` visual pattern with a French/English title, count interpolation, irreversible-action warning, cancel button, and processing label. Add keys for select-all, clear-selection, bulk unavailable, bulk delete, confirmation, success, partial image cleanup, and bulk errors in both locale files.

- [ ] **Step 4: Run the dialog test and verify it passes**

Run: `npx jest src/components/restaurant/menu/__tests__/DeleteMenuItemsDialog.test.tsx --runInBand`

Expected: PASS.

---

### Task 4: Wire bulk selection and actions into the restaurant menu page

**Files:**
- Modify: `src/app/food/portal/[id]/menu/MenuManagementClient.tsx:430-620`
- Modify: `src/components/restaurant/menu/MenuCatalogTable.tsx:1-50`
- Modify: `src/app/food/portal\\[id\\]/menu/__tests__/MenuManagementClient.test.tsx`
- Modify: `src/components/restaurant/menu/__tests__/MenuCatalogRow.test.tsx`

**Interfaces:**
- `MenuCatalogTable` receives `onSelectAll: () => void | Promise<void>` and `isSelectingAll?: boolean`.
- Page actions consume `catalog.selectedItems`, `catalog.selectedIds`, `catalog.selectAllMatching`, and `catalog.clearSelection`.

- [ ] **Step 1: Extend page tests with failing bulk behavior cases**

Add tests for a visible “select all filtered results” control, selection of all mocked filtered items, immediate bulk unavailability calling the existing batch service with every selected ID, and a bulk delete confirmation that calls the new deletion service only after confirmation. Add a test that image paths from selected items are passed to Storage cleanup.

- [ ] **Step 2: Run the page tests and verify they fail**

Run: `npx jest src/app/food/portal\\[id\\]/menu/__tests__/MenuManagementClient.test.tsx --runInBand`

Expected: FAIL because the page has only single-item deletion and current-page selection.

- [ ] **Step 3: Implement page orchestration and controls**

Add an async selection state and bulk action state. Render a mobile/desktop “Tout sélectionner” control when results exist, show the selected count and clear-selection action, keep “Rendre disponibles” and “Masquer” immediate, add “Supprimer” using `DeleteMenuItemsDialog`, call `bulkDeleteMenuItems` once per confirmed action, delete each selected `imageStoragePath` best-effort, reload the catalog, clear selection after success, and display the existing error/success toast patterns.

- [ ] **Step 4: Update table selection semantics**

Make the table header checkbox invoke `selectAllMatching` rather than selecting only the current page. Add `aria-busy` and a disabled state while all matching results are loading. Keep row-level checkbox selection unchanged.

- [ ] **Step 5: Run the page and component tests**

Run: `npx jest src/app/food/portal\\[id\\]/menu/__tests__/MenuManagementClient.test.tsx src/components/restaurant/menu/__tests__/MenuCatalogRow.test.tsx --runInBand`

Expected: PASS with single-item behavior and bulk behavior covered.

---

### Task 5: Verify type safety, lint, build-adjacent tests, and Firestore rules

**Files:**
- Test: `tests/menu-items.rules.test.ts` (existing owner/non-owner delete coverage)

- [ ] **Step 1: Run all focused tests**

Run: `npx jest src/services/__tests__/food-delivery-bulk-menu.service.test.ts src/hooks/__tests__/useMenuCatalogQuery.test.tsx src/components/restaurant/menu/__tests__/DeleteMenuItemsDialog.test.tsx src/app/food/portal\\[id\\]/menu/__tests__/MenuManagementClient.test.tsx --runInBand`

Expected: all focused suites pass.

- [ ] **Step 2: Run Firestore rules tests**

Run: `npx firebase emulators:exec --project medjira-taxi-test --only firestore "npx jest tests/menu-items.rules.test.ts --config jest.firestore.config.js --runInBand"`

Expected: owner deletion succeeds and another authenticated user is denied.

- [ ] **Step 3: Run static verification**

Run: `npx eslint src/services/food-delivery.service.ts src/hooks/useMenuCatalogQuery.ts src/components/restaurant/menu/DeleteMenuItemsDialog.tsx src/app/food/portal\\[id\\]/menu/MenuManagementClient.tsx --no-warn-ignored`

Run: `npx tsc --noEmit --pretty false`

Expected: exit code 0 for both commands.

- [ ] **Step 4: Inspect the final diff**

Run: `git diff --check` and `git status --short`.

Expected: no whitespace errors; only the intended bulk menu files are added to the agent’s changes, while pre-existing user changes remain untouched.
