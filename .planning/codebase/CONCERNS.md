# Technical Concerns
_Last updated: 2026-04-03_

## Summary

This is a brownfield Next.js 14 app (taxi + food delivery) backed by Firebase/Firestore and Stripe. The overall architecture is sound, but the codebase carries significant incomplete payment integration debt (Mobile Money is simulated), exposed hardcoded API keys in source files, dev/debug pages accessible in production, and near-zero meaningful test coverage. Several features advertised in the UI (referral system) have no implementation behind them.

---

## Critical Concerns

### 1. Mobile Money payment is a stub — money credited without real charge
- **Issue:** Orange Money and MTN Mobile Money recharge flow calls `simulateMobileMoneyAPI()`, which does nothing (a 1-second artificial delay) then immediately credits the user's Firestore wallet balance.
- **Files:** `src/app/wallet/recharger/page.tsx` lines 71–73, 133–140
- **Impact:** Any user who selects "Orange Money" or "MTN" can add arbitrary amounts to their wallet for free. This is a live financial risk if the app is in production with real users.
- **Fix approach:** Integrate the real Orange Money / MTN MoMo SDK or a payment aggregator (e.g. CinetPay, PayDunya) and move balance credit to a verified webhook.

### 2. Hardcoded Google Maps API key in source code
- **Issue:** A real Google Maps Browser API key (`AIzaSyDMXeXZCFAVGeSFW_-3MYkrqV2bN1SXY-8`) is hardcoded as a fallback in two places. This key is committed to git and will be in version history permanently.
- **Files:**
  - `src/hooks/useGoogleMaps.ts` line 138
  - `src/app/create-collections/page.tsx` lines 32, 327
- **Impact:** Key can be scraped from the repository and abused, leading to billing charges on the project owner's Google Cloud account.
- **Fix approach:** Remove hardcoded values. Rely solely on `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` env var. Add key restrictions in Google Cloud Console (HTTP referrer restrictions). Rotate the key.

### 3. Hardcoded Firebase project credentials in source code
- **Issue:** Firebase `apiKey`, `projectId`, `appId`, `measurementId`, `messagingSenderId`, and `authDomain` for the production project `medjira-service` are hardcoded as `|| "..."` fallbacks in `create-collections/page.tsx`.
- **Files:** `src/app/create-collections/page.tsx` lines 31–38, 326–333
- **Impact:** Full Firebase project identity exposed in git history. Anyone can use these credentials to connect to the production Firestore database (subject only to security rules).
- **Fix approach:** Remove all hardcoded credential fallbacks. Delete this page or gate it behind admin-only access with proper auth checks.

### 4. Debug and admin-seeding pages deployed to production
- **Issue:** Two pages are deployed at public routes with no auth protection:
  - `/create-collections` — can create/delete Firestore collections
  - `/test-matching` — exposes internal matching logic
- **Files:** `src/app/create-collections/page.tsx`, `src/app/test-matching/page.tsx`
- **Impact:** Any anonymous user can hit `/create-collections` and run Firestore write/delete operations against the production database.
- **Fix approach:** Delete these pages before production deploy, or add server-side admin auth middleware. At minimum, add to `next.config.js` redirects to block the routes.

### 5. `.tmp_build` route files are inert dead code in the API directory
- **Issue:** Four API route files exist only as `.tmp_build` artifacts (not `.ts` files), meaning Next.js does not serve them. The actual route handler is missing.
- **Files:**
  - `src/app/api/admin/delete-driver-complete/route.ts.tmp_build`
  - `src/app/api/admin/send-email/route.ts.tmp_build`
  - `src/app/api/debug/log/route.ts.tmp_build`
  - `src/app/api/reverse-geocode/route.ts.tmp_build`
- **Impact:** The driver deletion flow (`/api/admin/delete-driver-complete`) called from the admin page will 404 silently. Email sending via `/api/admin/send-email` will also fail. The debug log endpoint consumed by the client logger is broken.
- **Fix approach:** Rename each file from `route.ts.tmp_build` to `route.ts` and verify that the handler compiles correctly.

