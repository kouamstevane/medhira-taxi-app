# Task 6 Report: Admin Personal Driver Plan Editor

## Status

Implemented. The report is intentionally not staged or committed per the follow-up instruction to exclude `.superpowers` reports from the commit.

## Files

- Created: `src/app/admin/personal-driver/PersonalDriverPlansEditor.tsx`
- Created: `src/app/admin/personal-driver/PersonalDriverPlansEditor.test.tsx`
- Modified: `src/app/admin/personal-driver/PersonalDriverAdminPageClient.tsx`
- Modified: `src/app/admin/personal-driver/PersonalDriverAdminPageClient.test.tsx`

## TDD Evidence

### RED

Command:

```powershell
npx jest src/app/admin/personal-driver/PersonalDriverPlansEditor.test.tsx src/app/admin/personal-driver/PersonalDriverAdminPageClient.test.tsx --runInBand
```

Result: exit 1.

Observed failures:

- `PersonalDriverPlansEditor.test.tsx`: `Cannot find module './PersonalDriverPlansEditor'`
- `PersonalDriverAdminPageClient.test.tsx`: `Unable to find role="heading" and name "Forfaits Personal Driver"`
- Summary: 2 failed suites, 1 failed test, 1 passed test.

### GREEN

Command:

```powershell
npx jest src/app/admin/personal-driver/PersonalDriverPlansEditor.test.tsx src/app/admin/personal-driver/PersonalDriverAdminPageClient.test.tsx --runInBand
```

Result: exit 0.

Summary:

- Test Suites: 2 passed, 2 total
- Tests: 8 passed, 8 total
- Time: 11.64 s

## Implementation Summary

- Added a client-side `PersonalDriverPlansEditor` that loads the existing Personal Driver catalogue with `getPersonalDriverPlans`.
- Keeps editable draft state as `Record<PersonalDriverPlanId, PersonalDriverPlan>`.
- Renders all three plan cards with full editable plan fields: name, badge, promise, every numeric field, seven weekday checkboxes, benefit add/remove controls, reset, save, and audit metadata display.
- Uses the existing Firebase callable pattern with `httpsCallable(functions, 'adminManagePersonalDriver')`.
- Sends plan updates with action `updatePlan` and the full normalized edited plan.
- Validates client-side before calling Firebase and shows field-level `role="alert"` messages in French.
- Preserves edited drafts after callable failures and shows a French alert from `getUserFacingCallableError`.
- Mounts the editor below the admin heading without changing assignment or emergency reassignment actions.

## Verification

Focused editor/admin tests:

```powershell
npx jest src/app/admin/personal-driver/PersonalDriverPlansEditor.test.tsx src/app/admin/personal-driver/PersonalDriverAdminPageClient.test.tsx --runInBand
```

Result: PASS, exit 0. Test Suites: 2 passed, 2 total. Tests: 8 passed, 8 total. Time: 11.64 s.

Admin folder tests:

```powershell
npx jest src/app/admin/personal-driver --runInBand
```

Result: PASS, exit 0. Test Suites: 2 passed, 2 total. Tests: 8 passed, 8 total. Time: 11.046 s.

Personal-driver lint script:

```powershell
npm run lint:personal-driver
```

Result: PASS, exit 0. No diagnostics printed.

Touched admin-file lint check:

```powershell
npx eslint src/app/admin/personal-driver/PersonalDriverPlansEditor.tsx src/app/admin/personal-driver/PersonalDriverPlansEditor.test.tsx src/app/admin/personal-driver/PersonalDriverAdminPageClient.tsx src/app/admin/personal-driver/PersonalDriverAdminPageClient.test.tsx
```

Result: PASS, exit 0. No diagnostics printed.

Typecheck:

```powershell
npm run typecheck
```

First result: exit 1 before TypeScript ran. The pre-step `scripts/clean-next-dev-cache.mjs` failed with `ENOTEMPTY: directory not empty, rmdir 'C:\Users\User\Documents\AlloTraining\medjira-taxi-app\.next\dev'`.

Retry result: PASS, exit 0. No diagnostics printed.

## Self-Review

