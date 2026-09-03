# Task 4 Report: Apply live plans to new quotes and preserve old entitlements

## Scope

Implemented Task 4 on branch `codex/editable-personal-driver-plans`.

Owned files changed:

- `functions/src/personalDriver/createSubscriptionPayment.ts`
- `functions/src/personalDriver/renewSubscriptionPayment.ts`
- `functions/src/personalDriver/clientManagePersonalDriver.ts`
- `functions/src/personalDriver/__tests__/createSubscriptionPayment.test.ts`
- `functions/src/personalDriver/__tests__/renewSubscriptionPayment.test.ts`
- `functions/src/personalDriver/__tests__/clientManagePersonalDriver.test.ts`

Report written:

- `.superpowers/sdd/task-4-report.md`

No worktree was created. Existing unrelated edits in `.superpowers/sdd/task-2-report.md` and `.superpowers/sdd/task-3-report.md` were left untouched.

## RED Evidence

Command:

```powershell
npm --prefix functions test -- --runInBand src/personalDriver/__tests__/createSubscriptionPayment.test.ts src/personalDriver/__tests__/renewSubscriptionPayment.test.ts src/personalDriver/__tests__/clientManagePersonalDriver.test.ts
```

Result: exit code 1.

Observed expected failures:

- `createPersonalDriverSubscriptionPayment > prices new Premium subscriptions from the configured plan snapshot`
  - Expected `amount: 800`; received `amount: 650`.
  - Expected configured `includedSpecialTrips: 1`; received default `includedSpecialTrips: 4`.
- `createPersonalDriverSubscriptionPayment > uses configured weekdays to decide selected plan eligibility`
  - Expected configured Basic Saturday eligibility to resolve; received invalid-argument rejection from the hard-coded Basic weekday check.
- `renewPersonalDriverSubscriptionPayment > prices Premium renewals from the configured plan snapshot`
  - Expected `amount: 800`; received `amount: 650`.
  - Expected configured `includedSpecialTrips: 1`; received default `includedSpecialTrips: 4`.
- `clientManagePersonalDriver > reports remaining special trips from the stored entitlement snapshot for an existing operation`
  - Expected stored entitlement remaining `4`; received catalogue-derived remaining `2`.

Summary:

- Test Suites: 3 failed, 3 total
- Tests: 4 failed, 50 passed, 54 total
- Time: 26.43 s

The failures matched the missing behavior requested in the brief.

## GREEN Evidence

Focused command:

```powershell
npm --prefix functions test -- --runInBand src/personalDriver/__tests__/createSubscriptionPayment.test.ts src/personalDriver/__tests__/renewSubscriptionPayment.test.ts src/personalDriver/__tests__/clientManagePersonalDriver.test.ts
```

Result: exit code 0.

Summary:

- Test Suites: 3 passed, 3 total
- Tests: 54 passed, 54 total
- Time: 27.079 s

Full personal-driver command:

```powershell
npm --prefix functions test -- --runInBand src/personalDriver/__tests__
```

Result: exit code 0.

Summary:

- Test Suites: 20 passed, 20 total
- Tests: 169 passed, 169 total
- Time: 43.591 s, estimated 77 s

Build command:

```powershell
npm --prefix functions run build
```

Result: exit code 0.

Summary:

- `tsc` completed successfully.
- No build errors were printed.

Long-running command check after user interruption:

```powershell
Get-CimInstance Win32_Process | Where-Object { $_.Name -in @('node.exe','npm.cmd','npm.exe') -and ($_.CommandLine -match 'jest|tsc|npm --prefix functions') } | Select-Object ProcessId,Name,CommandLine
```

Result: exit code 0, no matching processes printed.

## Implementation Notes

Creation flow:

- Imports `getConfiguredPersonalDriverPlans`.
- Loads configured plans once after replay checks and before new quote calculation.
- Uses the selected configured plan's `allowedWeekdays` for eligibility.
- Passes configured plans into `calculatePersonalDriverPrices`.
- Persists `includedSpecialTrips` from `selectedPlanPrice.includedSpecialTrips`.
- Persists the configured `selectedPlanPrice` and `priceComparison` snapshot used by Stripe and Firestore.

Renewal flow:

- Imports `getConfiguredPersonalDriverPlans`.
- Loads configured plans once on new renewal quote creation, after source plan and weekday validation.
- Uses the selected configured plan's `allowedWeekdays` for source eligibility.
- Passes configured plans into `calculatePersonalDriverPrices`.
- Persists `includedSpecialTrips` from `selectedPlanPrice.includedSpecialTrips`.
- Persists the configured `selectedPlanPrice` and `priceComparison` snapshot used by Stripe and Firestore.

Client management flow:

- Removes the current-catalogue `SPECIAL_TRIP_LIMITS` coupling.
- Existing idempotent special-trip operations report remaining trips from stored `includedSpecialTrips` and `specialTripsUsed`.
- New special-trip requests validate stored `includedSpecialTrips`, `specialTripsUsed`, distance counters, and period data without comparing stored entitlements to the current catalogue.
- Paid subscriptions are not recalculated from the current catalogue.

## Self-Review

- Security behavior preserved: authentication, ownership checks, payment status checks, activation readiness, entitlement checks, idempotency ownership checks, and period-lock handling are still in place.
- Payment behavior preserved: Stripe amount uses the authoritative quote total, idempotency keys are unchanged, replay paths still return persisted quote data without recalculating.
- Operational behavior preserved: route and timezone resolution, schedule validation, period calculation, lock finalization, payment failure handling, and activation retry flow remain unchanged.
- TDD evidence captured: the new behavior tests failed before implementation and passed after production changes.
- Scope check: only the six requested code/test files were modified for implementation. The report file was written as requested. Pre-existing Task 2/3 report edits were not staged or changed.

## Concerns

- `.superpowers/sdd/task-2-report.md` and `.superpowers/sdd/task-3-report.md` were already modified before this task and remain uncommitted outside this task's scope.
- Per the user's latest instruction, only the three callable files and three named tests should be staged and committed; this report is written but not intended to be included in the commit.
- No emulator command was requested or run for Task 4; all requested Jest and build commands completed without hanging.
