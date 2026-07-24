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