- Confirmed the update payload includes the full edited plan, not only the changed field.
- Confirmed Premium minimum amount changing to `800` sends `{ action: 'updatePlan', plan: { ...premiumPlan, minimumAmount: 800 } }`.
- Confirmed rejected callable errors leave edited values visible and save remains available for retry.
- Confirmed reset restores the last loaded/saved plan and does not call the callable.
- Confirmed weekday toggles and benefit add/remove controls affect the saved draft payload.
- Confirmed disabled save behavior for unchanged plans.
- Confirmed audit metadata renders when provided by loader-compatible data and falls back to a French empty state otherwise.
- Confirmed operational admin actions remain present and disabled under the same empty-selection conditions as before.

## Concerns

- The requested `lint:personal-driver` script does not include `src/app/admin/personal-driver`, so I also ran a direct ESLint command against the four touched admin files.
- `npm run typecheck` had one transient generated-cache cleanup failure on `.next/dev`; retry passed and produced no TypeScript diagnostics.
- Pre-existing unrelated dirty files remain in `.superpowers/sdd/task-2-report.md`, `.superpowers/sdd/task-3-report.md`, and `.superpowers/sdd/task-4-report.md`.
- Context7 documentation lookup failed with `fetch failed`; local Next 16 docs from `node_modules/next/dist/docs` were read instead.

## Review-Fix Addendum

Date: 2026-09-03

### RED

Added focused regression tests covering:

- Firestore-loaded personal driver plans preserving `updatedAt` / `updatedBy` through the loader return shape.
- The editor reloading the catalogue after a successful save and displaying server-provided audit metadata.
- Client-side rejection of `minimumBillableKm > 100000` before invoking the callable.

The first run of the focused suite failed for the intended reasons:

- Loader audit metadata was still missing from `getPersonalDriverPlans()`.
- The editor only called the loader once after save and still used the fabricated audit string.
- `minimumBillableKm > 100000` was still accepted client-side.

### GREEN

Implemented the minimal fix:

- Extended the personal-driver plans result contract with optional audit metadata.
- Preserved `updatedAt` / `updatedBy` from Firestore documents in the loader result.
- Reloaded the catalogue after a successful callable save and used the returned metadata instead of fabricating `Mise à jour serveur`.
- Added the missing upper bound check for `minimumBillableKm`.

Verification:

- `npx jest src/services/personal-driver/plan-config.service.test.ts src/app/admin/personal-driver/PersonalDriverPlansEditor.test.tsx --runInBand`
  - PASS, 13 tests
- `npx jest src/app/admin/personal-driver --runInBand`
  - PASS, 9 tests
- `npm run typecheck`
  - PASS
- `npm run lint:personal-driver`
  - PASS

## Review-Fix Addendum 2026-09-03

### RED

Added a regression test to `src/app/admin/personal-driver/PersonalDriverPlansEditor.test.tsx` that reproduces the review finding:

- initial load returns the current Premium plan,
- saving the edited `minimumAmount: 800` succeeds,
- the post-save reload falls back with an error,
- the editor must keep the Premium draft at `800`, preserve the audit metadata, and show a French synchronization warning.

The first focused run failed for the intended reason:

- `npx jest src/app/admin/personal-driver/PersonalDriverPlansEditor.test.tsx --runInBand`
  - FAIL
  - The sync warning was missing, so the test could not find the expected French message.

### GREEN

Updated `src/app/admin/personal-driver/PersonalDriverPlansEditor.tsx` so post-save reload failures:

- keep the normalized saved plan in `drafts` and `savedPlans`,
- preserve existing audit state,
- surface a non-blocking French warning,
- still hydrate normally when the reload succeeds.

Verification:

- `npx jest src/app/admin/personal-driver/PersonalDriverPlansEditor.test.tsx --runInBand`
  - PASS, 8 tests
- `npx jest src/app/admin/personal-driver src/services/personal-driver/plan-config.service.test.ts --runInBand`
  - PASS, 16 tests
- `npm run typecheck`
  - PASS

### Commit Scope

The follow-up fix stayed scoped to the admin personal-driver editor, its loader contract, shared personal-driver types, and the related focused tests/report.
