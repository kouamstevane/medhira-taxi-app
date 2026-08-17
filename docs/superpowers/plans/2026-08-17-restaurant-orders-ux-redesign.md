# Refonte UX de l’écran des commandes restaurant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre l’écran des commandes restaurant lisible et opérationnel sur mobile, tablette et desktop sans modifier les données ni les transitions métier.

**Architecture:** Conserver `OrdersManagementClient` comme écran et source de l’état local, mais déplacer la définition des regroupements et libellés de filtres dans `orderStatusUi.ts`. Les filtres métier seront des groupes de statuts, tandis qu’un sélecteur conservera l’accès à chaque statut précis.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS v4, Jest, React Testing Library.

## Global Constraints

- Code et commentaires en anglais ; textes affichés à l’utilisateur en français.
- Ne pas modifier `FoodDeliveryService`, `FoodOrder` ou les routes de navigation.
- Conserver toutes les transitions de statut et les boutons de contact existants.
- Les commandes doivent s’empiler sans débordement horizontal sur les petits écrans.
- Utiliser des exports fonctionnels nommés pour les nouveaux helpers.

---

### Task 1: Définir les groupes de filtres métier

**Files:**
- Modify: `src/app/food/portal/[id]/orders/orderStatusUi.ts`
- Test: `src/app/food/portal/[id]/orders/__tests__/orderFilters.test.ts`

**Interfaces:**
- Produces `RESTAURANT_ORDER_FILTER_GROUPS`, `RESTAURANT_ORDER_FILTER_GROUP_LABELS`, `RestaurantOrderFilterGroup`, `getRestaurantOrderFilterGroupLabel` and `getRestaurantOrderFilterStatusSet`.
- Keeps `RESTAURANT_ORDER_FILTERS`, `getRestaurantOrderStatusLabel` and `getRestaurantOrderFilterClassName` available to existing callers.

- [ ] **Step 1: Write the failing tests**

Add tests proving that the five compact groups exist, that all operational statuses are covered by exactly one group, and that `getRestaurantOrderFilterStatusSet('all')` returns `null` while other groups return their explicit status arrays.

```ts
test('groups restaurant statuses into compact operational filters', () => {
  expect(RESTAURANT_ORDER_FILTER_GROUPS).toEqual([
    'all', 'to_process', 'preparing', 'in_delivery', 'completed',
  ]);
  expect(getRestaurantOrderFilterGroupLabel('to_process')).toBe('À traiter');
  expect(getRestaurantOrderFilterStatusSet('completed')).toEqual(['delivered']);
});

test('covers every restaurant status once across non-all groups', () => {
  const groupedStatuses = RESTAURANT_ORDER_FILTER_GROUPS
    .filter((group) => group !== 'all')
    .flatMap((group) => getRestaurantOrderFilterStatusSet(group) ?? []);

  expect(new Set(groupedStatuses).size).toBe(groupedStatuses.length);
  expect(new Set(groupedStatuses)).toEqual(
    new Set(RESTAURANT_ORDER_FILTERS.filter((status) => status !== 'all')),
  );
});
```

- [ ] **Step 2: Run the focused test and verify it fails for the missing group API**

Run: `npm test -- --runInBand src/app/food/portal/[id]/orders/__tests__/orderFilters.test.ts`

Expected: FAIL because the new group exports do not exist yet.

- [ ] **Step 3: Implement the minimal group definitions and helpers**

Add a `RestaurantOrderFilterGroup` union and explicit status arrays in `orderStatusUi.ts`:

