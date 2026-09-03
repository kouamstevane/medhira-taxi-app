# Task 2 Report

Status: complete

Commit(s):
- `f90940e` - `feat: load personal driver plans in backend pricing`

Changed files:
- `functions/src/personalDriver/planConfig.ts`
- `functions/src/personalDriver/__tests__/planConfig.test.ts`
- `functions/src/personalDriver/pricing.ts`
- `functions/src/personalDriver/__tests__/pricing.test.ts`

RED evidence:

1. Complete backend plan shape was missing.

Command:

```bash
npm --prefix functions test -- --runInBand src/personalDriver/__tests__/planConfig.test.ts src/personalDriver/__tests__/pricing.test.ts
```

Output:

```text
FAIL src/personalDriver/__tests__/planConfig.test.ts
  personal driver backend plan config › includes the complete client-facing plan fields in backend defaults

    expect(received).toMatchObject(expected)

    Expected object contained id/name/badge/promise/includedRegularWaitMinutes/benefits.
    Received object only contained allowedWeekdays/includedSpecialTrips/minimumAmount/minimumBillableKm/pricePerKm.

Test Suites: 1 failed, 1 passed, 2 total
Tests:       1 failed, 3 passed, 4 total
Time:        15.318 s, estimated 17 s
```

2. Injected special-trip configuration was not exposed by backend price results.

Command:

```bash
npm --prefix functions test -- --runInBand src/personalDriver/__tests__/planConfig.test.ts src/personalDriver/__tests__/pricing.test.ts
```

Output:

```text
FAIL src/personalDriver/__tests__/pricing.test.ts
  Test suite failed to run

    src/personalDriver/__tests__/pricing.test.ts:39:33 - error TS2339:
    Property 'includedSpecialTrips' does not exist on type 'PersonalDriverPlanPrice'.

Test Suites: 1 failed, 1 passed, 2 total
Tests:       2 passed, 2 total
Time:        13.584 s, estimated 17 s
```

GREEN evidence:

Command:

```bash
npm --prefix functions test -- --runInBand src/personalDriver/__tests__/planConfig.test.ts src/personalDriver/__tests__/pricing.test.ts
```

Output:

```text
Test Suites: 2 passed, 2 total
Tests:       4 passed, 4 total
Snapshots:   0 total
Time:        15.806 s
Ran all test suites matching src/personalDriver/__tests__/planConfig.test.ts|src/personalDriver/__tests__/pricing.test.ts.
```

Build evidence:

Command:

```bash
npm --prefix functions run build
```

Output:

```text
> build
> tsc
```

Result: exit code 0 in 29.1766 seconds.

Self-review:
- Added `DEFAULT_PERSONAL_DRIVER_PLANS` with the full backend/client plan shape, including `id`, display text, included regular wait minutes, benefits, and `includedSpecialTrips`.
- Added `getConfiguredPersonalDriverPlans(db)` to read fixed `personal_driver_plans` IDs through the Admin SDK, merge valid document fields over defaults, clone arrays, ignore unknown IDs, and fall back to defaults for missing, invalid, or failed reads.
- Updated `calculatePersonalDriverPrices(input, plans)` so callers can inject a plan map and the returned plan price carries `includedSpecialTrips` from the selected configured plan.
- Kept type re-exports from `pricing.ts` so existing backend imports continue to compile.

Concerns:
- Existing create/renew subscription functions still import `SPECIAL_TRIP_LIMITS` from `pricing.ts`; this task was limited to the four owned files, so wiring those callable flows to fetch Firestore plans is not included here.
- A repo-related Next dev server was visible during the final process check, but no hanging Jest, `tsc`, or `npm --prefix functions` test/build process was found.
- Git reported CRLF normalization warnings while staging the four files.

## Task 2 Review Fix - 2026-09-02

Status: complete

Reviewer finding fixed:
- `functions/src/personalDriver/pricing.ts` now prices every configured plan with `Math.max(minimumAmount, monthlyDistanceKm * pricePerKm)` and no longer forces `minimumAmount` solely because `monthlyDistanceKm < minimumBillableKm`.

Changed files:
- `functions/src/personalDriver/pricing.ts`
- `functions/src/personalDriver/__tests__/pricing.test.ts`
- `functions/src/personalDriver/__tests__/planConfig.test.ts`
- `.superpowers/sdd/task-2-report.md`

RED evidence:

Command:

```bash
npm --prefix functions test -- --runInBand src/personalDriver/__tests__/planConfig.test.ts src/personalDriver/__tests__/pricing.test.ts
```

Output:

```text
FAIL src/personalDriver/__tests__/pricing.test.ts
  Personal Driver backend pricing › prices an injected plan from distance even when monthly distance is below minimum billable kilometers

    Expected: 450
    Received: 300

Test Suites: 1 failed, 1 passed, 2 total
Tests:       1 failed, 5 passed, 6 total
Time:        16.544 s
```

GREEN evidence:

Command:

```bash
npm --prefix functions test -- --runInBand src/personalDriver/__tests__/planConfig.test.ts src/personalDriver/__tests__/pricing.test.ts
```

Output:

```text
Test Suites: 2 passed, 2 total
Tests:       6 passed, 6 total
Snapshots:   0 total
Time:        16.275 s
```

Build evidence:

Command:

```bash
npm --prefix functions run build
```

Output:

```text
> build
> tsc
```

Result: exit code 0.

Additional coverage:
- Added a focused `planConfig` regression test where an invalid Premium Firestore document with `pricePerKm: -1` falls back to `DEFAULT_PERSONAL_DRIVER_PLANS.premium` instead of partially applying the override.

Concerns:
- None for this review fix.
