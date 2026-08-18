# Scalable Customer Restaurant Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the customer restaurant page usable for menus up to 1,000 dishes through server-side search, category navigation, cursor pagination, and resilient mobile states.

**Architecture:** Keep the current restaurant header, cart store, and quick-add `MenuItemCard`. Add a customer-specific Firestore page query, a focused customer menu hook, and two small presentation components for navigation and progressive results. `RestaurantClient` will orchestrate restaurant metadata and menu state without loading the complete menu into the browser.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Firebase Firestore, Tailwind CSS v4, Jest, React Testing Library, Playwright.

## Global Constraints

- V1 implements menu discovery only; modifiers, supplements, allergens, nutrition details, and checkout validation remain V2.
- Customer queries return only `isAvailable == true` items.
- Customer pages load at most 24 items per request and use Firestore cursors for later pages.
- Search and category criteria are synchronized as URL parameters `search` and `category`.
- Search uses the existing `searchPrefixes` field and `normalizeMenuSearchValue` helper.
- The browser must never render the complete menu in one document.
- Preserve the existing cart store and quick-add flow.
- UI text remains French; code and tests remain in English.
- Do not modify unrelated working-tree changes.
- Do not add popularity ranking without a reliable popularity signal.

---

### Task 1: Add customer menu pagination and category metadata

**Files:**
- Modify: `src/services/food-delivery.service.ts`
- Create: `src/services/__tests__/customer-restaurant-menu.service.test.ts`
- Modify: `firestore.indexes.json` only when the verified query requires a composite index

**Interfaces:**
- Consumes: `MenuItem`, Firestore query primitives, `normalizeMenuSearchValue`, and the existing restaurant collection constants.
- Produces: `getCustomerRestaurantMenuPage(options)` and `getCustomerRestaurantMenuCategories(restaurantId)`.

Use these exact types:

```ts
export interface CustomerRestaurantMenuPageOptions {
  restaurantId: string;
  search?: string;
  category?: string | null;
  cursor?: QueryDocumentSnapshot<DocumentData> | null;
  pageSize?: number;
}

export interface CustomerRestaurantMenuPage {
  items: MenuItem[];
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}

export interface CustomerRestaurantMenuCategory {
  name: string;
  availableCount: number;
}
```

- [ ] **Step 1: Write the failing tests**

Follow the mocks in `src/services/__tests__/food-menu-pagination.service.test.ts`. Test that the first page applies `where('isAvailable', '==', true)`, orders by `category` and `documentId`, and limits to 24. Test that `search: 'Pizza'` applies `where('searchPrefixes', 'array-contains', 'pizza')`, `category: 'Pizzas'` applies the category constraint, and a cursor calls `startAfter`. Test category reduction returns `{ name: 'Pizzas', availableCount: 2 }` for two available pizza documents.

- [ ] **Step 2: Run the tests to verify red**

```bash
npx jest src/services/__tests__/customer-restaurant-menu.service.test.ts --runInBand
```

Expected: FAIL because the new customer functions do not exist.

- [ ] **Step 3: Implement the service functions**

Build customer constraints in this order:

```ts
const constraints: QueryConstraint[] = [where('isAvailable', '==', true)];
const normalizedSearch = normalizeMenuSearchValue(options.search ?? '');
if (normalizedSearch.length >= 2) {
  constraints.push(where('searchPrefixes', 'array-contains', normalizedSearch));
}
if (options.category) constraints.push(where('category', '==', options.category));
constraints.push(orderBy('category', 'asc'), orderBy(documentId(), 'asc'));
```

Bound the public page size between 1 and 24, append `startAfter` when a cursor exists, map document IDs into `MenuItem`, and set `hasMore` when the returned document count equals the bounded page size. For categories, query available documents once, reduce trimmed category names, and return counts without returning full items. Export both functions through `FoodDeliveryService`; leave `getRestaurantMenu` unchanged.

