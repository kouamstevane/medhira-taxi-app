# Restaurant Approval 400 Error Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent the admin restaurant approval callable from rejecting valid approval requests with HTTP 400.

**Architecture:** Keep the existing callable and admin page flow. Centralize construction of the callable payload in a small pure client helper, omit `reason` for approval, and make the server schema tolerate `null` for backward compatibility while preserving rejection validation.

**Tech Stack:** TypeScript, Next.js App Router, Firebase Functions v2, Zod, Jest.

## Global Constraints

- Preserve unrelated working-tree changes.
- Keep code and code comments in English; keep user-facing UI text in French.
- Do not add direct client-side Firestore writes for admin approval.
- Use conventional commit messages if commits are created.

---

### Task 1: Add regression tests for the payload contract

**Files:**
- Create: `src/services/__tests__/admin-restaurant.service.test.ts`
- Create: `functions/src/admin/__tests__/adminManageRestaurant.test.ts`

**Interfaces:**
- Consumes: `buildAdminRestaurantManagementPayload(action, restaurantId, reason?)` from `src/services/admin-restaurant.service.ts`.
- Produces: Tests that define the required approval and rejection payload behavior before implementation.

- [ ] **Step 1: Write the failing client test**

```typescript
import { buildAdminRestaurantManagementPayload } from '../admin-restaurant.service';

describe('buildAdminRestaurantManagementPayload', () => {
  it('omits reason when approving a restaurant', () => {
    expect(buildAdminRestaurantManagementPayload('approve', 'restaurant-1')).toEqual({
      action: 'approve',
      restaurantId: 'restaurant-1',
    });
  });

  it('trims and includes the rejection reason', () => {
    expect(buildAdminRestaurantManagementPayload('reject', 'restaurant-1', '  Menu incomplet  ')).toEqual({
      action: 'reject',
      restaurantId: 'restaurant-1',
      reason: 'Menu incomplet',
    });
  });
});
```

- [ ] **Step 2: Write the failing callable schema test**

```typescript
import * as adminManageRestaurantModule from '../adminManageRestaurant.js';

type SchemaLike = {
  safeParse: (value: unknown) => { success: boolean };
};

const schema = (adminManageRestaurantModule as typeof adminManageRestaurantModule & {
  ManageRestaurantSchema?: SchemaLike;
}).ManageRestaurantSchema;

describe('ManageRestaurantSchema', () => {
  it('accepts approval payloads serialized with null reason', () => {
    expect(schema?.safeParse({
      action: 'approve',
      restaurantId: 'restaurant-1',
      reason: null,
    }).success).toBe(true);
  });

  it('keeps empty rejection reasons available for callable-level validation', () => {
    expect(schema?.safeParse({
      action: 'reject',
      restaurantId: 'restaurant-1',
      reason: '',
    }).success).toBe(true);
  });
});
```

The second test intentionally checks schema acceptance only; the callable's rejection branch remains responsible for requiring a non-empty reason.

- [ ] **Step 3: Run the focused tests and verify the expected red state**

Run:

```powershell
npm test -- --runInBand src/services/__tests__/admin-restaurant.service.test.ts
npm --prefix functions test -- --runInBand src/admin/__tests__/adminManageRestaurant.test.ts
```

Expected: both tests fail because the new client helper and exported schema do not exist yet.

### Task 2: Implement the minimal payload and schema fix

**Files:**
- Create: `src/services/admin-restaurant.service.ts`
- Modify: `src/app/admin/restaurants/page.tsx:91-100`
- Modify: `functions/src/admin/adminManageRestaurant.ts:7-11`

**Interfaces:**
- Consumes: The failing tests from Task 1.
- Produces: `buildAdminRestaurantManagementPayload(action, restaurantId, reason?)` and an exported `ManageRestaurantSchema` accepting `string | null | undefined` for `reason`.

- [ ] **Step 1: Add the pure client payload helper**

```typescript
export type RestaurantManagementAction = 'approve' | 'reject';

export function buildAdminRestaurantManagementPayload(
  action: RestaurantManagementAction,
  restaurantId: string,
  reason?: string,
): { action: RestaurantManagementAction; restaurantId: string; reason?: string } {
  const payload = { action, restaurantId } as {
    action: RestaurantManagementAction;
    restaurantId: string;
    reason?: string;
  };

  if (action === 'reject') {
    payload.reason = reason?.trim();
  }

  return payload;
}
```

- [ ] **Step 2: Update the admin page to use the helper**

```typescript
const payload = buildAdminRestaurantManagementPayload(
  action,
  restaurantId,
  approve ? undefined : rejectionReason,
);
const result = await adminManageRestaurant(payload);
```

- [ ] **Step 3: Make the callable schema backward-compatible**

```typescript
export const ManageRestaurantSchema = z.object({
  action: z.enum(['approve', 'reject', 'suspend', 'unsuspend']),
  restaurantId: z.string().min(1),
  reason: z.string().optional().nullable(),
});
```

Keep the existing `if (!reason)` checks for `reject` and `suspend`.

- [ ] **Step 4: Run the focused tests and verify green**

Run:

```powershell
npm test -- --runInBand src/services/__tests__/admin-restaurant.service.test.ts
npm --prefix functions test -- --runInBand src/admin/__tests__/adminManageRestaurant.test.ts
```

Expected: all focused tests pass.

### Task 3: Verify the integrated change

**Files:**
- Modify: none unless verification identifies a directly related issue.

**Interfaces:**
- Consumes: The implementation from Task 2.
- Produces: Fresh evidence that the regression is fixed without disturbing unrelated work.

- [ ] **Step 1: Build the Cloud Functions code**

Run: `npm --prefix functions run build`

Expected: TypeScript exits with code 0.

- [ ] **Step 2: Run frontend lint**

Run: `npm run lint`

Expected: ESLint exits with code 0.

- [ ] **Step 3: Run the relevant frontend test suite**

Run: `npm test -- --runInBand src/services/__tests__/admin-restaurant.service.test.ts`

Expected: all tests pass.

- [ ] **Step 4: Inspect the final diff**

Run: `git diff -- src/app/admin/restaurants/page.tsx src/services/admin-restaurant.service.ts src/services/__tests__/admin-restaurant.service.test.ts functions/src/admin/adminManageRestaurant.ts functions/src/admin/__tests__/adminManageRestaurant.test.ts`

Expected: only the approval payload/schema fix and its regression tests are present in the task files.
