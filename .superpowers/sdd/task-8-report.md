# Task 8: Personalized Estimate and Recommendation

Status: DONE

## Delivered

- Added `/personal-driver/estimation`, which reads the Task 7 session configuration and presents the estimate flow.
- Added the three-plan comparison using `calculatePersonalDriverPrices`.
- Shows one-way and round-trip distances, monthly distance, recommendation reasons, plan eligibility, and minimum-distance application messages.
- Allows the client to select any eligible plan, including a plan other than the recommendation.
- Persists the final selection, pricing comparison, and configuration under `medjira.personalDriver.estimate.v1` before navigating to confirmation.

## Verification

- RED: `npx jest src/app/personal-driver/components/PersonalDriverEstimate.test.tsx --runInBand --no-watchman` failed as expected before implementation because `./PersonalDriverEstimate` did not exist.
- GREEN: the same focused Jest command passed: 1 suite, 3 tests.
- `npx tsc --noEmit` passed.
- `git diff --check` passed.

## Note

The requested `npm test -- src/app/personal-driver/components/PersonalDriverEstimate.test.tsx --runInBand` command times out because this repository defines `npm test` as `jest --watch`; the direct Jest command above was used to run the same focused test non-interactively.

## Review Fixes

- Hardened estimation-session parsing: required strings, plan/trip type, non-empty weekday values in `0-6`, positive finite distances, passenger count, and round-trip return fields are validated at runtime. Invalid stored data is removed and falls back to the missing-trajectory state.
- Preserved the selected plan in `Modifier mon trajet` with `/personal-driver/configurer?plan=${configuration.planId}`.
- Formatted all displayed CAD prices with French separators and exactly two decimals.
- Changed the nested estimate title to `h2`; the route header remains the sole `h1`.

## Review Fix Verification

- RED: focused Jest failed on the old rounded currency output, hard-coded classic link, nested `h1`, and missing parser behavior after regression tests were added.
- GREEN: `npx jest src/app/personal-driver/components/PersonalDriverEstimate.test.tsx --runInBand --no-watchman` passed: 1 suite, 9 tests.
- `npx tsc --noEmit` passed.
- `git diff --check` passed.