---

## Technical Debt

### 6. Deprecated `encryption.service.ts` still present in codebase
- **Issue:** `src/services/encryption.service.ts` is marked `@deprecated` in its own JSDoc. The file documents that client-side encryption was insecure (key accessible in browser, salt stored in `localStorage` and thus XSS-vulnerable). The replacement is `serverEncryptionService`.
- **Files:** `src/services/encryption.service.ts`
- **Impact:** If any code path still imports this service, sensitive data (driver SSN, bank details) may be weakly encrypted client-side.
- **Fix approach:** Verify no remaining imports of `encryption.service` (currently none detected), then delete the file to prevent future accidental use.

### 7. Auth token stored in `localStorage` in the API client
- **Issue:** `src/config/api.ts` reads `localStorage.getItem('auth-token')` to attach auth headers. Firebase ID tokens should be obtained via `auth.currentUser.getIdToken()`, not stored manually in `localStorage` (XSS risk).
- **Files:** `src/config/api.ts` lines 48–50
- **Impact:** If the `APIClient` class is used for authenticated calls, tokens stored in `localStorage` are accessible to any JavaScript running on the page (XSS attack vector). However, the `APIClient` class does not appear to be imported anywhere in the current codebase — it may be unused dead code.
- **Fix approach:** Delete `APIClient` if unused, or refactor to call `auth.currentUser?.getIdToken()` inline.

### 8. Broad `eslint-disable` suppressing all lint rules in key files
- **Issue:** Several important UI files disable ESLint entirely (not just the specific rule) with `/* eslint-disable */` at the file top.
- **Files:**
  - `src/app/auth/register/RegisterContent.tsx` (full disable)
  - `src/app/driver/login/page.tsx` (full disable)
  - `src/app/driver/verify-email/page.tsx` (full disable)
- **Impact:** Hooks dependency warnings, unused variable warnings, and type safety warnings are silently suppressed in authentication-critical components. React hooks dependency bugs (stale closures) can go undetected.
- **Fix approach:** Replace file-level disables with targeted `// eslint-disable-next-line` annotations for specific known suppressions.

### 9. Pervasive `any` typing in production code (87+ instances)
- **Issue:** 87 non-error `any` usages exist across production `src/` files, with full `/* eslint-disable @typescript-eslint/no-explicit-any */` at the top of core files like `src/app/driver/dashboard/page.tsx` and `src/services/matching/retry.ts`.
- **Files:** `src/app/driver/dashboard/page.tsx`, `src/services/matching/retry.ts`, multiple others
- **Impact:** Type safety loss in the driver-facing booking flow, which handles real-time Firestore data and money-related state.
- **Fix approach:** Replace `any` with proper interfaces or `unknown` + type guards progressively; `src/types/firestore-collections.ts` (899 lines) already has many type definitions that could be reused.

### 10. Admin authorization checked inconsistently across admin pages
- **Issue:** Each admin page (`/admin/drivers`, `/admin/restaurants`, `/admin/users`) independently re-implements its own admin check by reading the `admins` Firestore collection client-side. There is no shared `useAdmin` hook or Next.js middleware guard.
- **Files:** `src/app/admin/drivers/page.tsx` lines 109–145, `src/app/admin/restaurants/page.tsx`, `src/app/admin/users/page.tsx`
- **Impact:** If a new admin page is added without copy-pasting the auth check, it will be unprotected. The check also runs on the client and has a flash-of-content window while `isAdmin === null`.
- **Fix approach:** Create a `src/middleware.ts` or a shared `withAdminGuard` wrapper that performs the Firestore admin check server-side. Alternatively, use Firebase custom claims (`admin: true`) that are verifiable without a Firestore read.

