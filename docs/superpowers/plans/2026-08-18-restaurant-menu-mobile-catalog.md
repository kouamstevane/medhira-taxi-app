# Gestion du menu mobile-first à grande échelle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer la grille de cartes du portail restaurateur par un catalogue mobile-first paginé, recherchable sur l'ensemble du menu et adapté au tableau desktop.

**Architecture:** Le service Firestore expose une page de catalogue à partir d'un contrat de recherche partagé et retourne le total réel avec `getCountFromServer`. Les métadonnées indexables de recherche sont générées à chaque écriture et peuvent être recalculées pour les plats existants. La page orchestre l'état URL, la pagination et les actions, tandis que des composants dédiés rendent la barre d'outils, les lignes, le tableau et la pagination.

**Tech Stack:** Next.js App Router, React 19, TypeScript strict, Firebase Firestore v12, Tailwind CSS v4, Jest, React Testing Library, Playwright.

## Global Constraints

- L'interface est mobile-first et reste adaptée à la tablette et au desktop.
- Le thème sombre et l'accent orange Medjira sont conservés.
- Une ligne de catalogue doit être utilisable avec des zones tactiles d'au moins 44 px.
- La recherche et les filtres couvrent le catalogue, pas uniquement les éléments déjà chargés.
- La taille de page par défaut est de 50 éléments et les pages suivantes ne doivent pas être concaténées indéfiniment dans le DOM.
- Le texte visible de l'interface est en français ; les noms de code et commentaires restent en anglais.
- Aucun commentaire de code ne doit être ajouté.
- Les suppressions restent confirmées ; les erreurs d'action ne doivent pas produire de faux état optimiste.

## Carte des fichiers

- Create: `src/utils/menu-catalog.ts` — normalisation, types de filtre et options de tri partagés côté client.
- Create: `src/utils/__tests__/menu-catalog.test.ts` — tests de normalisation et de génération des préfixes.
- Modify: `src/types/food-delivery.ts` — champ Firestore optionnel `searchPrefixes` sur `MenuItem`.
- Modify: `src/services/food-delivery.service.ts` — contrat paginé filtrable, comptage réel et mise à jour en masse de disponibilité.
- Modify: `src/services/__tests__/food-menu-pagination.service.test.ts` — tests des requêtes, compteurs, filtres et curseurs.
- Create: `functions/src/restaurant/menuSearchMetadata.ts` — équivalent serveur de génération des métadonnées de recherche.
- Modify: `functions/src/restaurant/menuImportJobs.ts` — enrichissement des écritures CSV/XLSX avec `searchPrefixes`.
- Modify: `functions/src/restaurant/__tests__/menuImportJobs.test.ts` — vérification des métadonnées générées lors d'un import.
- Create: `scripts/backfill-menu-search.mjs` — recalcul contrôlé des métadonnées pour un restaurant existant.
- Modify: `package.json` — commande de backfill explicite.
- Modify: `firestore.indexes.json` — index composites requis par les combinaisons de recherche, statut, catégorie et tri.
- Create: `src/components/restaurant/menu/MenuCatalogToolbar.tsx` — recherche, filtres, tri et résumé du catalogue.
- Create: `src/components/restaurant/menu/MenuCatalogRow.tsx` — ligne mobile réutilisable et actions d'un plat.
- Create: `src/components/restaurant/menu/MenuCatalogTable.tsx` — en-tête et disposition tableau desktop.
- Create: `src/components/restaurant/menu/MenuCatalogPagination.tsx` — compteur et navigation entre pages.
- Create: `src/components/restaurant/menu/__tests__/MenuCatalogToolbar.test.tsx` — interactions de recherche et filtres.
- Create: `src/components/restaurant/menu/__tests__/MenuCatalogRow.test.tsx` — statut et actions de ligne.
- Create: `src/hooks/useMenuCatalogQuery.ts` — état URL, debounce, cursors et chargement de page.
- Create: `src/hooks/__tests__/useMenuCatalogQuery.test.ts` — réinitialisation et persistance des paramètres.
- Modify: `src/app/food/portal/[id]/menu/MenuManagementClient.tsx` — orchestration de la nouvelle vue sans changer le formulaire d'édition existant.
- Modify: `src/app/food/portal/[id]/menu/__tests__/MenuManagementClient.test.tsx` — tests de rendu, pagination, états vides et actions.

