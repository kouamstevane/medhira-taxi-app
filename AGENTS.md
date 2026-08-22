# Medjira Taxi App

Modern taxi reservation and delivery application built with **Next.js 16**, **TypeScript**, **Firebase**, **Tailwind CSS v4**, and **Capacitor** for mobile.

## Commands

- `npm run dev` — Start dev server (Turbopack)
- `npm run build` — Production build
- `npm run lint` — ESLint (next lint)
- `npm run test:ci` — Run Jest tests with coverage
- `npm run test` — Run Jest in watch mode
- `npm run test:firestore:emulators` — Firestore rules tests via emulators
- `npx playwright test` — E2E tests (Playwright)

## Architecture

### Frontend (Next.js App Router)

- `src/app/` — Pages organized by role: `admin/`, `client/`, `driver/`, `auth/`, `login/`
- Feature pages: `taxi/`, `food/`, `colis/` (parcels), `wallet/`, `notifications/`, `historique/`, `profil/`
- `src/components/` — Reusable UI components (shadcn/ui in `ui/`, feature-specific subdirs)
- `src/hooks/` — Custom React hooks (one per concern: `useAuth`, `useDriverTracking`, etc.)
- `src/services/` — Business logic services (Firebase client-side wrappers)
- `src/store/` — Zustand stores (`cartStore`, `driverStore`)
- `src/types/` — TypeScript type definitions
- `src/context/` — React context providers
- `src/config/` — App configuration
- `src/utils/` — Utility functions

### Backend (Firebase Cloud Functions)

- `functions/src/` — Cloud Functions source
  - `authApi/` — Authentication endpoints
  - `walletApi/` — Wallet/payment operations
  - `stripe/` — Stripe integration
  - `voip/` — VoIP/Twilio token generation (TwiML)
  - `email-service.ts` — Email sending (Resend)
  - `admin/` — Admin operations
  - `gdpr/` — GDPR compliance
  - `validators/` — Input validation (Zod)

### Mobile (Capacitor)

- `android/` — Android native project
- `capacitor.config.ts` — Capacitor configuration
- `scripts/` — Mobile build/setup scripts
- `MOBILE_BUILD=true` env var triggers static export mode

### Path Aliases

`@/*` maps to `./src/*`, `./types/*`, `./services/*`, `./hooks/*`, `./components/*`, `./lib/*`

## Tech Stack

- **Framework**: Next.js 16 (App Router, Turbopack)
- **Language**: TypeScript (strict mode)
- **Styling**: Tailwind CSS v4 + shadcn/ui + Radix UI
- **State**: Zustand + React hooks
- **Backend**: Firebase (Auth, Firestore, Storage, Functions, Messaging)
- **Payments**: Stripe (Connect + Payments)
- **Mobile**: Capacitor 8 (Android + iOS)
- **VoIP / SMS**: Twilio Voice SDK + Twilio SMS
- **Maps**: Google Maps API + Capacitor Geolocation
- **Email**: Resend + Nodemailer + React Email
- **Testing**: Jest + SWC + React Testing Library + Playwright

## Conventions

- Language: Code and comments in **English**, UI text in **French**
- Git messages: Conventional commits (`feat:`, `fix:`, `chore:`)
- Components: Functional components with named exports, shadcn/ui patterns
- Services: Singleton pattern with Firebase client SDK
- Types: Centralized in `src/types/` with barrel exports
- Hooks: One hook per file, prefixed with `use`
- No comments unless explicitly requested

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
