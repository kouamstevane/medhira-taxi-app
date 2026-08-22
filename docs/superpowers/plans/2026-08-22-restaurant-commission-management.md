# Restaurant Commission Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow administrators to set an independent commission percentage for each restaurant while preserving the commission snapshot on existing food orders.

**Architecture:** Extend the existing admin callable `adminManageRestaurant` with a server-validated `set_commission_rate` action. Add the editor to the existing restaurant details drawer. Keep `restaurants/{restaurantId}.commissionRate` as the current rate and keep `food_orders/{orderId}.commissionRate` as the immutable-at-order-creation rate used by settlement.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Firebase Callable Functions, Firestore, Zod, Jest, React Testing Library, Stripe Connect settlement.

## Global Constraints

- Code and comments remain in English; user-facing UI text remains in French.
- The server is authoritative for authentication, authorization, validation, and commission values.
- Valid commission rates are finite numbers from 0 through 100, inclusive.
- A restaurant rate change affects new orders only; existing order snapshots are not migrated or recalculated.
- No Stripe payment API shape changes are required; settlement continues to use the order snapshot.
- Follow the Next.js 16 guidance in `node_modules/next/dist/docs/` before modifying the App Router page.

## File Map

- Modify `functions/src/admin/adminManageRestaurant.ts`: accept and execute the admin commission-rate action.
- Modify `functions/src/admin/__tests__/adminManageRestaurant.test.ts`: validate the callable schema contract.
- Add `functions/src/admin/__tests__/adminManageRestaurantCommission.test.ts`: exercise authorization, persistence, and invalid-rate behavior with the existing Firebase mock style.
- Modify `functions/src/food/foodSettlement.ts`: expose a small order-rate resolver so payment code gives precedence to an existing order snapshot.
- Modify `functions/src/food/__tests__/foodSettlement.test.ts`: cover order snapshot precedence and fallback behavior.
- Modify `functions/src/walletApi/payFoodOrderWithCard.ts`: stop overwriting an existing order snapshot with the restaurant’s newly changed rate.
- Modify `src/app/admin/restaurants/page.tsx`: add draft state, callable save handler, and French commission editor UI.
- Add `src/app/admin/restaurants/__tests__/page.test.tsx`: verify the administrator can see, edit, and save the restaurant rate.

---

### Task 1: Add the server-side commission-rate action

**Files:**
- Modify: `functions/src/admin/adminManageRestaurant.ts`
- Modify: `functions/src/admin/__tests__/adminManageRestaurant.test.ts`
- Test: `functions/src/admin/__tests__/adminManageRestaurantCommission.test.ts`

**Interfaces:**
- Consumes: existing `requireAdmin`, `enforceRateLimit`, Firestore `restaurants` documents, and `CallableRequest`.
- Produces: `adminManageRestaurant({ action: 'set_commission_rate', restaurantId, commissionRate })` returning `{ success: true, commissionRate, message }`.

- [ ] **Step 1: Write the failing schema test**

Add these cases to `functions/src/admin/__tests__/adminManageRestaurant.test.ts`:

```ts
it('accepts a commission-rate update payload', () => {
  expect(schema?.safeParse({
    action: 'set_commission_rate',
    restaurantId: 'restaurant-1',
    commissionRate: 15,
  }).success).toBe(true);
});

it('rejects commission rates outside the inclusive 0-100 range', () => {
  expect(schema?.safeParse({
    action: 'set_commission_rate',
    restaurantId: 'restaurant-1',
    commissionRate: 100.01,
  }).success).toBe(false);
  expect(schema?.safeParse({
    action: 'set_commission_rate',
    restaurantId: 'restaurant-1',
    commissionRate: -0.01,
  }).success).toBe(false);
});
```

- [ ] **Step 2: Run the schema test and verify it fails for the missing action**

Run: `npm --prefix functions test -- --runInBand src/admin/__tests__/adminManageRestaurant.test.ts`

Expected: FAIL because `set_commission_rate` is not in the current action schema.

- [ ] **Step 3: Implement the discriminated callable input and update branch**

Replace the shared action schema with a discriminated union that preserves the current `approve`, `reject`, `suspend`, and `unsuspend` payloads and adds:

```ts
z.object({
  action: z.literal('set_commission_rate'),
  restaurantId: z.string().min(1),
  commissionRate: z.number().finite().min(0).max(100),
})
```

Add a `set_commission_rate` switch branch that calls `restaurantRef.update` with `commissionRate`, `commissionRateUpdatedAt: now`, `commissionRateUpdatedBy: uid`, and `updatedAt: now`, then returns the saved rate and a French success message. Keep the existing admin check and rate limiter before parsing.

