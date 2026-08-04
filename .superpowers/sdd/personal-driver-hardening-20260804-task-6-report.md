# Task 6 Report: Reliable subscription selection, expiry, and indexes

## Status

Implemented and verified. Firebase indexes were not deployed, per controller instruction.

## Implemented

- Added `getPersonalDriverSubscriptionView(userId)` with explicit `active` and `pending_payment` state filtering.
- Selects the active subscription by the UTC period containing the current time, independent of document creation order.
- Returns the nearest future active renewal as pending when applicable and preserves pending activation documents that predate `activationStatus`.
- Kept the legacy current/pending service functions as wrappers around the new view.
- Updated the client dashboard to render paid pending activation/failure state while loading trips only for `view.active`.
- Routed successful activation polling back through the subscription view so a future active renewal cannot expose its trips early.
- Restricted renewal payment recovery to records with an explicit `sourceSubscriptionId`.
- Added an expiry worker that queries `status == active` and `periodEndAtUtc <= now`, orders by `periodEndAtUtc`, and pages in batches of 500 until exhausted.
- Replaced the Personal Driver composite indexes with the exact subscription and `scheduledAtIso` trip index shapes from the brief.

## TDD evidence

- Subscription view tests failed because `getPersonalDriverSubscriptionView` was absent, then passed after implementation.
- Dashboard tests failed because pending/future subscriptions were used for trip reads, then passed after reads were restricted to the current view.
- Expiry test failed because the paginated worker export was absent, then passed with 501 irrelevant rows before the expired active target.
- Index tests failed for the missing expiry index, missing `scheduledAtIso` indexes, and retained legacy `scheduledAt` indexes, then passed after the exact replacements.

## `scheduledAt` proof

Before removing the three Personal Driver `scheduledAt` indexes, `rg "scheduledAt"` showed:

- the live Personal Driver subscription query orders by `scheduledAtIso`;
- Personal Driver services, UI, types, and Functions use `scheduledAtIso`;
- bare `scheduledAt` remains only in Personal Driver Firestore rules fixtures, unrelated taxi booking code, and the three obsolete Personal Driver index entries.

After replacement, no `personal_driver_trips` composite index or live TypeScript query uses bare `scheduledAt`.

## Verification

- `npm test -- --runInBand src/services/personal-driver/subscription.service.test.ts src/__tests__/unit/firestoreIndexes.test.ts --watch=false` — 2 suites, 16 tests passed.
- `npm --prefix functions test -- --runInBand src/personalDriver/__tests__/entitlement.test.ts` — 1 suite, 3 tests passed.
- `npm test -- --runInBand src/app/personal-driver/components/PersonalDriverClientDashboard.test.tsx src/quality/personal-driver-contract.test.ts --watch=false` — 2 suites, 15 tests passed.
- `npm --prefix functions run build` — passed.
- Changed-file ESLint checks for root and Functions files — passed. The Functions ESLint run emitted only its existing Next.js pages-directory advisory.
- `npm run typecheck` — blocked by two unrelated, unchanged App Router page-export errors in `src/app/dashboard/page.ts` and `src/app/personal-driver/estimation/page.ts`.

The root `test` script hard-codes Jest watch mode, so `--watch=false` was appended to bounded root commands to make them terminate in this shell.

## Index deployment handoff

- Read-only Firebase inspection confirmed `projects/medjira-service/databases/(default)` is Firestore Standard edition.
- Index JSON parsing and exact-shape regression tests pass.
- Deployment was intentionally not run.
- Controller command: `firebase deploy --only firestore:indexes --project medjira-service`

## Extra files justified by Step 2

- `src/app/personal-driver/components/PersonalDriverClientDashboard.tsx`
- `src/app/personal-driver/components/PersonalDriverClientDashboard.test.tsx`
- `src/quality/personal-driver-contract.test.ts`

These files were required to enforce active-only trip loading while preserving activation lifecycle visibility and to move the existing quality contract to the new subscription-view API.

## Review follow-up: period-aware pending selection and wrapper compatibility

### Changes

- Pending view candidates with a dated period ending at or before `now` are excluded.
- Current/future pending activation documents and future active renewals are ranked by period proximity, with the nearest valid period ahead of undated legacy fallbacks.
- `getPendingPersonalDriverRenewal` again performs its own pending-only query and returns only records with a non-empty `sourceSubscriptionId` and an eligible payment or activation lifecycle.
- Initial pending purchases and future active subscriptions remain available to the broader subscription view but are never returned by the legacy renewal wrapper.

### RED/GREEN evidence

- RED: `npm test -- --runInBand src/services/personal-driver/subscription.service.test.ts --watch=false -t "prefers the nearest future"` — 2 expected failures; stale pending records were returned instead of the nearest future active/pending renewal.
- GREEN: the same focused command — 2 tests passed after period-aware filtering and ranking.
- RED: `npm test -- --runInBand src/services/personal-driver/subscription.service.test.ts --watch=false -t "pending renewal"` — the 2 new wrapper regressions failed because the broader view returned an initial purchase; 2 existing renewal lifecycle cases passed.
- GREEN: the same focused command — all 4 matching tests passed after restoring wrapper-specific filtering.

### Bounded verification

- `npm test -- --runInBand src/services/personal-driver/subscription.service.test.ts src/__tests__/unit/firestoreIndexes.test.ts --watch=false` — 2 suites, 20 tests passed.
- `npm test -- --runInBand src/app/personal-driver/components/PersonalDriverClientDashboard.test.tsx src/quality/personal-driver-contract.test.ts --watch=false` — 2 suites, 15 tests passed.
- `npx eslint src/services/personal-driver/subscription.service.ts src/services/personal-driver/subscription.service.test.ts` — passed.
- No Firestore indexes were changed or deployed in this follow-up.
