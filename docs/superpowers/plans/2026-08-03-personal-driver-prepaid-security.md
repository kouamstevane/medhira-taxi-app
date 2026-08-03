# Personal Driver Prepaid Security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert Personal Driver into a server-authoritative prepaid package valid for exactly 30 calendar days, with manual idempotent renewal, automatic payment activation, protected quotas, and race-safe wait billing.

**Architecture:** Add small backend domain helpers for periods, entitlement, route distance, and idempotent trip generation. All callables use these helpers inside Firestore transactions; client distances are estimates only. Stripe webhooks are the only normal activation path, and administrative functions remain limited to operational assignment/reassignment and cancellation.

**Tech Stack:** Firebase Cloud Functions v2, Firestore Admin SDK transactions, Stripe PaymentIntents/webhooks, Google Distance Matrix through the existing secret-backed proxy, TypeScript, Jest, Next.js App Router, React Testing Library.

## Global Constraints

- Personal Driver is a prepaid package, not a recurring Stripe subscription.
- Each package is valid for exactly 30 calendar days using an inclusive start and exclusive end boundary.
- A package is usable only when `status === 'active'`, payment is confirmed, and the current market date is before `periodEndDateExclusive`.
- The administrator never validates distances, trips, payments, or subscriptions; successful Stripe payment activates the package automatically.
- Tax remains `taxStatus: 'pending_confirmation'`, `taxAmount: 0`, and the charged amount is the confirmed pre-tax subtotal.
- Client-provided distance fields are informational and never determine payment or quota deduction.
- Existing records without authoritative period/payment fields fail closed and require a new package.
- All code and comments remain English; all user-facing copy remains French.
- Every behavior is implemented red-green-refactor with targeted tests before production code.
- Do not redesign taxi, food, parcel, wallet, or unrelated Stripe flows.

---

## File Map

Create these focused backend units:

- `functions/src/personalDriver/period.ts`: calendar-date parsing, 30-day exclusive boundary, weekday occurrence counting, and market-date normalization.
- `functions/src/personalDriver/entitlement.ts`: fail-closed subscription entitlement checks and transactional expiry.
- `functions/src/personalDriver/routeDistance.ts`: server-only Google Distance Matrix route calculation used by Personal Driver.
- `functions/src/personalDriver/tripGeneration.ts`: deterministic, idempotent trip draft generation after payment success.
- `functions/src/personalDriver/renewSubscriptionPayment.ts`: manual renewal callable and renewal request idempotency.

Modify these existing backend units:

- `functions/src/personalDriver/pricing.ts`: validate authoritative distance input and preserve pre-tax pricing.
- `functions/src/personalDriver/createSubscriptionPayment.ts`: remove trust in client distances, calculate the route/period server-side, persist the package before payment, and defer trip creation until webhook success.
- `functions/src/personalDriver/schedule.ts`: generate drafts from the authoritative half-open period and preserve deterministic indexes.
- `functions/src/personalDriver/clientManagePersonalDriver.ts`: verify entitlement, validate the requested date, calculate special-trip distance on the server, and atomically consume quotas.
- `functions/src/personalDriver/adminManagePersonalDriver.ts`: remove manual validation and transactionally guard assignment/reassignment with entitlement.
- `functions/src/personalDriver/driverUpdatePersonalDriverTrip.ts`: transactionally guard every driver transition and write wait timestamps.
- `functions/src/personalDriver/chargeWaitTimeOverage.ts`: derive duration from server timestamps and implement a transactional charge claim with Stripe idempotency.
- `functions/src/personalDriver/index.ts` and `functions/src/index.ts`: export the renewal callable and updated handlers.
- `functions/src/utilsApi/distanceCalculate.ts`: reuse the extracted server route helper without changing its public callable contract.
- `functions/src/stripe/index.ts`: activate and generate trips automatically, handle failure/cancellation/required-action, and return non-2xx on processing errors.

Modify these shared/frontend units:

- `src/types/personal-driver.ts`: remove normal `pending_validation`, add period/payment/tax/wait fields and explicit failure/pending-action states.
- `src/services/personal-driver/subscription.service.ts`: add renewal and status helpers; stop treating client distances as authoritative.
- `src/app/personal-driver/components/PersonalDriverClientDashboard.tsx`: show expiry/payment state and add the French `Renouveler` action.
- `src/app/personal-driver/components/PersonalDriverConfirmation.tsx`: label taxes as `À confirmer` and submit only estimate data required for display/request compatibility.
- `src/app/driver/personal-driver/PersonalDriverDriverPageClient.tsx`: keep the local display timer but stop sending elapsed minutes to billing.
- `firestore.rules`: preserve read-only client access and explicitly prevent client mutation of authoritative entitlement/payment/quota fields if any rule currently permits them.

