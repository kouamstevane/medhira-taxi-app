# Codebase Structure
_Last updated: 2026-04-03_

## Summary

The project is a Next.js 14 App Router application with Capacitor for Android packaging. Source code lives entirely in `src/`. The directory is split by concern: `app/` for routes, `components/` for UI, `services/` for business logic, `hooks/` for React state wrappers, `context/` for global providers, `types/` for TypeScript definitions, `lib/` for shared utilities, and `utils/` for constants and formatting helpers.

---

## Directory Layout

```
medjira-taxi-app/
├── src/
│   ├── app/                    # Next.js App Router — pages and API routes
│   │   ├── api/                # Server-side Route Handlers (Stripe, admin, geocoding)
│   │   ├── admin/              # Admin portal pages
│   │   ├── auth/               # User authentication flows
│   │   ├── driver/             # Driver-facing pages
│   │   ├── food/               # Food delivery vertical
│   │   ├── taxi/               # Taxi booking vertical
│   │   ├── wallet/             # Wallet management
│   │   ├── dashboard/          # User dashboard (post-login home)
│   │   ├── historique/         # Booking/order history
│   │   ├── notifications/      # Notification center
│   │   ├── profil/             # User profile
│   │   ├── login/              # Client login
│   │   ├── layout.tsx          # Root layout (AuthProvider, metadata, fonts)
│   │   ├── LayoutClient.tsx    # Client wrapper (Header, VoipCallProvider, Toaster)
│   │   ├── page.tsx            # Landing/splash page
│   │   └── globals.css         # Global CSS (Tailwind base + CSS variables)
│   ├── components/             # Shared React components
│   │   ├── ui/                 # Primitive/generic UI components
│   │   ├── layout/             # Layout components (Header)
│   │   ├── food/               # Food-domain components
│   │   ├── admin/              # Admin-domain components
│   │   ├── stripe/             # Stripe payment form components
│   │   ├── forms/              # Reusable form components
│   │   ├── notifications/      # Notification handler component
│   │   ├── ActiveCallOverlay.tsx
│   │   ├── IncomingCallOverlay.tsx
│   │   ├── ChatModal.tsx
│   │   └── InvoiceModal.tsx
│   ├── services/               # Business logic and Firebase write operations
│   │   ├── matching/           # Driver matching engine (modular)
│   │   └── voip/               # VoIP engine implementations
│   ├── hooks/                  # Custom React hooks
│   ├── context/                # React Context providers
│   ├── config/                 # Firebase and app configuration
│   ├── lib/                    # Shared library utilities
│   ├── types/                  # TypeScript type definitions
│   ├── utils/                  # Constants, formatters, logger
│   ├── plugins/                # Capacitor plugin wrappers
│   └── store/                  # (Unused/minimal — no global store library)
├── src/__tests__/              # Test suites (unit, integration, e2e, security, performance)
├── functions/                  # Firebase Cloud Functions (separate Node.js project)
├── android/                    # Capacitor Android project
├── public/                     # Static assets (icons, manifest, images)
├── capacitor.config.ts         # Capacitor configuration
├── next.config.ts              # Next.js configuration
├── firebase.json               # Firebase project configuration
├── firestore.rules             # Firestore security rules
├── firestore.indexes.json      # Firestore composite indexes
├── storage.rules               # Firebase Storage security rules
└── jest.config.cjs             # Jest configuration
```

---

## Directory Purposes

### `src/app/` — Pages and Routes

Each subdirectory is a Next.js route segment. All page files are named `page.tsx`. Nearly all pages use `'use client'` directive.

**Route segments:**