---

### Task 1: Définir la recherche indexable et le contrat de filtre

**Files:**
- Create: `src/utils/menu-catalog.ts`
- Create: `src/utils/__tests__/menu-catalog.test.ts`
- Modify: `src/types/food-delivery.ts:168-180`
- Create: `functions/src/restaurant/menuSearchMetadata.ts`

**Interfaces:**
- Produces `MenuCatalogAvailability`, `MenuCatalogSort`, `MenuCatalogQuery`, `normalizeMenuSearchValue(value: string): string` et `buildMenuSearchPrefixes(fields: string[]): string[]`.
- `MenuItem.searchPrefixes?: string[]` est optionnel pour permettre la lecture des anciens documents avant backfill.

- [ ] **Step 1: Write the failing tests**

```ts
import { buildMenuSearchPrefixes, normalizeMenuSearchValue } from '../menu-catalog';

describe('menu catalog search metadata', () => {
  it('normalizes accents, punctuation and repeated spaces', () => {
    expect(normalizeMenuSearchValue('  Détox-Pomme  fraîche ')).toBe('detox pomme fraiche');
  });

  it('builds prefixes for full fields and individual words', () => {
    const prefixes = buildMenuSearchPrefixes(['Détox Pomme', 'Boissons Fraîches', 'SKU-42']);
    expect(prefixes).toEqual(expect.arrayContaining(['detox', 'detox pomme', 'pomme', 'boissons', 'sku']));
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npx jest src/utils/__tests__/menu-catalog.test.ts --runInBand`

Expected: FAIL because `menu-catalog.ts` and its exports do not exist.

- [ ] **Step 3: Implement the minimal shared contract**

Implement `normalizeMenuSearchValue` with Unicode decomposition, removal of combining marks, lower-casing, replacement of non-alphanumeric characters by spaces and whitespace collapsing. Generate unique prefixes from each normalized field and each normalized word, with a minimum length of two characters and a maximum prefix length of 32 characters.

Use this contract:

```ts
export type MenuCatalogAvailability = 'all' | 'available' | 'unavailable';
export type MenuCatalogSort = 'category' | 'name' | 'price-asc' | 'price-desc';

export interface MenuCatalogQuery {
  pageSize?: number;
  cursor?: QueryDocumentSnapshot<DocumentData> | null;
  search?: string;
  category?: string | null;
  availability?: MenuCatalogAvailability;
  sort?: MenuCatalogSort;
}

export interface MenuSearchableFields {
  name?: string;
  category?: string;
  externalId?: string;
}

export function normalizeMenuSearchValue(value: string): string;
export function buildMenuSearchPrefixes(fields: string[]): string[];
```

Add `searchPrefixes?: string[]` to `MenuItem` and mirror the normalization algorithm in the functions-side `menuSearchMetadata.ts` without importing client files into the Functions bundle.

- [ ] **Step 4: Run the focused tests to verify they pass**

Run: `npx jest src/utils/__tests__/menu-catalog.test.ts --runInBand`