Extend these tests:

- `functions/src/personalDriver/__tests__/pricing.test.ts`
- `functions/src/personalDriver/__tests__/createSubscriptionPayment.test.ts`
- `functions/src/personalDriver/__tests__/clientManagePersonalDriver.test.ts`
- `functions/src/personalDriver/__tests__/adminManagePersonalDriver.test.ts`
- `functions/src/personalDriver/__tests__/driverUpdatePersonalDriverTrip.test.ts`
- `functions/src/personalDriver/__tests__/chargeWaitTimeOverage.test.ts`
- `functions/src/personalDriver/__tests__/personalDriverStripeWebhook.test.ts`
- `src/app/personal-driver/components/PersonalDriverClientDashboard.test.tsx`
- `src/app/personal-driver/components/PersonalDriverConfirmation.test.tsx`
- `src/services/personal-driver/subscription.service.test.ts`
- New pure-unit tests beside each new backend helper.

---

### Task 1: Establish authoritative period, entitlement, and shared types

**Files:**
- Create: `functions/src/personalDriver/period.ts`
- Create: `functions/src/personalDriver/entitlement.ts`
- Create: `functions/src/personalDriver/__tests__/period.test.ts`
- Create: `functions/src/personalDriver/__tests__/entitlement.test.ts`
- Modify: `src/types/personal-driver.ts`

**Interfaces:**
- `getPeriodEndDateExclusive(startDate: string): string`
- `countWeekdayOccurrences(startDate: string, periodEndDateExclusive: string, weekdays: readonly number[]): number`
- `isSubscriptionEntitled(data: FirebaseFirestore.DocumentData | undefined, marketDate: string): boolean`
- `expireSubscriptionIfNeeded(db, subscriptionRef, marketDate): Promise<boolean>`
- `PersonalDriverPaymentStatus = 'creating_payment' | 'pending' | 'authorized' | 'captured' | 'succeeded' | 'failed' | 'cancelled' | 'requires_action'`

- [ ] **Step 1: Write failing pure period tests**

```ts
it('ends exactly 30 calendar days after the inclusive start', () => {
  expect(getPeriodEndDateExclusive('2026-02-01')).toBe('2026-03-03');
  expect(getPeriodEndDateExclusive('2026-01-15')).toBe('2026-02-14');
});

it('counts weekdays only inside the half-open period', () => {
  expect(countWeekdayOccurrences('2026-07-27', '2026-08-26', [1])).toBe(5);
  expect(countWeekdayOccurrences('2026-07-27', '2026-08-26', [1, 2, 3, 4, 5])).toBe(22);
});
```

- [ ] **Step 2: Run the period tests and verify they fail**

Run: `npm --prefix functions exec jest src/personalDriver/__tests__/period.test.ts --runInBand`

Expected: FAIL because `period.ts` and its exported functions do not exist.

- [ ] **Step 3: Implement the period helpers**

Use calendar components, not `Date.now()` or a millisecond duration, so February and daylight-saving boundaries remain calendar-correct. Reject malformed dates and duplicate/out-of-range weekdays with ordinary `Error` values; callables will translate them to `HttpsError('invalid-argument', ...)`.

- [ ] **Step 4: Write failing entitlement tests**

```ts
it('requires active status, confirmed payment, complete period, and current date', () => {
  const valid = {
    status: 'active', paymentStatus: 'captured',
    periodStartDate: '2026-07-01', periodEndDateExclusive: '2026-07-31',
  };
  expect(isSubscriptionEntitled(valid, '2026-07-30')).toBe(true);
  expect(isSubscriptionEntitled(valid, '2026-07-31')).toBe(false);
  expect(isSubscriptionEntitled({ ...valid, paymentStatus: 'pending' }, '2026-07-30')).toBe(false);
  expect(isSubscriptionEntitled({ status: 'active' }, '2026-07-30')).toBe(false);
});
```

- [ ] **Step 5: Implement fail-closed entitlement and expiry**

`expireSubscriptionIfNeeded` must read the document in a transaction, change only `active` records whose `periodEndDateExclusive <= marketDate` to `expired`, and return whether the record is entitled after the transaction. Missing period/payment fields return `false` and are never inferred from legacy `startDate`/`endDate`.