| Path | Purpose |
|---|---|
| `src/app/page.tsx` | Splash/landing — redirects authenticated users to `/dashboard` |
| `src/app/layout.tsx` | Root layout — `AuthProvider`, fonts, SEO metadata |
| `src/app/LayoutClient.tsx` | Client layout wrapper — conditional Header, VoipCallProvider, Toaster |
| `src/app/login/` | Client login (email/phone) |
| `src/app/auth/register/` | Client registration (email flow) |
| `src/app/auth/register/phone/` | Client registration (phone/SMS flow) |
| `src/app/auth/reset-password/` | Password reset |
| `src/app/auth/verify-email/` | Email verification gate |
| `src/app/auth/driver/verify/` | Driver email verification |
| `src/app/dashboard/` | Post-login client home — service tiles, recent activity |
| `src/app/taxi/` | Taxi booking flow (form → searching → driver found → trip) |
| `src/app/taxi/confirmation/` | Trip confirmation / receipt |
| `src/app/taxi/components/` | Taxi-page-local components (`NewRideForm`, `DriverFoundView`, `SearchingDriverBottomSheet`, `BonusSelector`) |
| `src/app/food/` | Food delivery restaurant listing |
| `src/app/food/restaurant/[id]/` | Restaurant detail + menu |
| `src/app/food/checkout/` | Cart checkout |
| `src/app/food/orders/` | Client order list |
| `src/app/food/orders/[id]/` | Order tracking |
| `src/app/food/portal/[id]/` | Restaurant owner portal |
| `src/app/food/portal/[id]/menu/` | Menu management |
| `src/app/food/portal/[id]/orders/` | Order management |
| `src/app/food/create/` | Create restaurant (restaurateur registration) |
| `src/app/driver/login/` | Driver login |
| `src/app/driver/register/` | Driver registration (multi-step) |
| `src/app/driver/dashboard/` | Driver home — ride requests, active trip |
| `src/app/driver/profile/` | Driver profile |
| `src/app/driver/gains/` | Driver earnings |
| `src/app/driver/historique/` | Driver trip history |
| `src/app/driver/verify/` | Driver account verification |
| `src/app/driver/verify-email/` | Driver email verification |
| `src/app/admin/drivers/` | Admin: driver management |
| `src/app/admin/users/` | Admin: user management |
| `src/app/admin/restaurants/` | Admin: restaurant management |
| `src/app/wallet/recharger/` | Wallet top-up (Stripe) |
| `src/app/historique/` | Client booking/order history |
| `src/app/notifications/` | Notification center |
| `src/app/profil/` | Client profile |

**API routes:**

| Path | Purpose |
|---|---|
| `src/app/api/stripe/payment-intent/route.ts` | Create/capture/cancel Stripe PaymentIntent |
| `src/app/api/stripe/connect/account/route.ts` | Stripe Connect account info |
| `src/app/api/stripe/connect/onboard/route.ts` | Stripe Connect onboarding link |
| `src/app/api/stripe/connect/payout/route.ts` | Trigger driver payout |
| `src/app/api/stripe/wallet/recharge/route.ts` | Wallet top-up PaymentIntent |
| `src/app/api/webhooks/stripe/route.ts` | Stripe webhook receiver |
| `src/app/api/admin/manage-driver/route.ts` | Admin: approve/reject/suspend driver |
| `src/app/api/admin/manage-user/route.ts` | Admin: user management |
| `src/app/api/admin/manage-restaurant/route.ts` | Admin: restaurant approval |
| `src/app/api/admin/delete-driver-complete/route.ts` | Admin: full driver deletion |
| `src/app/api/admin/send-email/route.ts` | Admin: trigger email via Firebase Functions |
| `src/app/api/distance/route.ts` | Google Maps Distance Matrix proxy |
| `src/app/api/reverse-geocode/route.ts` | Google Maps reverse geocoding proxy |
| `src/app/api/debug/log/route.ts` | Server-side debug logging endpoint |

---

### `src/components/` — Shared UI Components

