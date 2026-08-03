# Admin Drivers Dynamic Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with review checkpoints.

**Goal:** Make `/admin/drivers/` reflect live Firestore data consistently across applications, driver statuses, counters, search, filters, and pagination.

**Architecture:** Keep Firebase listeners in the page, but subscribe to the complete admin driver collection and derive the visible list from pure filtering/counting helpers. Synchronize `driverApplications` with the driver record inside the admin callable by normalized email, while the page also hides legacy applications whose matching driver is already reviewed. No Firestore schema or security-rule changes are required.

**Tech Stack:** Next.js App Router, React, TypeScript, Firebase Firestore client/Admin SDK, Jest, React Testing Library.

## Global Constraints

- Code and comments remain in English; user-facing copy remains in French.
- Admin-only reads and writes continue to use existing guards and callable functions.
- Driver documents, action payloads, rejection reasons, and existing navigation behavior remain unchanged.
- Dynamic counters must be derived from the same complete driver dataset used by the page.
- Tests must cover the red-green cycle for filtering, counts, legacy application hiding, and server synchronization payloads.

## File Map

- Create: `src/app/admin/drivers/adminDriversData.ts` — pure filtering, counting, normalization, and legacy-application reconciliation helpers.
- Create: `src/app/admin/drivers/adminDriversData.test.ts` — unit tests for the page data contract.
- Modify: `src/app/admin/drivers/page.tsx` — real-time full collection listener, derived search/filter/pagination, accurate counters, stale drawer synchronization, and application reconciliation.
- Create: `functions/src/admin/driverApplicationSync.ts` — admin-side application status synchronization and update-payload builder.
- Create: `functions/src/admin/__tests__/driverApplicationSync.test.ts` — tests for normalized email matching and review update payloads.
- Modify: `functions/src/admin/adminManageDriver.ts` — call application synchronization after approve/reject without making a successful driver action depend on a notification/sync failure.

### Task 1: Add tested page data helpers

**Files:**
- Create: `src/app/admin/drivers/adminDriversData.ts`
- Create: `src/app/admin/drivers/adminDriversData.test.ts`

**Interfaces:**

```ts
export type AdminDriverStatus = 'pending' | 'approved' | 'rejected' | 'available' | 'offline' | 'busy' | 'action_required' | 'suspended';
export type AdminDriverType = 'chauffeur' | 'livreur' | 'les_deux';
export interface DriverListFilters { status: 'all' | 'pending' | 'approved' | 'rejected'; driverType: 'all' | AdminDriverType; search: string; }
export function normalizeAdminEmail(value?: string): string;
export function filterAdminDrivers<T extends AdminDriverRecord>(drivers: T[], filters: DriverListFilters): T[];
export function countAdminDriversByStatus<T extends Pick<AdminDriverRecord, 'status'>>(drivers: T[]): Record<'all' | 'pending' | 'approved' | 'rejected', number>;
export function hideReviewedDriverApplications<TApplication extends { email?: string }, TDriver extends { email?: string; status: string }>(applications: TApplication[], drivers: TDriver[]): TApplication[];
```

- [ ] **Step 1: Write failing tests** for normalized case/whitespace email matching, search across name/email/phone, status/type filtering, exact status counts, and hiding an application when a same-email driver is approved/rejected/active.
- [ ] **Step 2: Run** `npx jest src/app/admin/drivers/adminDriversData.test.ts --runInBand` and confirm the tests fail because the helper module is absent.
- [ ] **Step 3: Implement the minimal pure helpers** with case-insensitive trimmed search and deterministic filtering.
- [ ] **Step 4: Run** the same Jest command and confirm all helper tests pass.

### Task 2: Make the admin page derive all visible data from live drivers

**Files:**
- Modify: `src/app/admin/drivers/page.tsx`
- Test: `src/app/admin/drivers/adminDriversData.test.ts`

**Interfaces:** The page imports the helpers from Task 1 and keeps `drivers` as the complete live snapshot. `filteredDrivers` and `visibleApplications` are derived values, not duplicated state.