Expected: PASS with both tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/utils/menu-catalog.ts src/utils/__tests__/menu-catalog.test.ts src/types/food-delivery.ts functions/src/restaurant/menuSearchMetadata.ts
git commit -m "feat: add menu catalog search metadata"
```

### Task 2: Exposer la page Firestore filtrable et le total réel

**Files:**
- Modify: `src/services/food-delivery.service.ts:376-440`
- Modify: `src/services/__tests__/food-menu-pagination.service.test.ts`
- Modify: `firestore.indexes.json`

**Interfaces:**
- Consumes `MenuCatalogQuery`, `normalizeMenuSearchValue` and `buildMenuSearchPrefixes` from Task 1.
- Produces `MenuPage { items, lastDoc, hasMore, totalCount }` and `getRestaurantMenuPaginated(restaurantId: string, options?: MenuCatalogQuery): Promise<MenuPage>`.
- Produces `bulkUpdateMenuItemAvailability(restaurantId: string, itemIds: string[], isAvailable: boolean): Promise<void>`.

- [ ] **Step 1: Extend the service tests with failing cases**

```ts
test('returns totalCount and applies search, category and availability filters', async () => {
  (getDocs as jest.Mock).mockResolvedValueOnce({ docs: mockDocs.slice(0, 2) });
  (getCountFromServer as jest.Mock).mockResolvedValueOnce({ data: () => ({ count: 12 }) });

  const result = await getRestaurantMenuPaginated('restaurant-1', {
    search: 'burger',
    category: 'Plats',
    availability: 'available',
    sort: 'name',
    pageSize: 50,
  });

  expect(result.totalCount).toBe(12);
  expect(where).toHaveBeenCalledWith('searchPrefixes', 'array-contains', 'burger');
  expect(where).toHaveBeenCalledWith('category', '==', 'Plats');
  expect(where).toHaveBeenCalledWith('isAvailable', '==', true);
  expect(orderBy).toHaveBeenCalledWith('name', 'asc');
});

test('writes bulk availability changes in a single batch', async () => {
  await bulkUpdateMenuItemAvailability('restaurant-1', ['item-1', 'item-2'], false);
  expect(writeBatch).toHaveBeenCalled();
  expect(batch.update).toHaveBeenCalledTimes(2);
  expect(batch.commit).toHaveBeenCalledTimes(1);
});
```

Add mocks for `getCountFromServer`, `writeBatch` and `where` in the existing Firestore test setup.

- [ ] **Step 2: Run the service tests to verify they fail**

Run: `npx jest src/services/__tests__/food-menu-pagination.service.test.ts --runInBand`

Expected: FAIL because the current positional API has no query object, no `totalCount` and no bulk operation.

- [ ] **Step 3: Implement the query builder and page contract**

Change the service signature to accept `MenuCatalogQuery`. Bound `pageSize` to 1–100. Build the same constraints for `getDocs` and `getCountFromServer`: `searchPrefixes array-contains` when `search` has at least two normalized characters, equality on `category`, equality on `isAvailable` for the two non-`all` availability values, then the selected `orderBy` and `documentId()` tie-breaker. Apply `startAfter` only when `cursor` is present. Return `totalCount` from the count snapshot and set `hasMore` from the page size.

Keep the default sort `category` so existing catalog ordering remains stable. For price sorting, use `price` ascending/descending and `documentId()` as the deterministic tie-breaker.

Implement bulk availability with `writeBatch`, writing `{ isAvailable, updatedAt: serverTimestamp() }` for each selected menu document and rejecting an empty item list before creating a batch.

- [ ] **Step 4: Add the required composite indexes**

Add collection-group indexes for `menu_items` covering the combinations used by the query builder: `searchPrefixes CONTAINS + category ASC + __name__ ASC`, `searchPrefixes CONTAINS + isAvailable ASC + category ASC + __name__ ASC`, and the corresponding `price ASC/DESC + __name__ ASC` variants. Keep the existing index file entries unchanged.

- [ ] **Step 5: Run the service tests to verify they pass**

Run: `npx jest src/services/__tests__/food-menu-pagination.service.test.ts --runInBand`

Expected: PASS with the legacy pagination assertions updated to the options object and all filter/count/batch assertions passing.

- [ ] **Step 6: Commit**

```bash
git add src/services/food-delivery.service.ts src/services/__tests__/food-menu-pagination.service.test.ts firestore.indexes.json
git commit -m "feat: paginate and filter restaurant menu catalog"
```

### Task 3: Maintenir et backfiller les métadonnées de recherche

**Files:**
- Modify: `src/services/food-delivery.service.ts:1105-1163`
- Modify: `functions/src/restaurant/menuImportJobs.ts:650-920`
- Modify: `functions/src/restaurant/__tests__/menuImportJobs.test.ts`
- Create: `scripts/backfill-menu-search.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes `buildMenuSearchPrefixes` from Task 1.
- Produces `searchPrefixes` on manual, CSV and XLSX menu writes.
- Produces `npm run menu:backfill-search -- --restaurantId <id>` with a dry-run default and an explicit `--apply` flag.