- [ ] **Step 6: Update frontend types and make the tests pass**

Replace normal `pending_validation` with explicit payment states, add `periodStartDate`, `periodEndDateExclusive`, `paymentStatus`, `taxStatus`, `taxAmount`, `paidAt`, `waitStartedAt`, `waitEndedAt`, and `overageChargeStatus`. Keep legacy fields optional only for rendering old records; backend entitlement must not use them.

- [ ] **Step 7: Run and commit**

Run: `npm --prefix functions exec jest src/personalDriver/__tests__/period.test.ts src/personalDriver/__tests__/entitlement.test.ts --runInBand` and `npm --prefix functions run build`

Expected: PASS and a clean TypeScript build.

Commit: `git add functions/src/personalDriver/period.ts functions/src/personalDriver/entitlement.ts functions/src/personalDriver/__tests__/period.test.ts functions/src/personalDriver/__tests__/entitlement.test.ts src/types/personal-driver.ts && git commit -m "feat: add personal driver period entitlement model"`

---

### Task 2: Make route distance and price server-authoritative

**Files:**
- Create: `functions/src/personalDriver/routeDistance.ts`
- Create: `functions/src/personalDriver/__tests__/routeDistance.test.ts`
- Modify: `functions/src/utilsApi/distanceCalculate.ts`
- Modify: `functions/src/personalDriver/pricing.ts`
- Modify: `functions/src/personalDriver/__tests__/pricing.test.ts`

**Interfaces:**
- `calculateServerRoute(input: { origin: string; destination: string }): Promise<{ distanceKm: number; durationMinutes: number }>`
- `calculateAuthoritativeMonthlyDistanceKm(input: { outboundKm: number; returnKm: number; tripType: 'one_way' | 'round_trip'; occurrences: number }): number`

- [ ] **Step 1: Add failing route tests**

Mock `fetch` and the secret value. Assert that a successful Google response returns `distance.value / 1000`, a non-OK route rejects, and no caller-provided distance is accepted by the helper.

```ts
it('returns the Google road distance in kilometres', async () => {
  global.fetch = jest.fn().mockResolvedValue({
    json: async () => ({ status: 'OK', rows: [{ elements: [{ status: 'OK', distance: { value: 12500 } }] }] }),
  }) as jest.Mock;
  await expect(calculateServerRoute({ origin: 'A', destination: 'B' })).resolves.toEqual({
    distanceKm: 12.5,
    durationMinutes: expect.any(Number),
  });
});

it('fails closed when Google has no valid route', async () => {
  global.fetch = jest.fn().mockResolvedValue({ json: async () => ({ status: 'ZERO_RESULTS' }) }) as jest.Mock;
  await expect(calculateServerRoute({ origin: 'A', destination: 'B' })).rejects.toThrow();
});
```

- [ ] **Step 2: Run the route tests and verify failure**

Run: `npm --prefix functions exec jest src/personalDriver/__tests__/routeDistance.test.ts --runInBand`

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Extract the existing Distance Matrix logic into the helper**

Use the existing `GOOGLE_MAPS_API_KEY` secret, the same location validation limits, driving mode, and French language. `distanceCalculate` must delegate to the helper and retain its current `{ distanceKm, durationMinutes, isEstimate: false }` response.

- [ ] **Step 4: Add failing price/authority tests**

Verify that monthly distance equals rounded per-occurrence route distance times occurrence count and that price calculation rejects non-finite/non-positive values. Keep `taxAmount` out of pricing; the returned amount is explicitly pre-tax.

- [ ] **Step 5: Implement the pure distance aggregation and price validation**

For a one-way package use `outboundKm * occurrences`; for round-trip use `(outboundKm + returnKm) * occurrences`; round billable distance to one decimal kilometre before pricing. Do not accept a client monthly distance in the authoritative backend path.

- [ ] **Step 6: Run and commit**

Run: `npm --prefix functions exec jest src/personalDriver/__tests__/routeDistance.test.ts src/personalDriver/__tests__/pricing.test.ts --runInBand` and `npm --prefix functions run build`

Commit: `git add functions/src/personalDriver/routeDistance.ts functions/src/personalDriver/__tests__/routeDistance.test.ts functions/src/utilsApi/distanceCalculate.ts functions/src/personalDriver/pricing.ts functions/src/personalDriver/__tests__/pricing.test.ts && git commit -m "fix: calculate personal driver distance on server"`

---

### Task 3: Secure initial package creation and deterministic trip generation