### 11. 326 `console.log/error/warn` calls in production source
- **Issue:** 326 raw console calls exist across non-test source files, including log lines that print internal system state in the driver dashboard and auth flows.
- **Impact:** Sensitive debug data (driver UIDs, booking IDs, auth errors) is exposed in browser DevTools in production. Performance overhead from serialization of large objects.
- **Fix approach:** Route all logging through the existing `src/utils/logger.ts` wrapper (which already exists and is used in some services), which can be configured to suppress output in production.

---

## Missing Features / Incomplete Work

### 12. Referral/parrainage system is UI-only — no backend implementation
- **Issue:** The dashboard shows a "Parrainez un ami — Gagnez 500 XAF" marketing banner, but there is no referral code generation, sharing mechanism, or reward crediting logic anywhere in the codebase.
- **Files:** `src/app/dashboard/page.tsx` lines 452–458
- **Impact:** The feature is misleading to users; clicking the banner does nothing.
- **Fix approach:** Either implement the feature (referral code on user profile, Cloud Function to credit bonus on first trip) or remove the banner.

### 13. All matching service tests are stubs — test file is a placeholder
- **Issue:** `src/services/matching/__tests__/assignment.test.ts` contains three test cases, all with `expect(true).toBe(true)` and TODO comments. The assignment service is the core booking-to-driver matching logic.
- **Files:** `src/services/matching/__tests__/assignment.test.ts` lines 33, 39, 44
- **Impact:** The most critical business logic (driver assignment, concurrency handling, availability checks) has zero test coverage. Regressions will go undetected.
- **Fix approach:** Implement the three stubbed tests with proper mocks for `runTransaction` and `getDoc` to validate the assignment state machine.

### 14. Wallet pages migrated from `.jsx` to `.tsx` but old files show as deleted in git
- **Issue:** `src/app/wallet/page.jsx` and `src/app/wallet/historique/page.jsx` are tracked as deleted (`D` status in git) while their `.tsx` replacements exist. The working `.tsx` pages (`src/app/wallet/page.tsx`, `src/app/wallet/historique/page.tsx`) are unstaged modifications.
- **Impact:** If git state is not committed cleanly, a checkout or merge could restore the old `.jsx` files, creating routing conflicts in Next.js (both `.jsx` and `.tsx` at the same path).
- **Fix approach:** Stage and commit the deletions of the old `.jsx` files alongside the new `.tsx` files in the same commit.

### 15. `StatsCard` component deleted but dashboard flow may reference it
- **Issue:** `src/app/driver/dashboard/components/StatsCard.tsx` is deleted (git status `D`). No remaining import of `StatsCard` was found in the current working tree, suggesting the removal is complete — but the deletion is unstaged.
- **Files:** `src/app/driver/dashboard/components/StatsCard.tsx` (deleted)
- **Impact:** Low — no broken import detected. Risk is that the deletion is lost in a merge.
- **Fix approach:** Stage and commit the deletion.

---

## Security Observations

### 16. `/api/debug/log` accepts arbitrary POST data without authentication
- **Issue:** The debug log API route (`route.ts.tmp_build` — currently a `.tmp_build` and therefore not served, but intended to be deployed) accepts POST requests from any client without an auth token, logging `body.message`, `body.code`, `body.stack`, and `body.context` directly to server stdout.
- **Files:** `src/app/api/debug/log/route.ts.tmp_build`
- **Impact:** Once the `.tmp_build` is renamed to `.ts`, this endpoint becomes an unauthenticated server-side log injection vector. An attacker could flood server logs or inject misleading error entries.
- **Fix approach:** Add `verifyFirebaseToken` guard before logging, or restrict to `NODE_ENV === 'development'` only.

### 17. Encryption salt stored in `localStorage` (acknowledged, partially mitigated)
- **Issue:** `src/services/encryption.service.ts` stores `encryption_global_salt` in `localStorage`. This is documented as a known weakness and the service is marked deprecated. However, the file still exists and could be re-imported.
- **Files:** `src/services/encryption.service.ts` lines 99–106
- **Impact:** If re-used, any XSS vulnerability would expose the encryption salt, weakening AES-GCM protection of driver SSN/bank data stored in Firestore.
- **Fix approach:** Delete `encryption.service.ts` entirely now that the server-side replacement exists.