- [ ] **Step 1: Add failing write-path assertions**

```ts
it('writes search prefixes for imported menu items', async () => {
  await executeMenuImportJob(jobWithRows([{ name: 'Détox Pomme', category: 'Boissons', price: 500 }]));
  expect(batch.set).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      searchPrefixes: expect.arrayContaining(['detox', 'pomme', 'boissons']),
    }),
    expect.anything(),
  );
});
```

Add a service test that `upsertMenuItem` sends `searchPrefixes` derived from `name`, `category` and `externalId`.

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `npx jest functions/src/restaurant/__tests__/menuImportJobs.test.ts src/services/__tests__/food-menu-pagination.service.test.ts --runInBand`

Expected: FAIL because import and manual writes do not yet add `searchPrefixes`.

- [ ] **Step 3: Update all menu writes**

In `upsertMenuItem`, calculate prefixes from the final `name`, `category` and `externalId` values before `setDoc`. In the import worker, calculate the same metadata in the object written to each menu document. Preserve existing image and import fields.

- [ ] **Step 4: Implement the controlled backfill script**

The script must require `--restaurantId`, connect using Firebase Admin application default credentials, read the restaurant's `menu_items` collection in pages of 400, and print the number of documents that would change. It must refuse to write unless `--apply` is present. With `--apply`, update only `searchPrefixes` in batches and print a final count.

Add this package command:

```json
"menu:backfill-search": "node scripts/backfill-menu-search.mjs"
```

- [ ] **Step 5: Run tests and a dry run**

Run: `npx jest functions/src/restaurant/__tests__/menuImportJobs.test.ts --runInBand`

Expected: PASS with imported metadata assertions passing.

Run: `npm run menu:backfill-search -- --restaurantId restaurant-1`

Expected: the script prints the planned update count and performs no writes without `--apply`.

- [ ] **Step 6: Commit**

```bash
git add src/services/food-delivery.service.ts functions/src/restaurant/menuImportJobs.ts functions/src/restaurant/__tests__/menuImportJobs.test.ts scripts/backfill-menu-search.mjs package.json
git commit -m "feat: maintain menu search metadata"
```

### Task 4: Construire les composants de catalogue responsive

**Files:**
- Create: `src/components/restaurant/menu/MenuCatalogToolbar.tsx`
- Create: `src/components/restaurant/menu/MenuCatalogRow.tsx`
- Create: `src/components/restaurant/menu/MenuCatalogTable.tsx`
- Create: `src/components/restaurant/menu/MenuCatalogPagination.tsx`
- Create: `src/components/restaurant/menu/__tests__/MenuCatalogToolbar.test.tsx`
- Create: `src/components/restaurant/menu/__tests__/MenuCatalogRow.test.tsx`

**Interfaces:**
- `MenuCatalogToolbar` consumes `search`, `availability`, `category`, `sort`, `totalCount`, `availableCount` and emits `onSearchChange`, `onAvailabilityChange`, `onCategoryChange`, `onSortChange`, `onClearFilters`, `onOpenActions`.
- `MenuCatalogRow` consumes `item`, `selected`, `onSelect`, `onToggleAvailability`, `onEdit`, `onDelete`.
- `MenuCatalogTable` consumes `items` and the row action callbacks and renders desktop headings plus mobile rows without horizontal overflow.
- `MenuCatalogPagination` consumes `pageIndex`, `pageSize`, `totalCount`, `hasNextPage`, `hasPreviousPage`, `isLoading` and emits `onPrevious`, `onNext`.

- [ ] **Step 1: Write failing component tests**

