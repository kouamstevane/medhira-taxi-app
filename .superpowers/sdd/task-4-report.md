# Task 4 Report: Cloud Functions for Subscription Payment

## Result

Implemented `createPersonalDriverSubscriptionPayment`, a Firebase v2 callable that creates the Stripe PaymentIntent and persists the Personal Driver subscription and generated trips through the Admin SDK.

## Files Changed

- `functions/src/personalDriver/createSubscriptionPayment.ts`
- `functions/src/personalDriver/pricing.ts`
- `functions/src/personalDriver/schedule.ts`
- `functions/src/personalDriver/index.ts`
- `functions/src/personalDriver/createSubscriptionPayment.test.ts`
- `functions/src/index.ts`
- `src/types/stripe.ts`

## Implementation Details

- Requires Firebase Authentication.
- Validates the subscription payload with Zod, including time/date formats, distances, passenger count, unique weekdays, round-trip return time, and one-way/round-trip distance rules.
- Rejects Basic selections containing Saturday or Sunday and rejects all other plans when their allowed-weekday policy is not met.
- Recalculates pricing on the server from `monthlyDistanceKm` and selected weekdays. The selected price and full price-comparison snapshot are stored on the subscription.
- Uses server-local pricing and schedule helpers because the client services are outside `functions/tsconfig.json`'s `rootDir`. The helpers reproduce the tested client rules without modifying client source files.
- Generates a subscription ID before PaymentIntent creation, then adds `purpose`, `subscriptionId`, and `userId` to Stripe metadata.
- Uses the existing `MAX_AMOUNT = 10000` policy and CAD server default currency.
- Uses V1 `taxAmount: 0`; no reliable tax service was found under the server or client service directories searched.
- Persists the `pending_payment` subscription and all 30-calendar-day scheduled trip drafts in one Firestore batch. The stored subscription includes `stripePaymentIntentId` and `paymentStatus: authorized`.
- Extends `PaymentIntentPurpose` and `PaymentIntentMetadata` with the Personal Driver subscription purpose and optional subscription ID.

## Test Evidence

TDD red run:

```powershell
cd functions
npx jest --config jest.config.js --testMatch '**/src/personalDriver/createSubscriptionPayment.test.ts' --runInBand
```

Before implementation, the suite failed because `./createSubscriptionPayment.js` did not exist.

Final focused suite:

```powershell
cd functions
npx jest --config jest.config.js --testMatch '**/src/personalDriver/createSubscriptionPayment.test.ts' --runInBand
```

Result: 5 passed, 0 failed.

Build:

```powershell
cd functions
npm run build
```

Result: passed (`tsc`, exit code 0).

## Concurrency Idempotency Fix Evidence

- Replaced the non-atomic subscription existence read with a Firestore transaction. The transaction creates a minimal `pending_payment` subscription claim with `paymentStatus: creating_payment`; only the transaction winner can create a Stripe PaymentIntent.
- A request that finds a completed pending subscription replays its stored PaymentIntent. A request that finds the in-progress claim receives a retryable `aborted` response and does not call Stripe.
- Stripe creation now uses `personal_driver_subscription_${subscriptionId}` as its idempotency key. The key has no amount component, so all retries for the same `(uid, requestId)` share one Stripe request scope.
- The final batch still writes the complete subscription with `status: pending_payment` and `paymentStatus: authorized`. The commit-failure verification treats a placeholder without the newly created PaymentIntent ID as unpersisted for compensation.
- Added a focused concurrency regression: while the first valid request waits in `paymentIntents.create`, a same-request retry with a different valid monthly distance is rejected as `aborted`; the transaction claim is present and Stripe `create` has exactly one call using the subscription-scoped key.

### Verification

TDD red run:

```powershell
cd functions
npx jest --config jest.config.js src/personalDriver/__tests__/createSubscriptionPayment.test.ts --runInBand
```

