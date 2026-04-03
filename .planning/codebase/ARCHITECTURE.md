# Architecture
_Last updated: 2026-04-03_

## Summary

Medhira is a Next.js 14 App Router PWA/mobile hybrid (via Capacitor) offering three verticals: taxi booking, food delivery, and parcel delivery. The backend is entirely Firebase (Firestore + Auth + Storage + Functions) with a thin Next.js API layer for Stripe and admin operations. Real-time features are driven by Firestore `onSnapshot` subscriptions directly from client components.

---

## Pattern Overview

**Overall:** Client-heavy Firebase-driven architecture with Next.js as the delivery shell.

**Key Characteristics:**
- Nearly all pages are `'use client'` — SSR is not used for data fetching
- Firestore is the single source of truth, accessed directly from the browser using client SDK
- Services (`src/services/`) are plain async functions (not classes), except `VoipService` and `FoodDeliveryService` which are class-based singletons
- State is held locally in `useState` inside page components; no global state library (no Redux, no Zustand)
- Cart state for food delivery is managed in `src/context/cartStore.ts` (Zustand-style context)

---

## Layers

**Pages (Route Handlers):**
- Purpose: UI rendering and local state orchestration
- Location: `src/app/**`
- Contains: `'use client'` React components, `useEffect`-driven Firestore reads, `onSnapshot` subscriptions
- Depends on: hooks, services, context
- Used by: End users via browser/Capacitor native app

**Services:**
- Purpose: Business logic and Firestore write operations
- Location: `src/services/*.service.ts`
- Contains: Pure async functions (mostly), one class per domain when stateful
- Depends on: `src/config/firebase.ts`, `src/types/`
- Used by: Pages, hooks, API routes

**Hooks:**
- Purpose: Reusable stateful logic for UI components
- Location: `src/hooks/`
- Contains: React hooks wrapping services, Firestore listeners, Capacitor APIs
- Depends on: services, context, Capacitor plugins
- Used by: Page components

**Context (Global State):**
- Purpose: Auth state and VoIP call state shared across the component tree
- Location: `src/context/AuthContext.tsx`, `src/context/VoipCallProvider.tsx`
- Contains: React Context providers
- Depends on: Firebase Auth, `src/config/firebase.ts`
- Used by: All pages via `useAuth()` hook and `useVoipCall()` hook

**API Routes (Server-side only):**
- Purpose: Server-only operations requiring Firebase Admin SDK or Stripe secret keys
- Location: `src/app/api/**`
- Contains: Next.js Route Handlers (`route.ts` files)
- Depends on: `src/config/firebase-admin.ts`, `src/lib/admin-guard.ts`, `src/services/stripe-*.service.ts`
- Used by: Client-side fetch calls from pages/components

**Lib:**
- Purpose: Shared utilities used across layers
- Location: `src/lib/`
- Contains: `firebase-helpers.ts` (CRUD helpers), `admin-guard.ts` (API auth middleware), `stripe.ts`, `utils.ts`, `validation.ts`

---

## Data Flow

**Taxi Booking Flow:**

1. User fills `NewRideForm` on `/taxi` — geocoding via Google Places API
2. `createBooking()` in `src/services/taxi.service.ts` writes to `bookings` Firestore collection
3. Matching engine (`src/services/matching/`) is invoked asynchronously — finds nearby available drivers, writes `candidates` sub-collection to the booking
4. Driver dashboard (`/driver/dashboard`) listens via `subscribeToDriverRideRequests()` — `onSnapshot` on `candidates` sub-collection
5. Driver accepts → `assignDriver()` updates booking status to `accepted`
6. Client page polls/listens to `bookings/{id}` via `onSnapshot` — transitions through `Step` states: `form → searching → driver_found → completed`
7. Payment captured via `/api/stripe/payment-intent` (PUT) when trip completes

**Food Delivery Flow:**

1. User browses `/food` — `FoodDeliveryService.getApprovedRestaurants()` (Firestore query, no real-time)
2. Cart managed via `cartStore.ts` context (in-memory, not persisted)
3. Checkout at `/food/checkout` — creates `orders` document in Firestore
4. Restaurant portal (`/food/portal/[id]/orders`) listens to orders via `onSnapshot`
5. Order status updates propagate back to client `/food/orders/[id]` via `onSnapshot`

**Auth Flow:**

1. `AuthProvider` (wraps entire app) calls `onAuthStateChanged` from Firebase Auth
2. On auth state change, fetches user doc from `users` OR `drivers` collection (collection searched in order)
3. `userData.userType` determines routing: `client` → `/dashboard`, `chauffeur` → `/driver/dashboard`
4. Dashboard page (`/dashboard`) re-checks auth via `onAuthStateChanged` directly (duplicates auth context — tech debt)
5. API routes verify identity via Firebase ID token: `Authorization: Bearer <token>` header validated by `verifyFirebaseToken()` in `src/lib/admin-guard.ts`

---

## Real-Time Subscriptions

All real-time data uses Firestore `onSnapshot`. Key subscriptions:

| Feature | Collection/Query | Location |
|---|---|---|
| Incoming ride requests (driver) | `bookings/{id}/candidates` where `driverId == uid` | `src/services/matching/broadcast.ts` → `subscribeToDriverRideRequests()` |
| Active booking status (client) | `bookings/{bookingId}` | `src/app/taxi/page.tsx` |
| Driver data (driver dashboard) | `drivers/{uid}` | `src/app/driver/dashboard/page.tsx` |
| Active trip (driver dashboard) | `bookings` where `driverId == uid && status in [accepted, in_progress]` | `src/app/driver/dashboard/page.tsx` |
| Incoming VoIP calls | `calls` where `calleeId == uid && status == ringing` | `src/context/VoipCallProvider.tsx` |
| Admin driver list | `drivers` collection | `src/app/admin/drivers/page.tsx` |
| Order tracking (food) | `orders/{id}` | `src/app/food/orders/[id]/OrderTrackingClient.tsx` |