- [ ] **Step 4: Add callable behavior tests before running the implementation**

Create `functions/src/admin/__tests__/adminManageRestaurantCommission.test.ts` using the same mocked `firebase-admin`, `onCall`, `requireAdmin`, and `enforceRateLimit` setup already present in `adminManageRestaurantEmail.test.ts`. Cover:

```ts
it('stores the requested rate and audit fields', async () => {
  restaurantRef.get.mockResolvedValue({ exists: true, data: () => ({ name: 'Restaurant A' }) });
  await handler(makeRequest({ action: 'set_commission_rate', restaurantId: 'restaurant-1', commissionRate: 15 }));
  expect(restaurantRef.update).toHaveBeenCalledWith(expect.objectContaining({
    commissionRate: 15,
    commissionRateUpdatedAt: 'SERVER_TIMESTAMP',
    commissionRateUpdatedBy: 'admin-1',
    updatedAt: 'SERVER_TIMESTAMP',
  }));
});

it('rejects an invalid rate without updating Firestore', async () => {
  await expect(handler(makeRequest({ action: 'set_commission_rate', restaurantId: 'restaurant-1', commissionRate: 101 })))
    .rejects.toMatchObject({ code: 'invalid-argument' });
  expect(restaurantRef.update).not.toHaveBeenCalled();
});

it('rejects a missing restaurant', async () => {
  restaurantRef.get.mockResolvedValue({ exists: false });
  await expect(handler(makeRequest({ action: 'set_commission_rate', restaurantId: 'missing', commissionRate: 5 })))
    .rejects.toMatchObject({ code: 'not-found' });
});
```

Mock `requireAdmin` rejection in one additional test and assert the callable returns `permission-denied` without reading or writing the restaurant document.

- [ ] **Step 5: Run the backend tests and verify they pass**

Run: `npm --prefix functions test -- --runInBand src/admin/__tests__/adminManageRestaurant.test.ts src/admin/__tests__/adminManageRestaurantCommission.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the server action**

```bash
git add functions/src/admin/adminManageRestaurant.ts functions/src/admin/__tests__/adminManageRestaurant.test.ts functions/src/admin/__tests__/adminManageRestaurantCommission.test.ts
git commit -m "feat: add restaurant commission admin action"
```

### Task 2: Preserve the commission snapshot through card payment

**Files:**
- Modify: `functions/src/food/foodSettlement.ts`
- Modify: `functions/src/food/__tests__/foodSettlement.test.ts`
- Modify: `functions/src/walletApi/payFoodOrderWithCard.ts`

**Interfaces:**
- Consumes: an order commission value and a restaurant commission value, either of which may be absent in legacy documents.
- Produces: `resolveFoodOrderCommissionRate(orderRate: unknown, restaurantRate: unknown): number`, with the order value taking precedence when it is finite.

- [ ] **Step 1: Write the failing precedence tests**

Add to `functions/src/food/__tests__/foodSettlement.test.ts`:

```ts
test('keeps the commission captured on an existing order', () => {
  expect(resolveFoodOrderCommissionRate(15, 5)).toBe(15);
});