Result: failed as expected before the implementation. The existing assertion received an amount-bearing key (`..._${subscriptionId}_45000`), and the held concurrent retry resolved by creating another PaymentIntent instead of returning `aborted`.

Final focused suite:

```powershell
cd functions
npx jest --config jest.config.js src/personalDriver/__tests__/createSubscriptionPayment.test.ts --runInBand
```

Result: 12 passed, 0 failed.

Build:

```powershell
cd functions
npm run build
```

Result: passed (`tsc`, exit code 0).

## Concern

The command specified in the brief, `npm test -- personalDriver/createSubscriptionPayment.test.ts --runInBand`, cannot run because `functions/package.json` has no `test` script. Also, `functions/jest.config.js` only discovers tests beneath `src/**/__tests__/`, while the required test path is `src/personalDriver/createSubscriptionPayment.test.ts`. The explicit `npx jest` command above uses a command-line `--testMatch` override and leaves shared Jest configuration unchanged.

## Review Findings Fix Evidence

- Added required `requestId` validation (trimmed, non-empty, maximum 128 characters). The subscription document ID is a SHA-256 hash of `userId` and `requestId`, so repeat requests resolve the same document. Existing subscriptions return their stored PaymentIntent after retrieving its client secret, and Stripe creation uses the deterministic subscription ID in its idempotency key. Generated trip documents now also use deterministic subscription/index IDs.
- Wrapped the Firestore batch commit in a compensation block. A failed commit cancels the just-created PaymentIntent using a deterministic cancellation idempotency key; a cancellation failure is logged without masking the callable `internal` error.
- Moved the suite to `functions/src/personalDriver/__tests__/createSubscriptionPayment.test.ts`. `npx jest --config jest.config.js --listTests` now lists it through normal configured discovery.
- Removed `recommendationReasons` from the server pricing result, so the persisted comparison contains only pricing and eligibility data rather than divergent presentation copy.

### Test Evidence

TDD red run:

```powershell
cd functions
npx jest --config jest.config.js src/personalDriver/__tests__/createSubscriptionPayment.test.ts --runInBand
```

Result: failed as expected before the fix: empty `requestId` was accepted, the subscription document ID was random, retries created a new PaymentIntent, and a Firestore commit error escaped without Stripe cancellation.

Final focused suite:

```powershell
cd functions
npx jest --config jest.config.js src/personalDriver/__tests__/createSubscriptionPayment.test.ts --runInBand
```

Result: 9 passed, 0 failed.

Configured discovery:

```powershell
cd functions
npx jest --config jest.config.js --listTests
```

Result: listed `src/personalDriver/__tests__/createSubscriptionPayment.test.ts`.

Build:

```powershell
cd functions
npm run build
```

Result: passed (`tsc`, exit code 0).

## Remaining Finding Fix Evidence

- After a Firestore batch commit rejection, the callable re-reads the deterministic subscription document before compensating. It cancels the PaymentIntent only when that read confirms the subscription document is absent. A visible persisted subscription therefore preserves its linked PaymentIntent, including an idempotency replay.
- Added request-ID determinism coverage: the same `(uid, requestId)` resolves to the same subscription document ID, while the same request ID under another UID resolves to a different document ID.
- Added commit-failure coverage proving that a subscription visible after the failed commit prevents PaymentIntent cancellation. The existing no-document failure test continues to cover cancellation of a confirmed orphan.

### Verification

TDD red run:

```powershell
cd functions
npx jest --config jest.config.js src/personalDriver/__tests__/createSubscriptionPayment.test.ts --runInBand
```

Result: failed as expected before the compensation change because the failed-commit path performed only one subscription read and cancelled the PaymentIntent.

Final focused suite:

```powershell
cd functions
npx jest --config jest.config.js src/personalDriver/__tests__/createSubscriptionPayment.test.ts --runInBand
```

Result: 11 passed, 0 failed.

Build:

```powershell
cd functions
npm run build
```

Result: passed (`tsc`, exit code 0).