### 18. No rate limiting on public-facing API routes
- **Issue:** None of the Next.js API routes (`/api/stripe/*`, `/api/admin/*`, `/api/distance`, `/api/reverse-geocode`) implement HTTP-level rate limiting. The security test file tests rate limiting via Firebase Auth's built-in limits only, not the app's own API surface.
- **Files:** `src/app/api/` (all routes)
- **Impact:** The Stripe PaymentIntent creation route and wallet recharge route can be hammered without limit. Malicious actors could exhaust Stripe API quotas or create fraudulent payment intents at scale.
- **Fix approach:** Add rate limiting middleware (e.g., `@upstash/ratelimit` with Vercel KV, or a simple in-memory counter for low-traffic scenarios) on Stripe and admin routes.

---

## Performance Observations

### 19. Admin drivers page loads all drivers via `onSnapshot` with client-side filtering
- **Issue:** `src/app/admin/drivers/page.tsx` subscribes to the entire `drivers` collection with `onSnapshot` and applies status filtering client-side (lines 160–173). As the driver count grows, this downloads the full collection on every page open and re-renders on every document change.
- **Files:** `src/app/admin/drivers/page.tsx` lines 151–180
- **Impact:** With hundreds or thousands of drivers, this will cause slow initial loads, high Firestore read costs, and excessive re-renders.
- **Fix approach:** Move the `where('status', '==', filter)` clause into the Firestore query, paginate with `limit()` + `startAfter()`, and use server-side filtering.

### 20. Driver dashboard performs 13+ Firestore reads on mount
- **Issue:** `src/app/driver/dashboard/page.tsx` calls `getDoc`, `getDocs`, and `onSnapshot` 13 times at component mount (verified by line count). Multiple calls fetch the same driver document at different points.
- **Files:** `src/app/driver/dashboard/page.tsx`
- **Impact:** Cold start for driver dashboard is expensive in Firestore read units and wall-clock time. On slow connections, the driver sees a loading state for several seconds before the trip-matching UI is interactive.
- **Fix approach:** Consolidate driver profile reads into a single `onSnapshot` subscription. Cache driver data in a React context or Zustand store to avoid refetching on re-mounts.

### 21. Google Maps loaded via polling interval (100ms checks, 10s timeout)
- **Issue:** `src/hooks/useGoogleMaps.ts` loads the Maps JS SDK via a `<script>` tag and polls for `window.google?.maps?.places` every 100ms for up to 10 seconds.
- **Files:** `src/hooks/useGoogleMaps.ts` lines 162–176
- **Impact:** 100ms polling loop runs even on fast connections where Maps loads in ~300ms. On slow connections the user waits up to 10 seconds. The polling interval is never cleared if the component unmounts before the timeout.
- **Fix approach:** Use the `callback` parameter of the Maps JS API URL (`&callback=initMap`) or the newer `google.maps.importLibrary()` promise-based API to eliminate polling.

### 22. Large monolithic page files with mixed concerns
- **Issue:** Several pages exceed 800 lines by combining data fetching, business logic, and JSX rendering in a single file:
  - `src/app/driver/register/page.tsx` — 1249 lines
  - `src/app/driver/dashboard/page.tsx` — 946 lines
  - `src/app/driver/profile/page.tsx` — 806 lines
  - `src/app/admin/drivers/page.tsx` — 764 lines
- **Impact:** Hot module replacement is slow. Code is difficult to split-code-import. Cognitive load for future modification is high. These files are prime candidates for accidental logic errors during edits.
- **Fix approach:** Extract data-fetching hooks (`useDriverData`, `useTripState`), sub-components (form steps, card views), and utility functions into separate files alongside each page.