**Files:**
- Create: `functions/src/personalDriver/tripGeneration.ts`
- Create: `functions/src/personalDriver/__tests__/tripGeneration.test.ts`
- Modify: `functions/src/personalDriver/schedule.ts`
- Modify: `functions/src/personalDriver/createSubscriptionPayment.ts`
- Modify: `functions/src/personalDriver/__tests__/createSubscriptionPayment.test.ts`

**Interfaces:**
- `generatePersonalDriverTrips(db, subscription): Promise<void>`
- Deterministic trip IDs: `${subscriptionId}_${index}`.

- [ ] **Step 1: Add failing generation tests**

Assert that generation uses deterministic IDs, creates the expected number of outbound/return drafts, is safe when called twice, and does not create any draft while the payment is pending.

```ts
it('creates the same deterministic draft set on replay', async () => {
  await generatePersonalDriverTrips(mockDb, activeSubscription);
  await generatePersonalDriverTrips(mockDb, activeSubscription);
  expect(mockBatch.set).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'sub_1_0' }),
    expect.objectContaining({ subscriptionId: 'sub_1', status: 'scheduled' }),
    { merge: true },
  );
});
```

- [ ] **Step 2: Run the generation tests and verify failure**

Run: `npm --prefix functions exec jest src/personalDriver/__tests__/tripGeneration.test.ts --runInBand`

Expected: FAIL because the generator does not exist.

- [ ] **Step 3: Implement idempotent generation and authoritative period scheduling**

Generate only when `paymentStatus` is confirmed and `status` is `active`. Use `periodStartDate` and `periodEndDateExclusive`, and write with `merge: true` so replayed webhook delivery cannot duplicate or overwrite driver assignment. Persist `distanceKm` on each regular draft from the authoritative route values.

- [ ] **Step 4: Add failing initial-payment tests**

Extend `createSubscriptionPayment.test.ts` to assert:

- a forged `monthlyDistanceKm`, `distanceOneWayKm`, or `distanceReturnKm` cannot alter the PaymentIntent amount;
- the backend calls the route helper and weekday counter;
- the package stores `periodStartDate`, `periodEndDateExclusive`, `taxStatus: 'pending_confirmation'`, and `taxAmount: 0`;
- the initial callable stores no trips before Stripe success;
- the package starts with `paymentStatus: 'pending'`/creation claim and no entitlement;
- same `requestId` returns the same PaymentIntent.

- [ ] **Step 5: Implement the initial callable changes**

Remove client distance fields from the billing decision (they may remain optional request fields for backward-compatible clients). Calculate the route using the server helper, calculate weekday occurrences for the exact 30-day period, calculate the pre-tax amount, persist authoritative fields, create the PaymentIntent with metadata, and leave trip generation to `payment_intent.succeeded`.

- [ ] **Step 6: Run and commit**

Run: `npm --prefix functions exec jest src/personalDriver/__tests__/tripGeneration.test.ts src/personalDriver/__tests__/createSubscriptionPayment.test.ts --runInBand` and `npm --prefix functions run build`

Expected: PASS; old tests expecting client distance or pre-payment drafts must be updated to the new contract.

Commit: `git add functions/src/personalDriver/tripGeneration.ts functions/src/personalDriver/__tests__/tripGeneration.test.ts functions/src/personalDriver/schedule.ts functions/src/personalDriver/createSubscriptionPayment.ts functions/src/personalDriver/__tests__/createSubscriptionPayment.test.ts && git commit -m "fix: defer personal driver trips until payment success"`

---

### Task 4: Add manual renewal with idempotency and quota reset

**Files:**
- Create: `functions/src/personalDriver/renewSubscriptionPayment.ts`
- Create: `functions/src/personalDriver/__tests__/renewSubscriptionPayment.test.ts`
- Modify: `functions/src/personalDriver/index.ts`
- Modify: `functions/src/index.ts`
- Modify: `src/services/personal-driver/subscription.service.ts`
- Modify: `src/services/personal-driver/subscription.service.test.ts`

**Interfaces:**
- `renewPersonalDriverSubscriptionPayment({ sourceSubscriptionId, requestId }): Promise<{ subscriptionId: string; paymentIntentId: string; clientSecret: string; amount: number; currency: string }>`

- [ ] **Step 1: Add failing renewal tests**

Cover ownership, source configuration copying, fresh quotas, route recalculation, active-period chaining, expired-period start at current market date, old-document immutability, and replaying the same request returning the same PaymentIntent.