- [ ] **Step 4: Run the tests to verify green**

```bash
npx jest src/services/__tests__/customer-restaurant-menu.service.test.ts --runInBand
```

Expected: all service tests pass.

- [ ] **Step 5: Lint and commit**

```bash
npx eslint src/services/food-delivery.service.ts src/services/__tests__/customer-restaurant-menu.service.test.ts
git add -- src/services/food-delivery.service.ts src/services/__tests__/customer-restaurant-menu.service.test.ts firestore.indexes.json
git commit -m "feat: add paginated customer restaurant menu queries"
```

---

### Task 2: Add the customer menu query hook

**Files:**
- Create: `src/hooks/useCustomerRestaurantMenuQuery.ts`
- Create: `src/hooks/__tests__/useCustomerRestaurantMenuQuery.test.tsx`

**Interfaces:**
- Consumes: the Task 1 service functions and Next navigation hooks.
- Produces: `items`, `categories`, `search`, `category`, `isLoading`, `isLoadingMore`, `error`, `hasMore`, `setSearch`, `setCategory`, `loadMore`, `retry`, and `clearFilters`.

- [ ] **Step 1: Write the failing hook tests**

Mock `useSearchParams`, `useRouter`, `usePathname`, and the Task 1 functions. Cover: initial URL category loads the first page; category metadata loads once; `loadMore` appends without clearing existing items; `setSearch` updates the URL; a stale first request cannot overwrite a newer search response; retry clears the error and refetches.

The first-page assertion must include `pageSize: 24` and the cursor assertion must pass the previous page’s `lastDoc`.

- [ ] **Step 2: Run the tests to verify red**

```bash
npx jest src/hooks/__tests__/useCustomerRestaurantMenuQuery.test.tsx --runInBand
```

Expected: FAIL because the hook does not exist.

- [ ] **Step 3: Implement the hook**

Initialize criteria from `useSearchParams`, debounce criteria changes by 250 ms, reset items and cursor on criteria changes, and protect every fetch with a monotonically increasing request ID. Ignore responses whose ID is no longer current. Use:

```ts
const params = new URLSearchParams();
if (nextSearch) params.set('search', nextSearch);
if (nextCategory) params.set('category', nextCategory);
router.replace(`${pathname}?${params.toString()}`, { scroll: false });
```

`loadMore` must no-op while loading or when `hasMore` is false. `retry` refetches the current criteria from the first page. Categories load once per restaurant ID and are reused during search changes.

- [ ] **Step 4: Run the tests to verify green**

```bash
npx jest src/hooks/__tests__/useCustomerRestaurantMenuQuery.test.tsx --runInBand
```

Expected: all hook tests pass.

- [ ] **Step 5: Commit**

```bash
git add -- src/hooks/useCustomerRestaurantMenuQuery.ts src/hooks/__tests__/useCustomerRestaurantMenuQuery.test.tsx
git commit -m "feat: add customer restaurant menu query hook"
```

---

### Task 3: Build navigation and progressive results components

**Files:**
- Create: `src/components/food/RestaurantMenuNavigation.tsx`
- Create: `src/components/food/RestaurantMenuList.tsx`
- Create: `src/components/food/__tests__/RestaurantMenuNavigation.test.tsx`
- Create: `src/components/food/__tests__/RestaurantMenuList.test.tsx`

**Interfaces:**
- Consumes: Task 2 hook state, `Restaurant`, `MenuItem`, and `MenuItemCard`.
- Produces: accessible sticky search/category controls and a progressive menu list.

- [ ] **Step 1: Write failing component tests**

Assert that navigation renders a searchbox labeled `Rechercher un plat` with placeholder `Rechercher un plat…`, a `Tout` button with `aria-pressed="true"`, category buttons containing counts, and callbacks when search or category changes. Assert that the list renders `MenuItemCard`, a skeleton during initial loading, `Chargement de plats supplémentaires…` during next-page loading, `Afficher plus de plats` when `hasMore`, an error retry button, and `Aucun plat ne correspond à votre recherche.` for an empty filtered result.