**`src/components/ui/`** — Generic primitives used across all verticals:
- `MaterialIcon.tsx` — Google Material Symbols icon wrapper
- `BottomNav.tsx` — Bottom navigation bar (with `driverNavItems`, `adminNavItems` exports)
- `GlassCard.tsx` — Glassmorphism card container
- `Button.tsx` — Styled button
- `MapView.tsx` / `NativeMapView.tsx` — Map display (web vs. Capacitor native)
- `MapFallback.tsx` — Map loading placeholder
- `WalletPreview.tsx` — Wallet balance widget
- `LoadingSpinner.tsx` — Loading indicator
- `FloatingActionButton.tsx` — FAB component
- `Alert.tsx`, `Toast.tsx` — Feedback components
- `card.tsx`, `input.tsx` — shadcn/ui primitives

**`src/components/layout/`** — Layout chrome:
- `Header.tsx` — App top bar (shown for authenticated users on non-auth routes)

**`src/components/food/`** — Food delivery components:
- `RestaurantCard.tsx` — Restaurant listing card
- `MenuItemCard.tsx` — Menu item with add-to-cart
- `CartDrawer.tsx` — Slide-up cart panel
- `OrderStatusBadge.tsx` — Order status pill

**`src/components/admin/`** — Admin panel components:
- `AdminHeader.tsx` — Admin-specific header
- `DeleteDriverModal.tsx` — Confirmation modal for driver deletion
- `DriverSkeleton.tsx` — Loading skeleton for driver list

**`src/components/stripe/`** — Payment UI:
- `StripePaymentElement.tsx` — Stripe.js payment form

**`src/components/notifications/`**:
- `NotificationHandler.tsx` — Invisible component that registers FCM token and handles push events

**Root-level components:**
- `ActiveCallOverlay.tsx` — In-call UI overlay (rendered in LayoutClient)
- `IncomingCallOverlay.tsx` — Incoming call UI (rendered in LayoutClient)
- `ChatModal.tsx` — In-trip chat between client and driver
- `InvoiceModal.tsx` — Trip receipt/invoice display

---

### `src/services/` — Business Logic

Each service file corresponds to a domain. Naming convention: `{domain}.service.ts`.

| File | Purpose |
|---|---|
| `taxi.service.ts` | Booking CRUD, trip lifecycle (arrived, started, completed), price calculation |
| `food-delivery.service.ts` | Restaurant and order management (class `FoodDeliveryService`) |
| `auth.service.ts` | Email verification, password reset helpers |
| `driver.service.ts` | Driver profile updates, stats (accepted/declined trips) |
| `driverTracking.service.ts` | GPS location publishing to Firestore (singleton `driverTracking`) |
| `voip.service.ts` | VoIP call lifecycle, Agora engine management (singleton `voipService`) |
| `wallet.service.ts` | Wallet balance reads/writes |
| `notification.service.ts` | In-app notification CRUD |
| `pushNotifications.service.ts` | FCM token registration, push send |
| `chat.service.ts` | In-trip chat messages |
| `invoice.service.ts` | Invoice generation |
| `stripe-payment.service.ts` | Stripe PaymentIntent server-side logic |
| `stripe-connect.service.ts` | Stripe Connect driver earnings accumulation |
| `admin.service.ts` | Admin operations (approve/reject/suspend) |
| `email-verification.service.ts` | Email verification flow |
| `image-compression.service.ts` | Image resize before upload |
| `encryption.service.ts` / `server-encryption.service.ts` | AES encryption for sensitive driver data (SSN, bank) |
| `secureStorage.service.ts` | Capacitor SecureStorage plugin wrapper |
| `audit-logging.service.ts` | Audit trail writes to Firestore |

**`src/services/matching/`** — Driver matching engine:
- `index.ts` — Barrel exports
- `findAvailableDrivers.ts` — Geospatial query for nearby available drivers
- `broadcast.ts` — Write candidates to `bookings/{id}/candidates`, Firestore listeners
- `assignment.ts` — `assignDriver()`, `cancelAssignment()`
- `retry.ts` — `findDriverWithRetry()` with expanding radius (Plan A / Plan B)
- `automaticSearch.ts` — Client-side automatic search orchestration

**`src/services/voip/engines/`**:
- `agora.engine.ts` — Agora RTC SDK implementation of `IVoipEngine`

