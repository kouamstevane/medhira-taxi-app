# Task 5: Stripe Webhook Completion

## Status

DONE

## Implementation

- Added handling for `payment_intent.succeeded` events whose metadata has `purpose: personal_driver_subscription`.
- Loads the `personal_driver_subscriptions/{subscriptionId}` document inside a Firestore transaction and verifies that its `userId` matches the PaymentIntent metadata.
- Transitions a valid subscription to `paymentStatus: captured` and `status: pending_validation`, and records `paidAt` with the Firestore server timestamp.
- Creates a `payment_received` notification titled `Paiement Personal Driver confirme` only after a successful transition.
- Treats an already captured, pending-validation subscription as idempotently processed, so repeated Stripe delivery neither updates it nor sends another notification.
- Does not alter the wallet recharge or taxi ride webhook branches.

## Tests

- Red: `cd functions && npx jest --runInBand src/personalDriver/__tests__/personalDriverStripeWebhook.test.ts`
  - Failed as expected before implementation: the Personal Driver event reached the dispatcher but did not call the subscription transaction.
- Green: `cd functions && npx jest --runInBand src/personalDriver/__tests__/personalDriverStripeWebhook.test.ts`
  - Passed: 1 suite, 2 tests.
  - Covers the paid transition, server timestamp, exact notification title, duplicate delivery, and metadata user mismatch.
- Build: `cd functions && npm run build`
  - Passed: `tsc` exited with code 0.

## Note

`functions/package.json` does not define an `npm test` script, so the focused Jest command was run through `npx jest` using the repository's configured Jest discovery path.

## Changed Files

- `functions/src/stripe/index.ts`
- `functions/src/personalDriver/__tests__/personalDriverStripeWebhook.test.ts`
- `.superpowers/sdd/task-5-report.md`

## Review Remediation Evidence (2026-07-24)

### Changes

- The Personal Driver `payment_intent.succeeded` transition now runs only when the subscription is `pending_payment` and its payment status is `authorized` or `pending`.
- All other subscription states, including `pending_validation`, `active`, and `cancelled`, are no-ops and do not create a notification.
- The transition writes `notifications/personal_driver_payment_{paymentIntentId}` through the same Firestore transaction as the subscription update. The notification document includes the normal notification payload, `notificationId`, `read: false`, and a server timestamp.
- This branch no longer uses the non-transactional `createNotification` helper.

### Verification

- Red: `cd functions && npx jest --runInBand src/personalDriver/__tests__/personalDriverStripeWebhook.test.ts`
  - Failed as expected before the fix: no transaction notification write was made, and an `active` subscription was regressed to `pending_validation`.
- Green: `cd functions && npx jest --runInBand src/personalDriver/__tests__/personalDriverStripeWebhook.test.ts --forceExit`
  - Passed: 1 suite, 3 tests.
  - Covers the atomic deterministic notification write, no legacy notification helper call, replay idempotency, active subscription no-op, and metadata user mismatch.
  - Jest reported an existing open-handle warning, so `--forceExit` was required for a clean process exit.
- Build: `cd functions && npm run build`
  - Failed outside this task's ownership at `src/personalDriver/createSubscriptionPayment.ts(140,17)`: `request.auth` is possibly `undefined` (TS18048).
  - The failing Task 4 payment-creation file was left unchanged.
- `git diff --check` passed for the webhook changes.