```ts
it('starts an active renewal at the previous exclusive end and resets quotas', async () => {
  const result = await renewPersonalDriverSubscriptionPayment(makeRequest({
    sourceSubscriptionId: 'sub_old', requestId: 'renew_1',
  }, 'user_1'));
  expect(result.subscriptionId).not.toBe('sub_old');
  expect(mockTransaction.create).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
    periodStartDate: '2026-08-31',
    monthlyDistanceKmRemaining: expect.any(Number),
    specialTripsUsed: 0,
    specialTripsDistanceUsedKm: 0,
    taxStatus: 'pending_confirmation',
  }));
});
```

- [ ] **Step 2: Run the renewal tests and verify failure**

Run: `npm --prefix functions exec jest src/personalDriver/__tests__/renewSubscriptionPayment.test.ts --runInBand`

Expected: FAIL because the callable does not exist.

- [ ] **Step 3: Implement the renewal callable**

Validate the authenticated owner and source document. Accept only source ID and request ID. Recalculate Google route distance, clone immutable configuration, create a deterministic new subscription ID from owner/source/request, choose `periodStartDate = old.periodEndDateExclusive` while still active or the current market date after expiry, set a new exclusive end, zero all quota counters, and create the PaymentIntent with a renewal-specific idempotency key. Never update the old document.

- [ ] **Step 4: Add frontend renewal service tests and implementation**

Mock `httpsCallable` and assert the exact payload `{ sourceSubscriptionId, requestId }`. Generate a request ID once per click and return the callable result to the UI.

- [ ] **Step 5: Run and commit**

Run: `npm --prefix functions exec jest src/personalDriver/__tests__/renewSubscriptionPayment.test.ts --runInBand` and `npm test -- --runInBand src/services/personal-driver/subscription.service.test.ts`

Commit: `git add functions/src/personalDriver/renewSubscriptionPayment.ts functions/src/personalDriver/__tests__/renewSubscriptionPayment.test.ts functions/src/personalDriver/index.ts functions/src/index.ts src/services/personal-driver/subscription.service.ts src/services/personal-driver/subscription.service.test.ts && git commit -m "feat: add idempotent personal driver renewal"`

---

### Task 5: Make Stripe webhook activation automatic and retry-visible

**Files:**
- Modify: `functions/src/stripe/index.ts`
- Modify: `functions/src/personalDriver/__tests__/personalDriverStripeWebhook.test.ts`
- Modify: `functions/src/personalDriver/tripGeneration.ts`

- [ ] **Step 1: Add failing webhook transition tests**

Assert that `payment_intent.succeeded` changes a valid pending package directly to `status: 'active'`, `paymentStatus: 'captured'`, stores Stripe customer/payment method, and invokes idempotent trip generation. Assert that `payment_intent.payment_failed`, `.canceled`, and `.requires_action` write `failed`, `cancelled`, and `requires_action` respectively without entitlement. Assert duplicate success does not regress an active package or duplicate drafts.

- [ ] **Step 2: Add a failing retry-visible handler test**

Force the Firestore transaction/generator to reject and assert the webhook response status is `500` (or another non-2xx status), not JSON `200` with a warning. Keep unsupported duplicate events at `200`.

- [ ] **Step 3: Implement webhook handlers**

Use a transaction to validate subscription ID and user metadata, transition only compatible pending states, and commit the confirmed payment fields. Call trip generation after the activation transaction; if generation fails, throw so the HTTP handler returns non-2xx. Update only Personal Driver branches for failure/cancel/required-action; preserve taxi behavior.

- [ ] **Step 4: Run and commit**

Run: `npm --prefix functions exec jest src/personalDriver/__tests__/personalDriverStripeWebhook.test.ts --runInBand` and `npm --prefix functions run build`

Commit: `git add functions/src/stripe/index.ts functions/src/personalDriver/__tests__/personalDriverStripeWebhook.test.ts functions/src/personalDriver/tripGeneration.ts && git commit -m "fix: activate personal driver from Stripe webhooks"`

---

### Task 6: Enforce entitlement and server distance for special trips

**Files:**
- Modify: `functions/src/personalDriver/clientManagePersonalDriver.ts`
- Modify: `functions/src/personalDriver/__tests__/clientManagePersonalDriver.test.ts`
- Modify: `functions/src/personalDriver/entitlement.ts`

- [ ] **Step 1: Add failing special-trip tests**

