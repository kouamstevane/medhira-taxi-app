# External Integrations

_Last updated: 2026-04-03_

## Summary

The app relies heavily on Firebase as its primary backend (Auth, Firestore, Storage, Cloud Functions, FCM, Remote Config). Stripe handles payments and driver payouts via Stripe Connect. Google Maps powers location features. Agora provides real-time voice calls between passengers and drivers. Resend/Nodemailer handle transactional email.

---

## Firebase (Primary Backend)

**Services used:**
- **Authentication** — Email/password, phone OTP, Google OAuth
  - Client SDK: `src/config/firebase.ts` → `getAuth(app)`
  - Admin SDK: `src/config/firebase-admin.ts` → `adminAuth`
  - Capacitor plugin: `@capacitor-firebase/authentication ^8.1.0`

- **Firestore** — Primary database for all app data
  - Client SDK: `src/config/firebase.ts` → `db`
  - Offline persistence enabled: `persistentLocalCache` + `persistentMultipleTabManager`
  - Admin SDK: `src/config/firebase-admin.ts` → `adminDb`
  - Rules: `firestore.rules`
  - Indexes: `firestore.indexes.json`
  - Location: `nam5` (North America multi-region)
  - Server-side SDK: `@google-cloud/firestore ^7.5.0`

- **Storage** — File/image uploads (driver documents, profile photos)
  - Client SDK: `src/config/firebase.ts` → `storage`
  - Rules: `storage.rules`
  - Remote pattern allowed in Next.js: `firebasestorage.googleapis.com`

- **Cloud Functions** — Server-side business logic
  - Source: `functions/src/`
  - Key functions: `createCall`, `answerCall`, `endCall` (VoIP), email sending, Stripe webhooks, driver data anonymization, currency migration
  - Region: `europe-west1` (`NEXT_PUBLIC_FIREBASE_FUNCTIONS_REGION`)
  - Invoked from client via `getFunctions()` + `httpsCallable()`

- **Firebase Messaging (FCM)** — Push notifications
  - Web: `firebase/messaging` + `getToken()` in `src/services/pushNotifications.service.ts`
  - Service worker: `src/app/firebase-messaging-sw.js`
  - Capacitor plugin: `@capacitor-firebase/messaging ^8.1.0`
  - Topics: `all_drivers`, `all_passengers`, `available_drivers`

- **Remote Config** — Feature flags / runtime config
  - Template: `remoteconfig.template.json`

- **Firebase Hosting** — Static web deployment
  - Serves `out/` (Next.js static export)

- **Firebase Emulators** — Local development
  - Auth: port 9099, Functions: 5001, Firestore: 8080, Hosting: 5000, Storage: 9199, UI: 4000

**Required env vars:**
```
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
FIREBASE_PROJECT_ID          (server-side Admin SDK)
FIREBASE_CLIENT_EMAIL        (server-side Admin SDK)
FIREBASE_PRIVATE_KEY         (server-side Admin SDK)
```

---

## Stripe (Payments)

**Architecture:**
- Platform collects 100% of passenger payment via PaymentIntent
- Weekly Transfer to driver Stripe Connect account (70% driver share)
- Platform retains 30% commission

**SDKs:**
- Server: `stripe ^21.0.1` — singleton in `src/lib/stripe.ts`, API version `2026-03-25.dahlia`
- Client: `@stripe/stripe-js ^9.0.0` + `@stripe/react-stripe-js ^6.0.0`
- Client instance: `src/lib/stripe-client.ts`

**Services:**
- `src/services/stripe-payment.service.ts` — PaymentIntents, amount conversion
- `src/services/stripe-connect.service.ts` — Driver Connect accounts, KYC onboarding, weekly payouts

**API routes (Next.js):**
- `src/app/api/stripe/payment-intent/` — Create PaymentIntent
- `src/app/api/stripe/connect/` — Connect account management
- `src/app/api/stripe/wallet/` — Wallet top-ups
- `src/app/api/webhooks/stripe/` — Stripe webhook handler

**Firebase Functions:**
- `functions/src/` includes Stripe-related functions

**Required env vars:**
```
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY   (client, prefix pk_test_ or pk_live_)
STRIPE_SECRET_KEY                     (server, prefix sk_test_ or sk_live_)
STRIPE_WEBHOOK_SECRET                 (webhook validation, prefix whsec_)
```

**Known constraint:** XAF (Central African Franc) is not natively supported by Stripe — see `project_stripe_integration.md` in project memory.

---

## Google Maps

**Services used:**
- Directions API — Route calculation between pickup and destination
- Places Autocomplete API — Address search
- Reverse Geocoding — Coordinate to address conversion

