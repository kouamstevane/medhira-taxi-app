# Task 1 Report: Editable Personal Driver Plans

## Outcome

Implemented the typed personal-driver plan catalogue loader with Firestore fallback behavior, static defaults, and validation for plan overrides.

## RED Evidence

Focused test command:

```bash
npx jest src/services/personal-driver/plan-config.service.test.ts --runInBand
```

Observed failure before implementation:

```text
Cannot find module './plan-config.service' from 'src/services/personal-driver/plan-config.service.test.ts'
```

The test suite failed for all 3 tests because the loader module did not exist yet, which matched the expected red state.

## GREEN Evidence

Focused test command after implementation:

```bash
npx jest src/services/personal-driver/plan-config.service.test.ts --runInBand
```

Result:

```text
Test Suites: 1 passed, 1 total
Tests: 3 passed, 3 total
```

Regression command from the brief:

```bash
npx jest src/services/personal-driver/plan-config.service.test.ts src/services/personal-driver/pricing.service.test.ts --runInBand
```

Result:

```text
Test Suites: 2 passed, 2 total
Tests: 8 passed, 8 total
```

## Files Changed

- `src/types/personal-driver.ts`
- `src/services/personal-driver/plans.ts`
- `src/services/personal-driver/plan-config.service.ts`
- `src/services/personal-driver/plan-config.service.test.ts`
- `.superpowers/sdd/task-1-report.md`

## What Changed

- Added `PERSONAL_DRIVER_PLAN_IDS` for the fixed `basic`, `classic`, and `premium` catalogue order.
- Added `PersonalDriverPlanDocument` with optional `updatedAt` and `updatedBy` metadata.
- Added `PersonalDriverPlansResult` for the loader return shape.
- Implemented `normalizePersonalDriverPlan(planId, raw)` to merge valid Firestore overrides over the static defaults.
- Implemented `getPersonalDriverPlans()` to read `personal_driver_plans`, accept only the fixed IDs, and return static fallback plans plus the read error when Firestore access fails.
- Added tests for:
  - Premium override merging with missing plan fallback.
  - Invalid plan data falling back to the static default.
  - Firestore read failure returning fallback plans and the thrown error.

## Self-Review

- The loader is intentionally conservative: any invalid field in a plan document causes that document to fall back to the static default.
- The service only accepts the three known plan IDs and ignores extra documents in the collection.
- Static plan values remain the fallback source of truth when Firestore data is absent or unusable.

## Concerns

- The validation accepts finite non-negative numeric overrides for price and amount fields, which matches the task brief, but the domain may later want tighter integer-only rules for count-like fields.
- The new loader is not yet wired into any consuming UI or service entry point in this task; that integration is likely part of a later step.

## Fix Follow-Up

Reviewer finding addressed:

- `plan-config.service.ts` was returning `PERSONAL_DRIVER_PLANS` fallback objects and nested arrays by shared reference.
- A consumer could mutate `allowedWeekdays` or `benefits` on a returned fallback plan and corrupt future callers.
- Extra Firestore document IDs were also verified to stay out of the returned catalogue.

## RED Evidence

Focused regression command before the fix:

```bash
npx jest src/services/personal-driver/plan-config.service.test.ts --runInBand
```

Observed failure:

```text
FAIL src/services/personal-driver/plan-config.service.test.ts
  ● personal driver plan catalogue loader › keeps fallback plans and static defaults isolated from consumer mutation

    expect(received).toEqual(expected) // deep equality

    - Expected  - 0
    + Received  + 1

    @@ -2,6 +2,7 @@
        1,
        2,
        3,
        4,
        5,
    +   6,
```

That failure showed the returned fallback plan was sharing state with the exported static defaults.

## GREEN Evidence

Focused regression command after the fix:

```bash
npx jest src/services/personal-driver/plan-config.service.test.ts --runInBand
```

Result:

```text
Test Suites: 1 passed, 1 total
Tests: 5 passed, 5 total
```

Paired task command from the brief after the fix:

```bash
npx jest src/services/personal-driver/plan-config.service.test.ts src/services/personal-driver/pricing.service.test.ts --runInBand
```

Result:

```text
Test Suites: 2 passed, 2 total
Tests: 10 passed, 10 total
```

## Changed Files

- `src/services/personal-driver/plan-config.service.ts`
- `src/services/personal-driver/plan-config.service.test.ts`
- `.superpowers/sdd/task-1-report.md`

## What Changed in the Fix

- Added deep-clone helpers for single plans and plan maps so returned data no longer shares arrays with `PERSONAL_DRIVER_PLANS`.
- Kept the Firestore merge behavior unchanged apart from cloning, so pricing and validation logic stayed intact.
- Added a regression test that mutates a returned fallback plan and proves both the static defaults and a subsequent load stay unchanged.
- Added a focused regression test showing an extra Firestore document ID is ignored and does not appear in the returned catalogue.

## Self-Review

- The fix is narrowly scoped to reference isolation and catalogue membership.
- The fallback path now returns cloned plan data, so consumers can mutate their copy without corrupting future loads.
- The Firestore-loaded path now returns cloned plan data as well, which keeps behavior consistent across all source modes.

## Concerns After Fix

- The loader still performs a shallow merge of scalar fields over a cloned base plan, which is appropriate for the current plan shape but should be revisited if nested objects are added later.
- The existing test harness emits verbose logging, so the Jest output is noisier than ideal, but the assertions and pass/fail signal remain clear.