---

## Auth Strategy

**Client users:** Firebase Auth via phone (SMS OTP) OR email/password. Phone auth is the primary flow. Email verification required for drivers only.

**Driver users:** Firebase Auth via email/password exclusively. Email verification enforced before approval.

**Admin users:** Identified by presence of a doc in `admins` Firestore collection. Admin operations go through `/api/admin/**` routes which require Firebase Admin SDK token verification. No separate auth provider for admins.

**User type resolution:** After login, `AuthContext` looks up `users/{uid}` then `drivers/{uid}`. The `userType` field (`client` | `chauffeur` | `restaurateur`) drives routing and feature access.

**Route protection:** Pages self-guard via `useEffect` checking `currentUser` from `useAuth()` and calling `router.push('/login')` — no middleware-based route guard (Next.js `middleware.ts` exists as `.tmp_build` only).

---

## VoIP (In-App Calling)

- Engine: Agora RTC SDK (`agora-rtc-sdk-ng`), loaded dynamically client-side only to avoid SSR errors
- Architecture: Plugin pattern — `IVoipEngine` interface in `src/types/voip.ts`, concrete `AgoraVoipEngine` in `src/services/voip/engines/agora.engine.ts`
- Signaling: Firestore `calls` collection (status: `ringing` → `answered` → `ended`)
- State: Singleton `voipService` in `src/services/voip.service.ts`, exposed to React via `useVoipCall` hook and `VoipCallProvider` context
- UI: `IncomingCallOverlay` and `ActiveCallOverlay` rendered globally in `LayoutClient`

---

## Driver Location Tracking

- Hook: `src/hooks/useDriverTracking.ts`
- Service: `src/services/driverTracking.service.ts`
- Uses Capacitor Geolocation plugin for native GPS on mobile, browser Geolocation API as fallback
- Location written to `drivers/{uid}.location` in Firestore
- Haptic feedback triggered on speed > 5 m/s via `@capacitor/haptics`

---

## Payment Architecture

- Client creates PaymentIntent via `POST /api/stripe/payment-intent` (server-side, secret key protected)
- Authorization-only flow: captured after trip completion via `PUT /api/stripe/payment-intent`
- Driver payouts via Stripe Connect: `src/services/stripe-connect.service.ts`
- Wallet recharge via `POST /api/stripe/wallet/recharge`
- Stripe webhook handler at `POST /api/webhooks/stripe`
- Multi-market currency support: `STRIPE_CURRENCY_BY_MARKET` map in `src/types/stripe.ts`; active market via `ACTIVE_MARKET` constant in `src/utils/constants.ts`

---

## Key Abstractions

**Matching Engine:**
- Purpose: Find available drivers near a pickup point and broadcast ride requests
- Location: `src/services/matching/` (split into `findAvailableDrivers.ts`, `broadcast.ts`, `assignment.ts`, `retry.ts`)
- Pattern: Modular functions composed via barrel `index.ts`; retry with expanding geofence (Plan A: 5 min radius → Plan B: 10 min)

**Firebase Admin Guard:**
- Purpose: Protect server-side API routes — verify Firebase ID token, provide Admin SDK instances
- Location: `src/lib/admin-guard.ts`
- Pattern: `verifyFirebaseToken(request)` returns `uid` or throws; used at top of every `route.ts` handler

---

## Error Handling

**Strategy:** Console-based logging (`src/utils/logger.ts`) with structured JSON. No global error boundary on the client. API routes return `NextResponse.json({ error: ... }, { status: N })`.

**Patterns:**
- Services catch and re-throw or return null on Firestore errors
- Auth context catches Firestore errors silently when user is offline (`err.code === 'unavailable'`)
- API routes use try/catch returning JSON error responses
- `adminUnavailableResponse()` in `src/lib/admin-guard.ts` returns 503 when Firebase Admin SDK is uninitialized

---

## Cross-Cutting Concerns

**Logging:** `src/utils/logger.ts` — structured logger with `info`, `warn`, `error` levels. Used across services. Console output only (no remote logging service detected).

**Validation:** `src/lib/validation.ts` — form validation helpers.

**Notifications:** Push notifications via Firebase Cloud Messaging (`src/services/pushNotifications.service.ts`). `NotificationHandler` component rendered globally in `LayoutClient`. Toast notifications via `react-hot-toast`.

**PWA/Mobile:** Capacitor wraps the Next.js app for Android. `capacitor.config.ts` at root. Native plugins: Geolocation, Haptics, Camera, Push Notifications.

---

## Firestore Collections

| Collection | Purpose |
|---|---|
| `users` | Client accounts |
| `drivers` | Driver accounts (approval workflow) |
| `admins` | Admin accounts (Admin SDK write only) |
| `bookings` | Taxi ride bookings (with `candidates` and `messages` sub-collections) |
| `wallets` | User wallet balances |
| `transactions` | Financial transaction log |
| `restaurants` | Restaurant listings |
| `orders` | Food delivery orders |
| `calls` | VoIP call signaling documents |
| `notifications` | Push notification records |