**SDKs:**
- `@react-google-maps/api ^2.20.8` — React wrapper for Maps JS SDK
- `@capacitor/google-maps ^8.0.1` — Native maps on Android/iOS
- Direct Maps JS API calls via `google.maps.*` globals

**Custom hooks:**
- `src/hooks/useGoogleMaps.ts` — Loads Maps API, exposes `DirectionsService` + `AutocompleteService`
- `src/hooks/usePlacesAutocomplete.ts` — Address autocomplete

**API routes (server-side key protection):**
- `src/app/api/reverse-geocode/route.ts` — Server-proxied reverse geocoding
- `src/app/api/distance/route.ts` — Server-proxied distance calculation

**Remote pattern allowed:** `lh3.googleusercontent.com` (Google profile photos)

**Required env vars:**
```
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
```

---

## Agora (VoIP / Real-time Audio Calls)

**Purpose:** In-app voice calls between passenger and driver during a ride

**SDKs:**
- `agora-rtc-sdk-ng ^4.24.2` — Web RTC SDK
- `agora-token ^2.0.5` — Token generation (server-side)

**Architecture:**
- Engine interface `IVoipEngine` with `AgoraVoipEngine` implementation: `src/services/voip/engines/agora.engine.ts`
- Service orchestrator: `src/services/voip.service.ts`
- Call lifecycle managed via Firestore `calls` collection + Firebase Cloud Functions (`createCall`, `answerCall`, `endCall`)
- Android foreground service: native `VoipForeground` Capacitor plugin (`src/plugins/`)

**Hook:** `src/hooks/useVoipCall.ts`

**Required env vars:** Agora App ID and certificate (managed server-side via Cloud Functions)

---

## Google Social Login

**Purpose:** Google OAuth sign-in for passengers and drivers

**SDKs:**
- `@capgo/capacitor-social-login ^8.3.8` — Social login for native apps
- Google web client ID configured in `capacitor.config.ts`

**Web Client ID:** `113581657187-6ks0rjk23dah979ngued5pjpe638fq85.apps.googleusercontent.com` (non-secret, public)

---

## Resend (Transactional Email)

**Purpose:** Email verification, password reset, booking confirmations

**SDK:** `resend ^6.9.3`

**Templates:** React Email components in `functions/src/emails/`

**Service:** `src/lib/email-service.ts`, `src/services/email-verification.service.ts`

**Required env vars:**
```
RESEND_API_KEY          (prefix re_)
FROM_EMAIL
FROM_NAME
REPLY_TO
APP_URL
```

---

## Nodemailer (Fallback SMTP)

**Purpose:** Alternative email sending (SMTP transport)

**SDK:** `nodemailer ^8.0.1`

---

## Authentication Methods

| Method | Provider | SDK |
|--------|----------|-----|
| Email + Password | Firebase Auth | `firebase/auth` |
| Phone OTP | Firebase Auth | `firebase/auth` |
| Google OAuth | Firebase Auth + Capacitor Social Login | `@capgo/capacitor-social-login` |

Driver-specific auth flow: `src/app/auth/driver/`, `src/app/driver/login/`

---

## Capacitor Native Plugins

| Plugin | Version | Purpose |
|--------|---------|---------|
| `@capacitor/geolocation` | ^8.1.0 | GPS tracking (driver location) |
| `@capacitor/push-notifications` | ^8.0.2 | Native push notifications |
| `@capacitor/camera` | ^8.0.2 | Document/photo upload |
| `@capacitor/haptics` | ^8.0.1 | Haptic feedback |
| `@capacitor/network` | ^8.0.1 | Network status |
| `@capacitor/preferences` | ^8.0.1 | Secure local key-value storage |
| `@capacitor/device` | ^8.0.1 | Device info |
| `@capacitor/app` | ^8.0.1 | App lifecycle events |

**Custom plugin:** `VoipForeground` — registered via `Capacitor.registerPlugin()` for Android foreground service during active calls

---

## Webhooks

**Incoming (Next.js API routes):**
- `src/app/api/webhooks/stripe/` — Stripe payment events (payment succeeded, transfer completed, etc.)

**Outgoing:**
- Firebase Cloud Functions triggered on Firestore writes (internal, not external webhooks)

---

## CI/CD & Deployment

**Hosting:** Firebase Hosting (static export)

**Functions deployment:** Firebase CLI (`firebase deploy --only functions`)

**Mobile deployment:** Capacitor → Android Studio / Xcode → App stores

**CI Pipeline:** Not detected (no GitHub Actions or similar config found)

---

_Integration audit: 2026-04-03_