test('falls back to the current restaurant rate for legacy orders without a snapshot', () => {
  expect(resolveFoodOrderCommissionRate(undefined, 10)).toBe(10);
});
```

Import `resolveFoodOrderCommissionRate` from `../foodSettlement.js`.

- [ ] **Step 2: Run the settlement tests and verify they fail**

Run: `npm --prefix functions test -- --runInBand src/food/__tests__/foodSettlement.test.ts`

Expected: FAIL because the resolver does not exist.

- [ ] **Step 3: Implement the resolver and use it in card payment**

Add the resolver to `functions/src/food/foodSettlement.ts`:

```ts
export function resolveFoodOrderCommissionRate(orderRate: unknown, restaurantRate: unknown): number {
  const preferredRate = typeof orderRate === 'number' && Number.isFinite(orderRate)
    ? orderRate
    : typeof restaurantRate === 'number' && Number.isFinite(restaurantRate)
      ? restaurantRate
      : undefined;
  return resolveRestaurantCommissionRate(preferredRate);
}
```

Import it into `payFoodOrderWithCard.ts` and replace the unconditional restaurant-rate assignment with the resolver using `verifiedOrder.order.commissionRate` first and `verifiedOrder.order.restaurant.commissionRate` as the legacy fallback. This ensures changing a restaurant’s rate before payment cannot rewrite a previously created order’s snapshot.

- [ ] **Step 4: Run the settlement tests and backend typecheck**

Run: `npm --prefix functions test -- --runInBand src/food/__tests__/foodSettlement.test.ts` and `npm --prefix functions run build`.

Expected: PASS and TypeScript compilation succeeds.

- [ ] **Step 5: Commit snapshot preservation**

```bash
git add functions/src/food/foodSettlement.ts functions/src/food/__tests__/foodSettlement.test.ts functions/src/walletApi/payFoodOrderWithCard.ts
git commit -m "fix: preserve food order commission snapshots"
```

### Task 3: Add the administrator editor to the restaurant page

**Files:**
- Modify: `src/app/admin/restaurants/page.tsx`
- Test: `src/app/admin/restaurants/__tests__/page.test.tsx`

**Interfaces:**
- Consumes: `selectedRestaurant`, `httpsCallable(functions, 'adminManageRestaurant')`, and `Restaurant.commissionRate`.
- Produces: a French form that sends `{ action: 'set_commission_rate', restaurantId, commissionRate }` and updates local state only after success.

- [ ] **Step 1: Write the failing UI test**

Create the page test with mocks for Firebase queries, `httpsCallable`, `useAdminAuth`, `FoodDeliveryService.getPendingRestaurants`, `AdminHeader`, `BottomNav`, `Image`, and `toast`. Render the page with an approved restaurant containing `commissionRate: 15`, click its details control, change the commission input to `10`, click `Enregistrer la commission`, and assert:

```ts
expect(callable).toHaveBeenCalledWith({
  action: 'set_commission_rate',
  restaurantId: 'restaurant-1',
  commissionRate: 10,
});
expect(toast.success).toHaveBeenCalledWith('Commission mise à jour.');
```

Add a second test that enters `101`, clicks save, and asserts the callable is not called and the page displays the French validation message.

- [ ] **Step 2: Run the page test and verify it fails**

Run: `npm test -- --runInBand src/app/admin/restaurants/__tests__/page.test.tsx`

Expected: FAIL because the page has no commission input or save handler.

- [ ] **Step 3: Implement draft state and save behavior**

Add a commission draft state initialized when a restaurant is selected. Add `handleCommissionRateSave` that:

1. Verifies `auth.currentUser`.
2. Converts the draft to a number and rejects non-finite values outside 0-100 with a French toast.
3. Sets the existing processing state for that restaurant.
4. Calls `adminManageRestaurant` with `set_commission_rate` and the numeric rate.
5. Updates both `restaurants` and `selectedRestaurant` with the returned rate only after success.
6. Displays `Commission mise à jour.` and clears processing in `finally`.

Add a commission section to the selected restaurant drawer for every restaurant status, with a number input using `min={0}`, `max={100}`, `step={0.01}`, an adjacent `%`, and an `Enregistrer la commission` button. Keep the approval/rejection section unchanged for pending restaurants.

- [ ] **Step 4: Run the page test and verify it passes**

Run: `npm test -- --runInBand src/app/admin/restaurants/__tests__/page.test.tsx`.

Expected: PASS with no console errors.

- [ ] **Step 5: Commit the administrator interface**

```bash
git add src/app/admin/restaurants/page.tsx src/app/admin/restaurants/__tests__/page.test.tsx
git commit -m "feat: add restaurant commission editor"
```

### Task 4: Full verification and handoff

**Files:**
- Verify: all files changed by Tasks 1-3.

- [ ] **Step 1: Run targeted backend tests**

Run: `npm --prefix functions test -- --runInBand src/admin/__tests__/adminManageRestaurant.test.ts src/admin/__tests__/adminManageRestaurantCommission.test.ts src/food/__tests__/foodSettlement.test.ts`.

Expected: PASS.

- [ ] **Step 2: Run the frontend page test and typecheck**

Run: `npm test -- --runInBand src/app/admin/restaurants/__tests__/page.test.tsx` and `npm run typecheck`.

Expected: PASS with no TypeScript errors.

- [ ] **Step 3: Run lint and production builds**

Run: `npm run lint` and `npm --prefix functions run build`.

Expected: both commands complete successfully. Fix only issues caused by this feature before proceeding.

- [ ] **Step 4: Inspect the final diff and repository state**

Run: `git diff HEAD~3..HEAD --check` and `git status --short`.

Expected: no whitespace errors and no unintended files changed.

- [ ] **Step 5: Commit any final verification-only corrections**

```bash
git add functions/src src/app/admin/restaurants
git commit -m "test: verify restaurant commission management"
```