```tsx
it('renders the mobile toolbar with a result summary and filter controls', () => {
  render(<MenuCatalogToolbar {...defaultToolbarProps} totalCount={1842} availableCount={1706} />);
  expect(screen.getByText('1 842 plats')).toBeInTheDocument();
  expect(screen.getByPlaceholderText(/Rechercher un plat/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Disponibles' })).toBeInTheDocument();
});

it('renders a compact row with accessible edit and delete actions', () => {
  render(<MenuCatalogRow item={menuItem} {...defaultRowProps} />);
  expect(screen.getByText('Burger Maison')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Modifier Burger Maison/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Supprimer Burger Maison/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the component tests to verify they fail**

Run: `npx jest src/components/restaurant/menu/__tests__ --runInBand`

Expected: FAIL because the catalog components do not exist.

- [ ] **Step 3: Implement the visual primitives**

Use the existing `MaterialIcon`, `MenuItemImage`, `formatCurrencyWithCode` and design tokens. Keep the toolbar controls at least 44 px high. Render the mobile row as a two-column flex layout with an optional 48 px thumbnail, a text block and a compact action menu. Render the desktop table with CSS responsive breakpoints; do not add horizontal scrolling to the mobile layout.

Use French labels exactly: `Tous`, `Disponibles`, `Indisponibles`, `Catégorie`, `Trier par`, `Réinitialiser`, `Modifier`, `Supprimer` and `Disponible`/`Indisponible`.

- [ ] **Step 4: Run the component tests to verify they pass**

Run: `npx jest src/components/restaurant/menu/__tests__ --runInBand`

Expected: PASS with toolbar, row and accessibility assertions passing.

- [ ] **Step 5: Commit**

```bash
git add src/components/restaurant/menu
git commit -m "feat: add responsive menu catalog components"
```

### Task 5: Brancher l'état URL, la pagination et la page du portail

**Files:**
- Create: `src/hooks/useMenuCatalogQuery.ts`
- Create: `src/hooks/__tests__/useMenuCatalogQuery.test.ts`
- Modify: `src/app/food/portal/[id]/menu/MenuManagementClient.tsx`
- Modify: `src/app/food/portal/[id]/menu/__tests__/MenuManagementClient.test.tsx`

**Interfaces:**
- `useMenuCatalogQuery(restaurantId: string)` returns `items`, `totalCount`, `isLoading`, `isLoadingPage`, `error`, `pageIndex`, `hasNextPage`, `hasPreviousPage`, `search`, `category`, `availability`, `sort`, `selectedIds`, `setSearch`, `setCategory`, `setAvailability`, `setSort`, `goNext`, `goPrevious`, `toggleSelected`, `toggleAllVisible`, `clearSelection`, `reload` and `retry`.
- The hook consumes the Task 2 service API and stores cursors by page index so previous/next navigation does not concatenate all pages.

- [ ] **Step 1: Write failing hook and page tests**

```tsx
it('resets to the first page and clears the cursor history when search changes', async () => {
  const { result } = renderHook(() => useMenuCatalogQuery('restaurant-1'), { wrapper });
  await waitFor(() => expect(result.current.isLoading).toBe(false));

  act(() => result.current.goNext());
  await waitFor(() => expect(result.current.pageIndex).toBe(1));
  act(() => result.current.setSearch('burger'));

  await waitFor(() => expect(result.current.pageIndex).toBe(0));
  expect(getRestaurantMenuPaginated).toHaveBeenLastCalledWith(
    'restaurant-1',
    expect.objectContaining({ search: 'burger', cursor: null }),
  );
});
```

Extend `MenuManagementClient.test.tsx` to assert `1 842 plats`, the no-results state, next-page navigation and that the old category card headings are no longer rendered.

- [ ] **Step 2: Run the hook and page tests to verify they fail**

Run: `npx jest src/hooks/__tests__/useMenuCatalogQuery.test.ts src/app/food/portal/[id]/menu/__tests__/MenuManagementClient.test.tsx --runInBand`

Expected: FAIL because the hook and new page orchestration do not exist.

- [ ] **Step 3: Implement the query hook**

Parse `search`, `category`, `availability`, `sort` and `page` from `useSearchParams`. Keep `search` as the URL's visible input value, debounce service calls by 300 ms, and replace the URL when criteria change. Store a cursor array where index 0 is `null` and the cursor returned by page `n` is stored at `n + 1`. On a criteria change, reset page index, cursor history and selected IDs before loading page 0.

Do not append page results to prior results. Keep only the current page in `items` and expose `totalCount` from the service.

- [ ] **Step 4: Replace the page's catalogue rendering**

Keep authentication, restaurant ownership validation, modal editor, CSV modal, store connector, image handling, delete flow and bottom navigation. Replace only the current category computation, client-side `menuItems.filter`, search toolbar and card grid with `useMenuCatalogQuery`, `MenuCatalogToolbar`, `MenuCatalogTable` and `MenuCatalogPagination`.

Move import and store buttons into a mobile `⋮` actions menu while keeping them visible on desktop. Add skeleton rows during initial load, a no-results state with `Réinitialiser`, error retry, page-level selection and bulk availability actions. Keep `loadFirstPage` as the post-save/import reload path through the hook's `reload` method.

- [ ] **Step 5: Run the hook and page tests to verify they pass**

Run: `npx jest src/hooks/__tests__/useMenuCatalogQuery.test.ts src/app/food/portal/[id]/menu/__tests__/MenuManagementClient.test.tsx --runInBand`

Expected: PASS with URL reset, current-page-only rendering, result summary, empty states and action callbacks covered.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useMenuCatalogQuery.ts src/hooks/__tests__/useMenuCatalogQuery.test.ts src/app/food/portal/[id]/menu/MenuManagementClient.tsx src/app/food/portal/[id]/menu/__tests__/MenuManagementClient.test.tsx
git commit -m "feat: redesign restaurant menu catalog"
```

