# Task 6 Report: Client Entry, Intro, and Plan Cards

## Status

DONE

Commit: `a16ae6e` (`feat: add personal driver plan entry`)

## Implemented

- Added a `Personal Driver` service-grid entry on `/dashboard` that routes to `/personal-driver` and includes the required description and `Configurer mon transport mensuel` CTA.
- Added `/personal-driver` with a concise monthly-transport introduction, the four required configuration benefits, and all plans from `PERSONAL_DRIVER_PLANS`.
- Added `PersonalDriverPlanCard` with monthly minimum price, per-kilometre price, four benefits, required Classic and Premium labels, and plan-specific configuration links.
- Added focused UI coverage for dashboard entry text, plan visibility, labels, forbidden wording, and selection links.

## TDD Evidence

1. Created the focused test before the page and card existed.
2. Confirmed the initial red state with `npx jest src/app/personal-driver/components/PersonalDriverPlanCard.test.tsx --runInBand --watch=false`: it failed because `../page` did not exist.
3. Implemented the page, plan card, and dashboard entry.
4. Added a regression assertion for the required dashboard description, observed it fail, then implemented the description rendering.
5. Re-ran the focused test to green.

## Verification

- `npm test -- src/app/personal-driver/components/PersonalDriverPlanCard.test.tsx --runInBand --watch=false`: PASS, 1 suite and 3 tests.
- `npx tsc --noEmit`: PASS.
- `git diff --check`: PASS.

## Test Limitation

The dashboard's Firebase/auth hooks make a full rendered dashboard test disproportionately coupled. The focused test therefore renders the extracted `DashboardServiceGrid` directly, without Firebase/auth mocks, while the new Personal Driver page is rendered normally.

## Review Fix Evidence

- Replaced all clickable service-grid `div` elements with keyboard-native `Link` elements while preserving routes and styling.
- Replaced the dashboard source-text assertion with a rendered test covering the Personal Driver title, description, CTA, `/personal-driver` href, and forbidden-copy assertions.
- `npx jest src/app/personal-driver/components/PersonalDriverPlanCard.test.tsx --runInBand --watch=false`: PASS, 1 suite and 3 tests.
- `npx tsc --noEmit`: PASS.

The brief's initial `npm test -- ... --runInBand` command did not terminate because the repository's `test` script includes `jest --watch`. The terminating command above explicitly appends `--watch=false`.
