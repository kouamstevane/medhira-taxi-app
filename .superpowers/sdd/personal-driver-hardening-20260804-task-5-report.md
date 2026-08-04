# Task 5: Visible, Retryable Personal Driver Activation

## Status

DONE

## Implementation

- New and renewed subscriptions persist `activationStatus: pending_payment` with a nullable `activationError`.
- A successful Stripe payment persists `paymentStatus: succeeded` and `activationStatus: activating` before trip generation while leaving the subscription non-active.
- Trip generation accepts paid activating subscriptions and retains deterministic Firestore document IDs, so a retry skips trips already created.
- Successful generation transitions the subscription to `status: active` and `activationStatus: active`, clears `activationError`, and writes the deterministic payment notification.
- Failed generation preserves the recorded payment, persists `activationStatus: activation_failed`, stores at most 500 characters of error text, and propagates the failure to the HTTP 500 webhook response so Stripe retries it.
- Duplicate delivery after activation is a no-op; failed or interrupted activation can safely re-enter `activating` and retry generation.
- Added `getPersonalDriverSubscriptionById(subscriptionId)` for read-only client polling.
- The confirmation screen polls every two seconds for up to sixty seconds after Stripe confirms payment, displays the required French preparation state, routes only after server-side `activationStatus: active`, and gives French refresh/support guidance on failure or timeout.
- The dashboard distinguishes activation in progress, activation failure, and payment failure from the generic empty-calendar state.
- The browser performs no subscription activation writes.

## TDD Evidence

- RED: focused webhook and trip-generation tests failed because payment was marked active before generation, failures left the subscription active, and activating subscriptions generated no trips.
- GREEN: `cd functions && npx jest --runInBand src/personalDriver/__tests__/personalDriverStripeWebhook.test.ts src/personalDriver/__tests__/tripGeneration.test.ts --forceExit` passed 17 tests.
- RED: confirmation, dashboard, and service tests failed because read-by-ID polling was absent, confirmation redirected immediately, and pending/failed activation rendered as a generic empty calendar.
- GREEN: the focused confirmation, dashboard, and service run passed 15 tests before the final dashboard precedence regression was added.
- RED: initial and renewal payment tests failed because subscriptions did not persist the `pending_payment` activation state.
- GREEN: `cd functions && npx jest --runInBand src/personalDriver/__tests__/createSubscriptionPayment.test.ts src/personalDriver/__tests__/renewSubscriptionPayment.test.ts --forceExit` passed 35 tests.
- RED: the dashboard payment-failure regression showed the activation placeholder overriding the payment-failure badge.
- GREEN: the dashboard suite passed 8 tests after payment state was given display precedence until payment succeeds.

## Final Verification

- `cd functions && npx jest --runInBand src/personalDriver/__tests__/personalDriverStripeWebhook.test.ts src/personalDriver/__tests__/tripGeneration.test.ts src/personalDriver/__tests__/createSubscriptionPayment.test.ts src/personalDriver/__tests__/renewSubscriptionPayment.test.ts --forceExit`
  - Passed: 4 suites, 52 tests.
- `npm run test:personal-driver -- --forceExit`
  - Passed: 9 suites, 50 tests.
- `cd functions && npm run build`
  - Passed: TypeScript build exited 0.
- `npm run typecheck`
  - Passed: root TypeScript check exited 0.
- Focused ESLint runs for every changed TypeScript and TSX file
  - Passed with 0 lint errors and 0 lint warnings. The Functions invocation prints the repository's existing Next.js `pages` directory informational message.
- `git diff --check`
  - Passed.

## Known Unrelated Full-Suite Failures

`cd functions && npm run test:personal-driver -- --forceExit` completed with 15 of 16 suites and 122 of 124 tests passing. The only failures are the existing Task 1 contracts in `clientManagePersonalDriver.test.ts` for assigned-trip cancellation cleanup and authoritative special-trip distance reconciliation. Task 5's four Functions suites pass 52 of 52 tests, and Task 5 does not modify `clientManagePersonalDriver.ts`.

## Changed Areas

- Stripe webhook activation state machine and trip-generation eligibility.
- Initial and renewal subscription activation defaults.
- Personal Driver subscription client service and shared subscription types.
- Confirmation polling and activation guidance.
- Dashboard activation-state rendering.
- Focused backend and frontend regression tests.