### Task 6: Vérifier le responsive et la qualité de livraison

**Files:**
- Modify: `src/components/restaurant/menu/*` only when verification exposes a layout defect.
- Modify: `src/app/food/portal/[id]/menu/MenuManagementClient.tsx` only when verification exposes an interaction defect.
- Create: `e2e/restaurant-menu-catalog.spec.ts` if the existing authenticated E2E fixtures support the portal route.

- [ ] **Step 1: Run focused unit tests and type checking**

Run: `npx jest src/utils/__tests__/menu-catalog.test.ts src/services/__tests__/food-menu-pagination.service.test.ts src/components/restaurant/menu/__tests__ src/hooks/__tests__/useMenuCatalogQuery.test.ts src/app/food/portal/[id]/menu/__tests__/MenuManagementClient.test.tsx --runInBand`

Expected: PASS with zero failed tests.

Run: `npm run typecheck`

Expected: exit code 0 with no TypeScript errors.

- [ ] **Step 2: Run lint**

Run: `npm run lint`

Expected: exit code 0 with no ESLint errors in the changed files.

- [ ] **Step 3: Verify the mobile and desktop layouts**

Start the app with `npm run dev`, open `/food/portal/menu/?restaurantId=ESbHSzTG8nFO4mN3EqpB`, and verify at 390 px and 1280 px viewport widths:

- the mobile view has no horizontal overflow;
- the desktop view shows table columns;
- search displays results beyond the first page after backfill;
- `1–50 sur N` is visible;
- next/previous keeps only one page rendered;
- no-results and retry states keep their controls accessible;
- the bottom navigation does not cover the pagination.

If the authenticated E2E fixture supports the route, add a Playwright test for mobile overflow and desktop table visibility, then run `npx playwright test e2e/restaurant-menu-catalog.spec.ts`.

- [ ] **Step 4: Run the production build**

Run: `npm run build`

Expected: exit code 0 and a successful Next.js production build.

- [ ] **Step 5: Review the final diff and commit verification-only fixes**

Run: `git diff --check` and `git status --short`.

Expected: no whitespace errors and only the intended catalog files changed. If the responsive verification required a fix, commit it with `fix: polish responsive menu catalog`; otherwise do not create an empty commit.

## Self-review checklist

- Spec coverage: the plan covers the mobile row, desktop table, real total, server-side filtering, URL state, pagination, action states, accessibility and verification criteria.
- Placeholder scan: no unfinished marker, vague implementation step or unassigned test requirement remains.
- Type consistency: `MenuCatalogQuery`, `MenuPage.totalCount`, `getRestaurantMenuPaginated` and all hook consumers use the same names and cursor contract.
- Scope: the editor, CSV import flow and store connector remain intact; only their placement and reload integration change.