Cover rejected pending/failed/expired/cancelled subscriptions, rejection at the exclusive end date, rejection when the client sends a smaller forged distance, Google route distance being persisted, and concurrent requests allowing only the available quota/distance.

- [ ] **Step 2: Run the tests and verify failure**

Run: `npm --prefix functions exec jest src/personalDriver/__tests__/clientManagePersonalDriver.test.ts --runInBand`

Expected: FAIL because the callable currently trusts `payload.distanceKm` and checks only `status`.

- [ ] **Step 3: Implement the transactional entitlement and route flow**

Before quota checks, read the subscription and call `expireSubscriptionIfNeeded` logic within the same transaction boundary. Validate `scheduledAtIso` is within `[periodStartDate, periodEndDateExclusive)`. Calculate the route from submitted addresses before the transaction, then re-check all entitlement and quota values inside the transaction and write the server distance. Ignore the client `distanceKm` value except for schema compatibility.

- [ ] **Step 4: Run and commit**

Run: `npm --prefix functions exec jest src/personalDriver/__tests__/clientManagePersonalDriver.test.ts --runInBand` and `npm --prefix functions run build`

Commit: `git add functions/src/personalDriver/clientManagePersonalDriver.ts functions/src/personalDriver/__tests__/clientManagePersonalDriver.test.ts functions/src/personalDriver/entitlement.ts && git commit -m "fix: protect personal driver special trip quotas"`

---

### Task 7: Guard assignment, reassignment, and driver transitions

**Files:**
- Modify: `functions/src/personalDriver/adminManagePersonalDriver.ts`
- Modify: `functions/src/personalDriver/driverUpdatePersonalDriverTrip.ts`
- Modify: `functions/src/personalDriver/__tests__/adminManagePersonalDriver.test.ts`
- Modify: `functions/src/personalDriver/__tests__/driverUpdatePersonalDriverTrip.test.ts`

- [ ] **Step 1: Add failing operational authorization tests**

Assert that the old `validateSubscription` action is rejected/removed, assignment and emergency reassignment reject unpaid, failed, expired, cancelled, or legacy-incomplete subscriptions, and valid active/captured packages assign successfully. Repeat the same cases for each driver status transition.

- [ ] **Step 2: Run tests and verify failure**

Run: `npm --prefix functions exec jest src/personalDriver/__tests__/adminManagePersonalDriver.test.ts src/personalDriver/__tests__/driverUpdatePersonalDriverTrip.test.ts --runInBand`

Expected: FAIL because assignment and transitions currently do not load or validate the subscription.

- [ ] **Step 3: Remove manual validation and add transaction guards**

Delete `validateSubscription` from the admin action schema and handler. Keep operational assignment/reassignment and cancellation only. In assignment/reassignment transactions, read the trip and its subscription before writing the assignment. In the driver transition transaction, read the subscription before accepting the transition and expire an ended package transactionally. Preserve driver approval/availability checks.

- [ ] **Step 4: Add server wait timestamp writes**

When the new status is `driver_arrived`, write `waitStartedAt: serverTimestamp()` and clear any stale end/charge claim. When the new status is `passenger_picked_up`, write `waitEndedAt: serverTimestamp()`. Do not accept client timestamps.

- [ ] **Step 5: Run and commit**

Run: `npm --prefix functions exec jest src/personalDriver/__tests__/adminManagePersonalDriver.test.ts src/personalDriver/__tests__/driverUpdatePersonalDriverTrip.test.ts --runInBand` and `npm --prefix functions run build`

Commit: `git add functions/src/personalDriver/adminManagePersonalDriver.ts functions/src/personalDriver/driverUpdatePersonalDriverTrip.ts functions/src/personalDriver/__tests__/adminManagePersonalDriver.test.ts functions/src/personalDriver/__tests__/driverUpdatePersonalDriverTrip.test.ts && git commit -m "fix: enforce personal driver entitlement before operations"`

---

### Task 8: Make wait-overage billing timestamp-based and race-safe

**Files:**
- Modify: `functions/src/personalDriver/chargeWaitTimeOverage.ts`
- Modify: `functions/src/personalDriver/__tests__/chargeWaitTimeOverage.test.ts`
- Modify: `src/app/driver/personal-driver/PersonalDriverDriverPageClient.tsx`
- Modify: `src/types/personal-driver.ts`

- [ ] **Step 1: Add failing billing tests**

Cover missing timestamps, negative duration, duration above the configured maximum, free wait, overage payment, no payment method, an already billed trip, and two concurrent requests. Assert both calls result in at most one Stripe `paymentIntents.create` and that the request uses `idempotencyKey: 'personal_driver_wait_overage_<tripId>'`.