- [ ] **Step 1: Add the failing regression assertions** for the helper behavior that the page will consume: approved same-email applications are hidden and all status counters include records outside the current page.
- [ ] **Step 2: Replace the limited driver listener** with `onSnapshot(query(collection(db, 'drivers'), orderBy('createdAt', 'desc')), ...)`; remove server-side pagination state and `getDocs`/`startAfter` loading.
- [ ] **Step 3: Add `searchTerm` state** and derive `filteredDrivers` through `filterAdminDrivers`; wire the search input to `value`, `onChange`, and an accessible label; remove the inactive filter-list button.
- [ ] **Step 4: Derive status counters** with `countAdminDriversByStatus(drivers)` and render those values independently of the selected status, type, search, or local page.
- [ ] **Step 5: Apply type/status/search filtering before local pagination**, reset `currentPage` when any filter changes, and render previous/next controls based on `filteredDrivers.length`.
- [ ] **Step 6: Remove the application query limit**, derive `visibleApplications` with `hideReviewedDriverApplications`, and use its length everywhere in the pending-application summary/card.
- [ ] **Step 7: Add the `suspended` status to the page type/badge map and synchronize `selectedDriver` from the live driver snapshot** when another admin changes the selected record.
- [ ] **Step 8: Run** `npx jest src/app/admin/drivers/adminDriversData.test.ts src/app/admin/drivers/adminDriversActions.test.ts src/app/admin/drivers/adminDriversUi.test.ts --runInBand` and `npm run typecheck`.

### Task 3: Synchronize applications after admin review

**Files:**
- Create: `functions/src/admin/driverApplicationSync.ts`
- Create: `functions/src/admin/__tests__/driverApplicationSync.test.ts`
- Modify: `functions/src/admin/adminManageDriver.ts`

**Interfaces:**

```ts
export type DriverApplicationReviewStatus = 'approved' | 'rejected';
export function buildDriverApplicationReviewUpdate(input: { status: DriverApplicationReviewStatus; driverId: string; adminUid: string; reason?: string }): Record<string, unknown>;
export async function syncDriverApplicationStatus(input: { driverEmail?: string; driverId: string; adminUid: string; status: DriverApplicationReviewStatus; reason?: string }): Promise<number>;
```

- [ ] **Step 1: Write failing tests** for trimmed/lowercased email matching inputs and review update payloads, including `reviewedAt`, `reviewedBy`, `driverId`, and an optional rejection reason only for rejected applications.
- [ ] **Step 2: Run** `npm --prefix functions test -- --runInBand src/admin/__tests__/driverApplicationSync.test.ts` and confirm the expected failure.
- [ ] **Step 3: Implement** the helper with Admin SDK query by normalized email, filter only `pending_review` records in memory, and batch-update all matching legacy/current application records.
- [ ] **Step 4: Call the helper** after the driver `approve` and `reject` writes in `adminManageDriver`; log a warning on sync failure while preserving the successful driver action result.
- [ ] **Step 5: Run** the targeted functions test and the existing admin rejection test.

### Task 4: Final verification and integration

**Files:**
- Modify only files from Tasks 1–3 if verification exposes a defect.

- [ ] **Step 1: Run** `git diff --check`.
- [ ] **Step 2: Run** `npx jest src/app/admin/drivers/adminDriversData.test.ts src/app/admin/drivers/adminDriversActions.test.ts src/app/admin/drivers/adminDriversUi.test.ts --runInBand`.
- [ ] **Step 3: Run** `npm --prefix functions test -- --runInBand src/admin/__tests__/driverApplicationSync.test.ts src/admin/__tests__/adminDriverRejection.test.ts`.
- [ ] **Step 4: Run** `npm run typecheck` and `npm --prefix functions run build`.
- [ ] **Step 5: Inspect the page at mobile width and verify the dynamic search, counters, filters, reviewed application removal, and pagination without submitting a destructive action.
- [ ] **Step 6: Commit with** `feat: make admin driver data live and consistent`.

## Self-review

- Every issue found in the audit maps to a task: stale application status (Tasks 2–3), inaccurate counters (Task 2), nonfunctional search/filter control (Task 2), type-filter pagination (Task 2), capped applications (Task 2), and stale selected drawer data (Task 2).
- No Firestore schema or security-rule change is proposed.
- The helper signatures use the same status/type values as the page and backend review actions.