---

### `src/hooks/` — Custom React Hooks

| File | Purpose |
|---|---|
| `useAuth.ts` | Access `AuthContext` — returns `{ currentUser, userData, loading, isEmailVerified, reloadUser }` |
| `useDriverTracking.ts` | Start/stop GPS tracking for driver, wraps `driverTracking.service.ts` |
| `useVoipCall.ts` | VoIP call state and controls (mute, speaker, hangup) |
| `useGoogleMaps.ts` | Google Maps JS API loader |
| `usePlacesAutocomplete.ts` | Google Places Autocomplete suggestions |
| `useCapacitorGeolocation.ts` | Capacitor Geolocation with permissions handling |
| `useNotifications.ts` | Fetch notification list from Firestore |
| `usePushNotifications.ts` | FCM push notification registration |
| `useToast.ts` | `react-hot-toast` wrapper |
| `index.ts` | Barrel re-exports |

---

### `src/context/` — React Context Providers

| File | Purpose |
|---|---|
| `AuthContext.tsx` | `AuthProvider` — Firebase `onAuthStateChanged`, fetches user doc from `users`/`drivers` collections |
| `VoipCallProvider.tsx` | Listens to `calls` collection for incoming calls, renders call overlays |
| `cartStore.ts` | Food delivery cart state (Zustand or custom context — file not readable but referenced as context) |

---

### `src/config/` — Configuration

| File | Purpose |
|---|---|
| `firebase.ts` | Firebase client SDK init — exports `auth`, `db`, `storage`. Firestore uses `persistentLocalCache` with `persistentMultipleTabManager` for offline support |
| `firebase-admin.ts` | Firebase Admin SDK init for server-side API routes — exports `adminAuth`, `adminDb` |
| `api.ts` | API base URL and endpoint constants |
| `env.ts` | Environment variable validation |
| `keys/` | Key configuration files (not inspected — may contain references to key formats) |

---

### `src/types/` — TypeScript Definitions

| File | Purpose |
|---|---|
| `index.ts` | Barrel re-exports all domain types |
| `user.ts` | `UserType`, `UserData`, `AuthContextType`, `UserProfile` |
| `booking.ts` | `Booking`, `BookingStatus`, `Location`, `CarType`, `PricingConfig` |
| `taxi.ts` | `Driver`, `DriverStatus`, `VehicleInfo`, `LiveLocation` |
| `wallet.ts` | `Wallet`, `Transaction`, `TransactionType` |
| `food-delivery.ts` | `Restaurant`, `MenuItem`, `Order`, `RestaurantFilters` |
| `matching.ts` | `AvailableDriver`, `RideCandidate`, `MatchingMetrics` |
| `voip.ts` | `VoipCallState`, `CallStatus`, `IVoipEngine`, `CallParticipant` |
| `stripe.ts` | Stripe request/response types, `STRIPE_CURRENCY_BY_MARKET` map |
| `chat.ts` | Chat message types |
| `firestore-collections.ts` | Firestore schema documentation as TypeScript interfaces (reference file) |
| `capacitor-google-map.d.ts` | Type declarations for Capacitor Google Maps plugin |

---

### `src/lib/` — Shared Utilities

| File | Purpose |
|---|---|
| `firebase-helpers.ts` | `createOrUpdateUser`, `getUserData`, `calculateTripPrice`, wallet helpers |
| `admin-guard.ts` | `verifyFirebaseToken()`, `getAdminAuth()`, `getAdminDb()` — API route middleware |
| `stripe.ts` | Stripe client initialization |
| `stripe-client.ts` | Stripe.js browser client |
| `utils.ts` | `cn()` (clsx + tailwind-merge), general helpers |
| `validation.ts` | Form validation rules |
| `email-service.ts` | Email sending via Firebase Functions |
| `email-templates.ts` | HTML email templates |

---

### `src/utils/` — Constants and Formatters