```ts
export const RESTAURANT_ORDER_FILTER_GROUPS = [
  'all', 'to_process', 'preparing', 'in_delivery', 'completed',
] as const;

export type RestaurantOrderFilterGroup = typeof RESTAURANT_ORDER_FILTER_GROUPS[number];

export const RESTAURANT_ORDER_FILTER_GROUP_LABELS: Record<RestaurantOrderFilterGroup, string> = {
  all: 'Toutes',
  to_process: 'À traiter',
  preparing: 'En préparation',
  in_delivery: 'En livraison',
  completed: 'Terminées',
};

const RESTAURANT_ORDER_FILTER_STATUS_SETS: Record<Exclude<RestaurantOrderFilterGroup, 'all'>, FoodOrderStatus[]> = {
  to_process: ['pending_payment', 'pending', 'confirmed', 'accepted'],
  preparing: ['preparing', 'ready'],
  in_delivery: ['driver_heading_to_restaurant', 'driver_arrived_restaurant', 'picked_up', 'out_for_delivery', 'arriving', 'delivering'],
  completed: ['delivered', 'no_driver_available', 'cancelled', 'cancelled_by_restaurant'],
};

export function getRestaurantOrderFilterGroupLabel(group: RestaurantOrderFilterGroup): string {
  return RESTAURANT_ORDER_FILTER_GROUP_LABELS[group];
}

export function getRestaurantOrderFilterStatusSet(group: RestaurantOrderFilterGroup): FoodOrderStatus[] | null {
  return group === 'all' ? null : RESTAURANT_ORDER_FILTER_STATUS_SETS[group];
}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `npm test -- --runInBand src/app/food/portal/[id]/orders/__tests__/orderFilters.test.ts`

Expected: PASS with all filter helper assertions green.

- [ ] **Step 5: Commit the filter model**

```bash
git add src/app/food/portal/[id]/orders/orderStatusUi.ts src/app/food/portal/[id]/orders/__tests__/orderFilters.test.ts
git commit -m "feat: group restaurant order filters"
```

### Task 2: Recomposer l’écran des commandes

**Files:**
- Modify: `src/app/food/portal/[id]/orders/OrdersManagementClient.tsx`

**Interfaces:**
- Consumes the group helpers from Task 1.
- Keeps `updateOrderStatus` and all existing `FoodDeliveryService` calls unchanged.

- [ ] **Step 1: Write the failing UI assertions**

Extend the existing orders UI test coverage (or add a colocated test if no component test exists) to assert that the rendered screen contains the five compact filter labels, a `Statut précis` select, and separate `Articles`, `Client`, and `Livraison` regions for a rendered order.

- [ ] **Step 2: Run the focused UI test and verify it fails**

Run: `npm test -- --runInBand src/app/food/portal/[id]/orders`

Expected: FAIL because the current screen renders individual status buttons and does not expose the new structured regions.

- [ ] **Step 3: Implement the compact filter state**

Replace the single `filter` state with a group state and optional exact-status state. Render the group buttons with `role="group"`, then render a labeled native `<select>` for exact statuses. The filtered collection must follow this logic:

```ts
const activeStatuses = exactStatus
  ? [exactStatus]
  : getRestaurantOrderFilterStatusSet(filterGroup);

const filteredOrders = activeStatuses === null
  ? orders
  : orders.filter((order) => activeStatuses.includes(order.status));
```

Selecting a group clears the exact status; selecting `Tous les statuts` clears the exact status and activates `Toutes`.

- [ ] **Step 4: Implement the responsive order hierarchy**

Keep the existing order loop and status/action logic, but restructure the markup into:

```tsx
<article className="glass-card overflow-hidden rounded-2xl border border-white/10">
  <header className="...">
    {/* status icon, order id, timestamp, badge, total */}
  </header>
  <div className="border-b ... p-4">
    {/* transition/refusal action, full width below md */}
  </div>
  <div className="grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_18rem] md:p-5">
    <section aria-labelledby={`order-${order.id}-items`}>{/* Articles */}</section>
    <aside className="space-y-4 md:border-l md:pl-5">{/* Client + Livraison */}</aside>
  </div>
</article>
```

Use `min-w-0`, `flex-wrap`, `w-full`, and `break-words` where needed so long identifiers, addresses, and action labels cannot create horizontal overflow. Preserve the contact launchers and the pickup code.

- [ ] **Step 5: Run focused tests and inspect the diff**

Run: `npm test -- --runInBand src/app/food/portal/[id]/orders`; then run `git diff --check`.

Expected: UI and helper tests pass; no whitespace errors are reported.

- [ ] **Step 6: Commit the redesigned screen**

```bash
git add src/app/food/portal/[id]/orders/OrdersManagementClient.tsx src/app/food/portal/[id]/orders/__tests__
git commit -m "feat: improve restaurant orders layout"
```

### Task 3: Vérification finale

**Files:**
- No source changes expected.

- [ ] **Step 1: Run the focused and full validation commands**

Run:

```bash
npm test -- --runInBand src/app/food/portal/[id]/orders
npm run lint
git diff --check HEAD~2..HEAD
```

Expected: focused tests pass, lint exits with code 0, and `git diff --check` reports no errors.

- [ ] **Step 2: Confirm the responsive contract in source**

Verify the order card contains `md:grid-cols-[minmax(0,1fr)_18rem]`, the action row contains `w-full`, and the filter bar no longer uses an `overflow-x-auto` layout for the primary filters.
