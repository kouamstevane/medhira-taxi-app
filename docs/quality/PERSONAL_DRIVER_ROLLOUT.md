# Personal Driver Hardening Rollout Procedure

This document details the mandatory rollout order, backward-compatibility requirements, and rollback procedures for the Personal Driver hardening plan.

## Rollout Sequence

To ensure zero downtime, data integrity, and seamless backward compatibility for active subscriptions, deployments MUST follow this strict 6-step order:

### Step 1: Firestore Composite Indexes
Deploy updated Firestore composite indexes first to ensure queries in new Cloud Functions and web client succeed without missing index errors.

```bash
firebase deploy --only firestore:indexes --project medjira-service
```

### Step 2: Cloud Functions v2
Deploy Cloud Functions wrappers, period lock handlers, activation triggers, and wait charge settlement hooks.

```bash
firebase deploy --only functions:createSubscriptionPayment,functions:renewSubscriptionPayment,functions:clientCancelPersonalDriverTrip,functions:adminAssignPersonalDriverTrip,functions:adminCancelPersonalDriverSubscription,functions:settleWaitTimeOverage,functions:stripeWebhookInstant --project medjira-service
```

### Step 3: Idempotent Data Backfill (Backward Compatibility)
Run an idempotent admin script for legacy subscriptions created prior to hardening:
- Set default `activationStatus: 'active'` for legacy subscriptions with `status: 'active'`.
- Claim/activate `personal_driver_subscription_locks` for active subscriptions.
- **Rule:** Never alter historical paid amounts, plan prices, or original `createdAt` timestamps.

### Step 4: Web Application (Next.js)
Deploy the updated Next.js App Router frontend with authoritative checkout quote display, payment activation polling, operational error handling, and client route guards.

```bash
npm run build
```

### Step 5: Mobile App Build (Capacitor)
Perform static mobile export and Capacitor sync for Android and iOS native packages.

```bash
$env:MOBILE_BUILD='true'
npm run build
npx cap sync
```

### Step 6: Acceptance Verification
Execute end-to-end test journeys covering:
- Asymmetric return routes (server-authoritative distance calculation).
- Concurrent renewal prevention (period locking).
- Driver wait time server settlement and timer recovery.
- Client/driver/admin route access security.

---

## Rollback Procedure

If a critical issue occurs during deployment:
1. **Frontend / Mobile Rollback:** Revert web deployment to the previous static/App Router release. The previous UI will continue working with Firestore data.
2. **Data Preservation:** DO NOT delete any subscriptions, trips, or period locks created during the new deployment.
3. **Cloud Functions Safety:** Functions remain backward-compatible with legacy schema objects; rolling back frontend code will not corrupt active paid subscriptions.
