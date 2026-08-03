# Personal Driver Prepaid Security Design

## Goal

Make Personal Driver a fully automated, server-authoritative prepaid service valid for exactly 30 calendar days, with manual renewal, no manual subscription validation, strict payment and expiry enforcement, server-calculated distances, safe wait-time billing, and reliable Stripe synchronization.

## Product decisions

- Personal Driver is a prepaid 30-day package, not a recurring Stripe subscription.
- Renewal is manual and creates a new subscription document, a new payment, a new period, and fresh quotas.
- Stripe payment confirmation activates the package automatically. The administrator does not validate distances, trips, payments, or subscriptions.
- The administrator may still perform operational actions such as assigning an approved driver or emergency reassignment; those actions must pass the same server-side entitlement checks.
- Tax calculation is explicitly deferred. The backend stores a pending tax state, the UI says “Taxes : à confirmer”, and Stripe charges only the confirmed pre-tax subtotal.
- Existing records missing authoritative period or payment data fail closed and require a new package rather than being silently trusted.

## Authoritative distance and price flow

The client may display an estimate, but all billable distances are recalculated by the backend using the existing Google Maps Distance Matrix secret and server proxy pattern.

For an initial package, the callable validates the addresses and calculates:

- outbound road distance;
- return road distance when the trip is round-trip;
- the number of occurrences of the selected weekdays in the 30-day period;
- the authoritative monthly distance as the rounded per-occurrence distance multiplied by those occurrences.

Client-provided `monthlyDistanceKm`, `distanceOneWayKm`, and `distanceReturnKm` are informational only and cannot affect the payment amount.

For special trips, the callable calculates the road distance from the submitted addresses before opening the Firestore quota transaction. Client-provided `distanceKm` is ignored for billing and quota deduction.

If Google Maps cannot produce a valid route, the operation fails closed. There is no fallback distance and no client override.

## Period and entitlement model

The initial package uses the requested start date as its inclusive period start. The end boundary is exclusive and is exactly 30 calendar days after the start date. The package is usable only while the current market date is within that half-open interval.

The subscription stores the authoritative period, payment, quota, and tax fields:

- `periodStartDate`;
- `periodEndDateExclusive`;
- `status`;
- `paymentStatus`;
- `monthlyDistanceKm`;
- `monthlyDistanceKmRemaining`;
- `includedSpecialTrips`;
- `specialTripsUsed`;
- `specialTripsDistanceUsedKm`;
- `taxStatus: 'pending_confirmation'`;
- `taxAmount: 0`;
- `totalAmount` equal to the pre-tax subtotal.

An entitlement is usable only when `status === 'active'`, payment status is captured/succeeded, and the current date is before the exclusive end date. Every operation that can create, assign, start, or bill a trip checks this condition on the server. When an active record is encountered after its end boundary, the server marks it expired transactionally before rejecting the operation.

The normal payment state flow is:

`pending_payment` → `active`

Stripe failures use an explicit failure state. Cancellation and expiry are terminal for that period. There is no `pending_validation` transition.

## Renewal flow

The dashboard exposes a “Renouveler” action for expired, cancelled, failed, and currently active packages. Renewal is a separate callable that accepts only the source subscription ID and a client request ID.

The server loads the source subscription, verifies ownership, copies its immutable trip configuration, recalculates the route distances, and creates a new subscription and PaymentIntent with a distinct idempotency key.

- If the previous period is still active, the new period starts at its exclusive end date.
- If the previous period has expired, the new period starts on the current market date.
- Quotas are initialized to zero usage on the new document.
- The old subscription is never overwritten.
- Replaying the same renewal request returns the same new PaymentIntent rather than creating another one.

## Trip generation and authorization

Trip drafts are created idempotently after payment confirmation, using deterministic IDs derived from the subscription ID and trip index. Replayed webhooks cannot duplicate drafts.

Admin assignment and emergency reassignment read the associated subscription in the same transaction as the trip and reject the operation unless the payment is confirmed and the period is active. The driver status callable performs the same check in its transaction before every allowed transition.

The client special-trip callable checks the same entitlement, validates that the requested date is within the active period, recalculates the route distance, and atomically increments the special-trip and distance quotas.

## Server-authoritative waiting charges

The driver status flow records wait timestamps with Firestore server timestamps:

- `driver_arrived` sets `waitStartedAt`;
- `passenger_picked_up` sets `waitEndedAt`.

The billing callable no longer trusts `elapsedMinutes`. It calculates elapsed minutes from those timestamps and rejects malformed, negative, or excessive durations. A configurable maximum wait duration fails closed and requires operational handling rather than silently charging an arbitrary amount.

Before calling Stripe, the billing callable acquires a Firestore transaction claim on the trip. The claim has `processing`, `billed`, and `failed` states, a deterministic idempotency key, and stale-claim recovery. Stripe PaymentIntent creation uses that same deterministic idempotency key. A second concurrent request cannot create a second charge.

## Stripe webhooks

The Personal Driver branch handles:

- successful payment: captured payment, automatic activation, and idempotent trip generation;
- failed payment: explicit failed status and no entitlement;
- cancelled payment: explicit cancelled status and no entitlement;
- required customer action: a pending-action status and no entitlement until success.

Webhook processing errors return a non-2xx response so Stripe retries the event. Successfully ignored duplicate or unsupported events still return 2xx. The webhook tests cover both state transitions and retry-visible failures.

## Testing and verification

The implementation follows red-green-refactor for each behavior:

- pure period, weekday-count, entitlement, and price tests;
- route verification tests that reject client distance overrides;
- renewal idempotency and quota-reset tests;
- expiry and unpaid assignment/driver-transition tests;
- special-trip server-distance and quota transaction tests;
- wait timestamp, maximum-duration, concurrency, and Stripe idempotency tests;
- success, failure, cancellation, required-action, duplicate, and retry-visible webhook tests;
- frontend dashboard tests for expiry status and renewal action;
- functions build, frontend typecheck, lint, targeted tests, Firestore rules tests, and the existing quality suites.

## Non-goals

- No tax rate or legal tax jurisdiction is introduced.
- No automatic recurring billing is introduced.
- No manual administrator approval is required for package activation.
- No unrelated taxi, food, parcel, or wallet payment flow is redesigned.