- [ ] **Step 2: Run tests to verify red**

```bash
npx jest src/components/food/__tests__/RestaurantMenuNavigation.test.tsx src/components/food/__tests__/RestaurantMenuList.test.tsx --runInBand
```

Expected: FAIL because the components do not exist.

- [ ] **Step 3: Implement `RestaurantMenuNavigation`**

Render a sticky search container, a horizontally scrollable category button group, `aria-pressed` on the active category, category counts, and a reset button only when a criterion is active. Give every control a minimum 44 px touch target and prevent horizontal page overflow.

- [ ] **Step 4: Implement `RestaurantMenuList`**

Render `MenuItemCard` items, initial skeletons, inline next-page loading, retryable error state, empty filtered state, and a `Afficher plus de plats` button. Keep restaurant closed-state logic in `RestaurantClient` so this component cannot enable ordering by itself.

- [ ] **Step 5: Run tests, lint, and commit**

```bash
npx jest src/components/food/__tests__/RestaurantMenuNavigation.test.tsx src/components/food/__tests__/RestaurantMenuList.test.tsx --runInBand
npx eslint src/components/food/RestaurantMenuNavigation.tsx src/components/food/RestaurantMenuList.tsx src/components/food/__tests__/RestaurantMenuNavigation.test.tsx src/components/food/__tests__/RestaurantMenuList.test.tsx
git add -- src/components/food/RestaurantMenuNavigation.tsx src/components/food/RestaurantMenuList.tsx src/components/food/__tests__/RestaurantMenuNavigation.test.tsx src/components/food/__tests__/RestaurantMenuList.test.tsx
git commit -m "feat: add restaurant menu discovery controls"
```

---

### Task 4: Integrate the new flow into `RestaurantClient`

**Files:**
- Modify: `src/app/food/restaurant/[id]/RestaurantClient.tsx`
- Create: `src/app/food/restaurant/[id]/__tests__/RestaurantClient.test.tsx`

**Interfaces:**
- Consumes: Task 2 hook, Task 3 components, `CartDrawer`, `BottomNav`, and `isRestaurantOpenAt`.
- Produces: a restaurant page whose metadata loading is independent from paginated menu loading.

- [ ] **Step 1: Write failing integration tests**

Mock restaurant metadata, the hook, `CartDrawer`, `BottomNav`, and the menu components. Assert that the restaurant heading, searchbox, and category rail render. Assert that when `isRestaurantOpenAt` is false, the closed message renders and no add-to-cart button or `CartDrawer` is exposed.

- [ ] **Step 2: Run tests to verify red**

```bash
npx jest "src/app/food/restaurant/[id]/__tests__/RestaurantClient.test.tsx" --runInBand
```

Expected: FAIL because the page still owns the old `getRestaurantMenu` call and full-menu reducer.

- [ ] **Step 3: Refactor the page**

Keep the restaurant fetch and header. Remove `menuItems` state, the direct `getRestaurantMenu` call, `groupedMenu`, and direct menu mapping. Invoke the hook with the resolved restaurant ID and pass its state into navigation/list components. Keep `CartDrawer` conditional on the restaurant being open, preserve `pb-32`, and keep `BottomNav`.

- [ ] **Step 4: Run tests and lint**

```bash
npx jest "src/app/food/restaurant/[id]/__tests__/RestaurantClient.test.tsx" --runInBand
npx eslint "src/app/food/restaurant/[id]/RestaurantClient.tsx" "src/app/food/restaurant/[id]/__tests__/RestaurantClient.test.tsx"
```

Expected: all tests pass and ESLint exits successfully.

- [ ] **Step 5: Commit**

