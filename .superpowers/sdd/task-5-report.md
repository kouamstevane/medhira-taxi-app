# Task 5 Report: Render live plans in the client

## Status

Stopped after user interruption with Task 5 implementation and tests visible in the working tree.

The full focused Jest suite is not green yet. The remaining known failures are order-sensitive dashboard renewal tests that stay on the dashboard loading state when the whole dashboard test file runs, while one affected renewal test passes when isolated.

## RED evidence

- Command: `npx jest src/app/personal-driver src/services/personal-driver --runInBand`
- Result: failed as expected before production implementation.
- Evidence: 6 test suites failed because `PersonalDriverPlansProvider` and `usePersonalDriverPlans` did not exist yet; 5 suites passed, 30 tests passed.
- Interpretation: provider/consumer tests were added before the production provider and hook.

## GREEN evidence attempted

- Command: `npx jest src/app/personal-driver src/services/personal-driver --runInBand`
- Result: failed after initial implementation.
- Evidence: 4 suites failed, 7 passed, 8 tests failed, 86 tests passed, 94 total.
- Main issues observed: dynamic badge assertion, duplicate weekday cells, async provider timing, and dashboard renewal tests stuck on loading state.

- Command: `npx jest src/app/personal-driver/components/PersonalDriverClientDashboard.test.tsx -t "polls the known paid renewal" --runInBand`
- Result: passed.
- Evidence: 1 test passed, 14 skipped, exit code 0.

- Command: `npx jest src/app/personal-driver/components/PersonalDriverClientDashboard.test.tsx --runInBand`
- Result: failed.
- Evidence: 3 tests failed, 12 passed, 15 total.
- Remaining failures:
  - `polls the known paid renewal every two seconds after confirmation and exposes failure guidance`
  - `reloads the current subscription view before fetching trips after renewal activation`
  - `recovers a pending renewal payment after reload and disables another checkout`

- Command: `npx jest src/app/personal-driver src/services/personal-driver --runInBand`
- Result: failed after assertion fixes.
- Evidence: 1 suite failed, 10 passed, 3 tests failed, 91 passed, 94 total.

## Commands not completed

- `npm run lint:personal-driver` was not run.
- `npm run typecheck` was not run.

These were not run because the user interrupted before the focused Jest suite was green.

## Files changed for Task 5

- Created `src/hooks/usePersonalDriverPlans.ts`
- Created `src/app/personal-driver/PersonalDriverPlansProvider.tsx`
- Created `src/app/personal-driver/layout.tsx`
- Created `src/app/personal-driver/PersonalDriverPlansProvider.test.tsx`
- Modified `src/app/personal-driver/page.tsx`
- Modified `src/app/personal-driver/components/PersonalDriverPlanCard.tsx`
- Modified `src/app/personal-driver/configurer/page.tsx`
- Modified `src/app/personal-driver/components/PersonalDriverEstimate.tsx`
- Modified `src/app/personal-driver/components/PersonalDriverConfirmation.tsx`
- Modified `src/app/personal-driver/components/PersonalDriverClientDashboard.tsx`
- Modified `src/app/personal-driver/components/PersonalDriverPlanCard.test.tsx`
- Modified `src/app/personal-driver/components/PersonalDriverConfigurator.test.tsx`
- Modified `src/app/personal-driver/components/PersonalDriverEstimate.test.tsx`
- Modified `src/app/personal-driver/components/PersonalDriverConfirmation.test.tsx`
- Modified `src/app/personal-driver/components/PersonalDriverClientDashboard.test.tsx`
- Modified `src/services/personal-driver/pricing.service.ts`

## Implementation summary

- Added a client-side Personal Driver plans context and hook.
- Added a Personal Driver route layout that wraps route children in the provider while keeping the layout itself server-compatible.
- Provider starts with cloned static defaults, loads the Firestore-backed catalogue once on mount, exposes `isLoading`, `error`, and `reload`, and falls back to cloned defaults on load failure.
- Updated plan cards, landing comparison, configurator route, estimate, confirmation, and dashboard to read plan presentation data from the provider.
- Kept fixed visual styling decisions based on stable plan IDs.
- Kept confirmation totals and dashboard renewal payment totals sourced from persisted checkout/callable quote data instead of recalculating from live plan copy.
- Added consumer tests for live Premium Plus `name` and `minimumAmount` values and fallback error behavior.

## Self-review

- Scope: edits are limited to Task 5 Personal Driver files plus the pricing service signature needed to pass a live plan map into the existing pure estimate calculator.
- Client/server boundary: `layout.tsx` imports a client provider and wraps `children`, matching the local Next.js App Router context-provider pattern.
- Checkout totals: visible checkout total still comes from persisted estimate or authoritative callable quote.
- Risk: the implementation is not fully verified because the focused Jest command is still failing.

## Concerns

- The dashboard test file has remaining order-sensitive failures. Affected tests pass in isolation but fail after earlier dashboard cases, which suggests a test cleanup or fake timer/mock leak still needs correction.
- `src/services/personal-driver/pricing.service.ts` is not in the brief's explicit file list, but the brief also requires passing the live map to the pure estimate calculator. This small service signature change was necessary for live estimate calculations.
- Lint and typecheck have not been run after implementation.

## Pricing regression fix

- Added a regression test in `src/services/personal-driver/pricing.service.test.ts` for an injected plan with `minimumAmount: 300`, `pricePerKm: 1.5`, `minimumBillableKm: 500`, and `monthlyDistanceKm: 300`.
- The test failed first as expected: `totalBeforeTax` was `300` because the obsolete minimum-billable-distance branch still clamped the result.
- Updated `src/services/personal-driver/pricing.service.ts` to use `Math.max(distanceAmount, minimumAmount)` directly and set `minimumApplied` from `distanceAmount < minimumAmount`.
- Verified the focused pricing suite passed: `npx jest src/services/personal-driver/pricing.service.test.ts --runInBand`.
- Ran the broader Personal Driver Jest scope: `npx jest src/app/personal-driver src/services/personal-driver --runInBand`.
- Result: the pricing suite passed, but the broader scope still has 3 pre-existing `PersonalDriverClientDashboard` failures unrelated to this pricing change.