| File | Purpose |
|---|---|
| `constants.ts` | `CURRENCY_CODE`, `ACTIVE_MARKET`, `DEFAULT_PRICING`, `LIMITS`, `DEFAULT_URLS`, `PEAK_HOURS` |
| `format.ts` | `formatCurrencyWithCode()`, date/time formatters |
| `logger.ts` | Structured logger — `logger.info()`, `logger.warn()`, `logger.error()` |
| `distance.ts` | Haversine distance calculation |
| `driver.utils.ts` | Driver-specific UI helpers (e.g., `getDriverDashboardInfoMessage`) |
| `firestore-error-handler.ts` | Firestore error code → user message mapping |
| `api-helper.ts` | `fetch` wrapper for internal API routes (adds Bearer token) |
| `driver-deletion.service.ts` | Multi-step driver deletion logic (placed in utils, not services) |
| `test-helpers.ts` / `test-logger.ts` | Test utilities |

---

## Naming Conventions

**Files:**
- Pages: `page.tsx` (Next.js App Router convention)
- API routes: `route.ts`
- Services: `{domain}.service.ts` (e.g., `taxi.service.ts`)
- Hooks: `use{Name}.ts` (e.g., `useAuth.ts`)
- Components: `PascalCase.tsx` (e.g., `RideRequestCard.tsx`)
- Types: `{domain}.ts` (e.g., `booking.ts`, `voip.ts`)
- Utils: `{descriptor}.ts` (e.g., `constants.ts`, `format.ts`)

**React components:**
- Named exports for shared components in `src/components/`
- Default exports for page components in `src/app/`
- Page-local components in `src/app/{route}/components/` subdirectory

**Services:**
- Exported as named async functions from modules (e.g., `export const createBooking = async (...)`)
- Exception: `FoodDeliveryService` (class with static methods), `voipService` (singleton instance)

---

## Where to Add New Code

**New page/route:**
- Create `src/app/{route-name}/page.tsx`
- Add `'use client'` at the top (all pages are client components)
- Add route to `NO_HEADER_ROUTES` in `src/app/LayoutClient.tsx` if it should hide the header

**New API endpoint:**
- Create `src/app/api/{endpoint}/route.ts`
- Use `verifyFirebaseToken(request)` from `src/lib/admin-guard.ts` for auth
- Return `NextResponse.json()`

**New service function:**
- Add to existing `src/services/{domain}.service.ts` if same domain
- Or create `src/services/{domain}.service.ts` with the same naming pattern

**New React hook:**
- Create `src/hooks/use{Name}.ts`
- Export from `src/hooks/index.ts`

**New shared component:**
- Generic/primitive → `src/components/ui/{Name}.tsx`
- Domain-specific → `src/components/{domain}/{Name}.tsx`
- Page-local → `src/app/{route}/components/{Name}.tsx`

**New TypeScript types:**
- Add to appropriate domain file in `src/types/{domain}.ts`
- Export from `src/types/index.ts`

**New constant or formatter:**
- Constants → `src/utils/constants.ts`
- Formatters → `src/utils/format.ts`

---

## Special Directories

**`functions/`:**
- Purpose: Firebase Cloud Functions (Node.js — separate runtime from Next.js)
- Generated: No
- Committed: Yes
- Used for: Email sending, server-side automation triggered by Firestore events

**`android/`:**
- Purpose: Capacitor-generated Android project
- Generated: Partially (by `npx cap sync`)
- Committed: Yes (Capacitor pattern)

**`src/__tests__/`:**
- Purpose: Test suite organized by type
- Sub-dirs: `unit/`, `integration/`, `e2e/`, `security/`, `performance/`, `setup/`

**`.planning/`:**
- Purpose: GSD planning and codebase analysis documents
- Generated: Yes (by GSD commands)
- Committed: Yes (planning artifacts)

**`public/`:**
- Purpose: Static assets served directly by Next.js
- Contains: PWA icons (`icon-192.png`, `icon-512.png`), `manifest.json`, images, `firebase-messaging-sw.js` (FCM service worker)
