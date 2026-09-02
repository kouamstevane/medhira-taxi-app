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