```bash
git add -- "src/app/food/restaurant/[id]/RestaurantClient.tsx" "src/app/food/restaurant/[id]/__tests__/RestaurantClient.test.tsx"
git commit -m "feat: paginate customer restaurant menus"
```

---

### Task 5: Add mobile E2E coverage

**Files:**
- Create: `e2e/restaurant-menu-discovery.spec.ts`
- Modify: `e2e/helpers/global-setup.ts` only if deterministic menu fixture seeding is required
- Modify: `firestore.rules` only if the verified customer read query needs a rule update

**Interfaces:**
- Consumes: the integrated page and existing emulator setup on port 3001.
- Produces: a browser regression proving search, categories, pagination, and quick add work together.

- [ ] **Step 1: Write the failing Playwright flow**

Seed at least 30 available dishes across `Pizzas`, `Desserts`, and `Boissons`. Test opening the restaurant, filling `Rechercher un plat` with `Margherita`, selecting `Desserts`, clicking `Afficher plus de plats`, and adding `Tiramisu Maison` to the cart. Use deterministic IDs and the existing emulator setup; do not bypass auth rules.

- [ ] **Step 2: Run it to verify red**

```bash
npx playwright test e2e/restaurant-menu-discovery.spec.ts --project=chromium
```

Expected: FAIL against the old page because search, category controls, and pagination are absent.

- [ ] **Step 3: Add only the required test fixture support**

Keep fixture data in the test helper/setup path. Do not add production-only seed behavior.

- [ ] **Step 4: Run it to verify green**

```bash
npx playwright test e2e/restaurant-menu-discovery.spec.ts --project=chromium
```

Expected: the mobile flow passes end-to-end.

- [ ] **Step 5: Run the focused regression set and commit**

```bash
npx jest src/services/__tests__/customer-restaurant-menu.service.test.ts src/hooks/__tests__/useCustomerRestaurantMenuQuery.test.tsx src/components/food/__tests__/RestaurantMenuNavigation.test.tsx src/components/food/__tests__/RestaurantMenuList.test.tsx "src/app/food/restaurant/[id]/__tests__/RestaurantClient.test.tsx" --runInBand
npx eslint src/services/food-delivery.service.ts src/hooks/useCustomerRestaurantMenuQuery.ts src/components/food/RestaurantMenuNavigation.tsx src/components/food/RestaurantMenuList.tsx "src/app/food/restaurant/[id]/RestaurantClient.tsx"
npx playwright test e2e/restaurant-menu-discovery.spec.ts --project=chromium
git add -- e2e/restaurant-menu-discovery.spec.ts e2e/helpers/global-setup.ts firestore.rules
git commit -m "test: cover scalable restaurant menu discovery"
```

---

### Task 6: Final verification and V2 boundary

**Files:**
- Review: all files changed by Tasks 1–5
- Do not modify: `src/types/food-delivery.ts` for V1 modifiers

- [ ] **Step 1: Verify the accumulated diff**

```bash
git diff HEAD~5..HEAD --stat
git status --short
git diff --check HEAD~5..HEAD
```

Expected: only customer menu service, hook, UI components, page integration, tests, verified indexes/rules, and E2E fixtures are included.

- [ ] **Step 2: Run project checks**

```bash
npm run typecheck
npm run lint
npm run test:ci -- --runInBand
```

Expected: new focused checks pass. Record the known Firestore `setImmediate`/timeout failures separately if they remain; do not attribute them to this menu work without evidence.

- [ ] **Step 3: Verify at a 390–430 px viewport**

Confirm search remains reachable after scrolling, category chips do not create page overflow, loading more does not duplicate items, the bottom navigation does not cover the last item, and a closed restaurant never exposes add-to-cart.

- [ ] **Step 4: Record V2 as a separate follow-up**

Create a follow-up plan for modifier groups, supplements, allergens, nutrition, item details, and checkout validation. Do not add those schema or checkout changes to V1.