```ts
it('does not trust elapsedMinutes from the client', async () => {
  await expect(chargePersonalDriverWaitTimeOverage(makeRequest({
    tripId: 'trip_1', elapsedMinutes: 999,
  }, 'driver_1'))).rejects.toMatchObject({ code: 'invalid-argument' });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm --prefix functions exec jest src/personalDriver/__tests__/chargeWaitTimeOverage.test.ts --runInBand`

Expected: FAIL because the callable currently requires and trusts `elapsedMinutes`.

- [ ] **Step 3: Implement timestamp derivation and maximum duration**

Change the input to `{ tripId: string }`. Read `waitStartedAt` and `waitEndedAt`, normalize Firestore `Timestamp`/`Date`, calculate `Math.ceil((end - start) / 60000)`, reject malformed/negative values, and use an explicit maximum constant/configuration. If the duration exceeds the maximum, write a failed operational state and do not call Stripe.

- [ ] **Step 4: Implement the transaction claim**

Use a Firestore transaction to verify caller authorization, entitlement, timestamps, and `overageChargeStatus`. Claim with `processing`, `overageChargeIdempotencyKey`, and `overageChargeClaimedAt`. Treat a stale `processing` claim as reclaimable. If free wait, finalize as `billed` with zero fee in the transaction. If chargeable, create Stripe PaymentIntent with the deterministic key, then transactionally finalize the same claim as `billed`; on Stripe failure mark `failed` and preserve retryability.

- [ ] **Step 5: Update the driver UI**

Keep the local timer for display only. On `passenger_picked_up`, call `driverUpdatePersonalDriverTrip` first and then call `chargePersonalDriverWaitTimeOverage` with `{ tripId }`; remove `elapsedMinutes` from the request and display server-returned minutes/fee.

- [ ] **Step 6: Run and commit**

Run: `npm --prefix functions exec jest src/personalDriver/__tests__/chargeWaitTimeOverage.test.ts --runInBand` and `npm test -- --runInBand src/app/driver/personal-driver`

Commit: `git add functions/src/personalDriver/chargeWaitTimeOverage.ts functions/src/personalDriver/__tests__/chargeWaitTimeOverage.test.ts src/app/driver/personal-driver/PersonalDriverDriverPageClient.tsx src/types/personal-driver.ts && git commit -m "fix: make wait overage billing race safe"`

---

### Task 9: Add renewal/expiry/payment UI and tax wording

**Files:**
- Modify: `src/app/personal-driver/components/PersonalDriverClientDashboard.tsx`
- Modify: `src/app/personal-driver/components/PersonalDriverClientDashboard.test.tsx`
- Modify: `src/app/personal-driver/components/PersonalDriverConfirmation.tsx`
- Modify: `src/app/personal-driver/components/PersonalDriverConfirmation.test.tsx`
- Modify: `src/services/personal-driver/subscription.service.ts`
- Modify: `src/services/personal-driver/subscription.service.test.ts`

- [ ] **Step 1: Add failing dashboard tests**

