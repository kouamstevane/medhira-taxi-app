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
- The package service timezone is derived server-side from the authoritative pickup location and stored as an IANA `serviceTimeZone` such as `America/Toronto`; no function-runtime timezone is used.
- The server stores business-local calendar dates/times for audit and derives UTC instants for timestamps and comparisons. A 30-day period means 30 calendar days in `serviceTimeZone`, including daylight-saving transitions.

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

The server resolves the pickup address to coordinates, obtains its IANA timezone through the Google Time Zone API, and persists `pickupLocation` and `serviceTimeZone` on the subscription. The API request uses latitude/longitude and a timestamp; its returned `timeZoneId` is the authoritative identifier, while calendar arithmetic uses the IANA timezone rules. If address resolution or timezone resolution is ambiguous or unavailable, package creation fails closed. A special trip does not change the subscription timezone; its schedule is interpreted using the subscription's persisted `serviceTimeZone`.

## Period and entitlement model

The initial package uses the requested start date as its inclusive local period start in `serviceTimeZone`. The end boundary is exclusive and is exactly 30 calendar days after the start date in that timezone. The package is usable only before the UTC instant corresponding to the exclusive local end boundary.

The subscription stores the authoritative period, payment, quota, and tax fields:

- `periodStartDate`;
- `periodEndDateExclusive`;
- `periodStartAtUtc`;
- `periodEndAtUtc`;
- `serviceTimeZone`;
- `pickupLocation`;
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

The authoritative subscription states are:

- `status`: `pending_payment | active | payment_failed | cancelled | expired`;
- `paymentStatus`: `creating | pending | requires_action | succeeded | failed | cancelled`.

The normal flow is `status: pending_payment` with `paymentStatus: creating` or `pending`, then Stripe success writes `paymentStatus: succeeded` and `status: active` atomically. A failed payment writes `paymentStatus: failed` and `status: payment_failed`. A cancelled PaymentIntent writes `paymentStatus: cancelled` and `status: cancelled`. `requires_action` never grants entitlement. There is no `pending_validation`, `authorized`, `captured`, or `payment_creation_failed` state in the normal Personal Driver model.

An entitlement is usable only when `status === 'active'`, `paymentStatus === 'succeeded'`, and the current UTC instant is before `periodEndAtUtc`. Every operation that can create, assign, start, or bill a trip checks this condition on the server. When an active record is encountered after its end boundary, the server marks it expired transactionally before rejecting the operation.

The normal payment state flow is:

`pending_payment` → `active`

Stripe failures use an explicit failure state. Cancellation and expiry are terminal for that period. There is no `pending_validation` transition.

## Renewal flow

The dashboard exposes a “Renouveler” action for expired, cancelled, failed, and currently active packages. Renewal is a separate callable that accepts only the source subscription ID and a client request ID.

The server loads the source subscription, verifies ownership, copies its immutable trip configuration, recalculates the route distances, and creates a new subscription and PaymentIntent with a distinct idempotency key.

- If the previous period is still active, the new period starts at its exclusive end date.
- If the previous period has expired, the new period starts on the current local calendar date in the persisted `serviceTimeZone`.
- Quotas are initialized with `monthlyDistanceKmRemaining === monthlyDistanceKm`, `specialTripsUsed === 0`, and `specialTripsDistanceUsedKm === 0` on the new document.
- The old subscription is never overwritten.
- Replaying the same renewal request returns the same new PaymentIntent rather than creating another one.

## Trip generation and authorization

Trip drafts are created idempotently after payment confirmation, using deterministic IDs derived from the subscription ID and trip index. Replayed webhooks cannot duplicate drafts.

Admin assignment and emergency reassignment read the associated subscription in the same transaction as the trip and reject the operation unless `status === 'active'`, `paymentStatus === 'succeeded'`, and the period is active. The driver status callable performs the same check in its transaction before every allowed transition.

The client special-trip callable checks the same entitlement, validates that the requested date is within the active period, recalculates the route distance, and atomically increments the special-trip and distance quotas.

## Server-authoritative waiting charges

The driver status flow records wait timestamps with Firestore server timestamps:

- `driver_arrived` sets `waitStartedAt`;
- `passenger_picked_up` sets `waitEndedAt`.

At `driver_arrived`, the server also validates the driver's submitted device location against the server-resolved `pickupLocation` and a required configured pickup radius. The location sample must satisfy the configured accuracy limit. An out-of-radius or malformed sample blocks overage billing and marks the trip for operational review; it does not trigger manual validation for normal trips. This is a fraud-resistance signal, not an absolute proof against a compromised device.

The billing callable no longer trusts `elapsedMinutes`. It calculates elapsed minutes from those timestamps and rejects malformed, negative, or excessive durations. A configurable maximum wait duration fails closed and requires operational handling rather than silently charging an arbitrary amount.

Before calling Stripe, the billing callable acquires a Firestore transaction claim on the trip. The claim has `processing`, `billed`, and `failed` states, a deterministic idempotency key, and stale-claim recovery. Stripe PaymentIntent creation uses that same deterministic idempotency key. A second concurrent request cannot create a second charge.

## Stripe webhooks

The Personal Driver branch handles:

- successful payment: succeeded payment, automatic activation, and idempotent trip generation;
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