Assert that an expired or payment-failed package shows no usable special-trip action, displays the period/payment status, and renders a `Renouveler` button. Assert that clicking it calls the renewal service with the current subscription ID and a request ID, then refreshes the subscription/payment state.

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- --runInBand src/app/personal-driver/components/PersonalDriverClientDashboard.test.tsx src/app/personal-driver/components/PersonalDriverConfirmation.test.tsx`

Expected: FAIL because the dashboard has no renewal action and current copy says taxes are calculated at payment.

- [ ] **Step 3: Implement dashboard state and renewal**

Load the newest subscription record, show exact dates from `periodStartDate`/`periodEndDateExclusive`, treat only server-confirmed active records as usable, disable special-trip creation otherwise, and call the renewal callable. Use French messages for pending payment, failed payment, required action, expired, and cancelled states.

- [ ] **Step 4: Update confirmation tax copy and payment flow**

Replace `Calculées au paiement` with `À confirmer`. Display the pre-tax subtotal and do not add a guessed tax rate. Keep the client estimate visibly labelled as an estimate; the backend response remains authoritative for the actual amount.

- [ ] **Step 5: Run and commit**

Run: `npm test -- --runInBand src/app/personal-driver/components/PersonalDriverClientDashboard.test.tsx src/app/personal-driver/components/PersonalDriverConfirmation.test.tsx src/services/personal-driver/subscription.service.test.ts`

Commit: `git add src/app/personal-driver/components/PersonalDriverClientDashboard.tsx src/app/personal-driver/components/PersonalDriverClientDashboard.test.tsx src/app/personal-driver/components/PersonalDriverConfirmation.tsx src/app/personal-driver/components/PersonalDriverConfirmation.test.tsx src/services/personal-driver/subscription.service.ts src/services/personal-driver/subscription.service.test.ts && git commit -m "feat: add personal driver renewal experience"`

---

### Task 10: Lock client rules and complete contract/regression coverage

**Files:**
- Modify: `firestore.rules`
- Modify: `tests/firestore/personal-driver.rules.test.ts`
- Modify: `src/quality/personal-driver-contract.test.ts`
- Modify: `src/quality/personal-driver-quality-gate.test.ts`
- Modify: `functions/src/personalDriver/__tests__/createSubscriptionPayment.test.ts`
- Modify: `functions/src/personalDriver/__tests__/clientManagePersonalDriver.test.ts`
- Modify: `functions/src/personalDriver/__tests__/adminManagePersonalDriver.test.ts`
- Modify: `functions/src/personalDriver/__tests__/driverUpdatePersonalDriverTrip.test.ts`
- Modify: `functions/src/personalDriver/__tests__/chargeWaitTimeOverage.test.ts`
- Modify: `functions/src/personalDriver/__tests__/personalDriverStripeWebhook.test.ts`

- [ ] **Step 1: Add failing rules tests**

Assert that a client can read only their own subscription/trips, cannot write period/payment/status/quota/wait fields, and cannot assign drivers. Keep the intended allowed client actions (if any) explicit and field-limited.

- [ ] **Step 2: Run the rules tests and verify failure**

Run: `npm run test:personal-driver:firestore`

Expected: FAIL for every unauthorized authoritative write currently allowed by the rules.

- [ ] **Step 3: Implement the smallest rules changes**

Use `diff(resource.data, request.resource.data).affectedKeys().hasOnly(...)` for any allowed client update. Disallow client create/delete for authoritative subscriptions/trips and keep all payment, entitlement, quota, assignment, and wait fields server/admin-only.

- [ ] **Step 4: Update contract fixtures**

Remove `pending_validation` assumptions, remove any assertion that client distance determines price, add renewal payload coverage, and assert the tax status/copy contract.

- [ ] **Step 5: Run and commit**

Run: `npm run test:personal-driver:firestore`, `npm run test:quality-gate`, `npm run test:personal-driver`, and `npm --prefix functions run test:personal-driver`

Commit: `git add firestore.rules tests/firestore/personal-driver.rules.test.ts src/quality/personal-driver-contract.test.ts src/quality/personal-driver-quality-gate.test.ts functions/src/personalDriver/__tests__ && git commit -m "test: lock personal driver security contracts"`

---

### Task 11: Full verification and final review

**Files:**
- No new files; review all files changed by Tasks 1–10.

- [ ] **Step 1: Run focused backend suites**

Run: `npm --prefix functions exec jest src/personalDriver/__tests__ --runInBand`

Expected: all Personal Driver backend tests pass, including concurrency and webhook retry tests.

- [ ] **Step 2: Run focused frontend suites**

Run: `npm run test:personal-driver -- --runInBand`

Expected: all Personal Driver frontend tests pass.

- [ ] **Step 3: Run static checks**

Run: `npm --prefix functions run build`, `npm run typecheck`, and `npm run lint:personal-driver`

Expected: exit code 0 with no new TypeScript or lint errors.

- [ ] **Step 4: Run Firestore and quality checks**

Run: `npm run test:personal-driver:firestore` and `npm run test:quality-gate`

Expected: emulator rules and quality contracts pass.

- [ ] **Step 5: Run production build and inspect diff**

Run: `npm run build`, `git diff --check`, and `git status --short`

Expected: production build succeeds, no whitespace errors, and only intended files are changed.

- [ ] **Step 6: Review security invariants manually**

Confirm in the final diff that no callable uses client distance for money/quota, no normal path references `pending_validation`, no assignment/status path skips entitlement, no wait charge accepts `elapsedMinutes`, no Stripe webhook handler converts processing errors to HTTP 200, and no tax rate has been introduced.

- [ ] **Step 7: Commit verification-only adjustments if needed**

Run: `git diff --check` and commit only any required test/documentation adjustment with a conventional commit message. Do not claim completion until every verification command above has passed.
