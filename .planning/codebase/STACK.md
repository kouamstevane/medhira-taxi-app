# Technology Stack

_Last updated: 2026-04-03_

## Summary

Medjira is a Next.js 16 taxi booking and food delivery application built with TypeScript, Firebase as backend-as-a-service, and Capacitor for native Android/iOS packaging. The app targets both web browsers and mobile devices (Android/iOS) from a single codebase, using Tailwind CSS v4 for styling and Zustand for client-side state management.

---

## Languages

**Primary:**
- TypeScript 5.x — All application code (`src/`, `functions/src/`)

**Secondary:**
- JavaScript — Build/utility scripts (`scripts/`, `optimize-images.js`, `convert-svg-to-webp.js`)
- CSS — Global styles via `src/app/globals.css`

---

## Runtime

**Environment:**
- Node.js (version determined by host; `@types/node ^25` implies Node 22+)

**Package Manager:**
- npm with lockfile (`package-lock.json` present)

**Module System:**
- ESM (`"type": "module"` in `package.json`)

---

## Frameworks

**Core:**
- Next.js ^16.1.6 — Full-stack React framework (App Router, API routes, Server Components)
  - Config: `next.config.ts`
  - Turbopack enabled for dev (`next dev --turbopack`)
  - Mobile build mode: `output: 'export'` when `MOBILE_BUILD=true`
  - TypeScript build errors suppressed: `ignoreBuildErrors: true`

**Mobile:**
- Capacitor ^8.2.0 — Web-to-native bridge for Android/iOS
  - Config: `capacitor.config.ts`
  - App ID: `com.medjiraservice.medjiraserviceapp`
  - Web dir: `out` (Next.js static export)
  - Android project: `android/`

**UI / Styling:**
- React ^19.2.4 + React DOM ^19.2.4
- Tailwind CSS ^4.2.1 — Utility-first CSS
  - PostCSS config: `postcss.config.mjs`
  - Plugin: `@tailwindcss/postcss ^4`
- shadcn ^4.0.8 — Headless component system (config: `components.json`)
- radix-ui ^1.4.3 — Accessible primitives
- lucide-react ^0.577.0 — Icon set
- react-icons ^5.6.0 — Additional icons
- class-variance-authority ^0.7.1 + clsx ^2.1.1 + tailwind-merge ^3.5.0 — Class utilities
- tw-animate-css ^1.4.0 — Animation utilities
- @fontsource/inter ^5.2.8 — Inter font

**Forms & Validation:**
- react-hook-form ^7.71.2 — Form state management
- @hookform/resolvers ^5.2.2 — Zod integration
- zod ^4.3.6 — Schema validation
- libphonenumber-js ^1.12.38 — Phone number parsing/formatting
- react-phone-number-input ^3.4.16 — Phone input component

**State Management:**
- zustand ^5.0.11 — Lightweight global state
  - Cart store: `src/app/wallet/cartStore.ts`

**Testing:**
- jest ^30.2.0 — Test runner
  - Config: `jest.config.cjs`
  - Firestore config: `jest.firestore.config.js`
- @swc/jest ^0.2.39 — Fast SWC transformer
- jest-environment-jsdom ^30.2.0 — Browser environment simulation
- @testing-library/react ^16.3.2 — React component testing
- @testing-library/user-event ^14.6.1 — User interaction simulation
- @testing-library/jest-dom ^6.9.1 — DOM matchers
- @firebase/rules-unit-testing ^5.0.0 — Firestore rules testing

**Linting / Formatting:**
- eslint ^9.39.4 + eslint-config-next ^16.1.6
  - Config: `eslint.config.mjs`

**Build / Dev Tools:**
- @swc/core ^1.15.18 — Rust-based JS/TS compiler
- sharp ^0.34.5 — Image processing (server-side)
- imagemin ^7.0.1 — Image optimization scripts
- svgo ^4.0.1 — SVG optimization

---

## Key Dependencies

**Documents / PDF:**
- jspdf ^4.2.0 — Client-side PDF generation (invoices)

**Email:**
- @react-email/components ^1.0.10 + @react-email/render ^2.0.4 — React-based email templates
- nodemailer ^8.0.1 — SMTP transport (server-side)
- resend ^6.9.3 — Transactional email API

**Cryptography:**
- crypto-js ^4.2.0 — Client-side encryption utilities
- `src/services/encryption.service.ts` / `server-encryption.service.ts`

**Notifications:**
- react-hot-toast ^2.6.0 — Toast notifications

---

## Configuration

**TypeScript:**
- Target: ES2017
- Strict mode enabled
- Path alias `@/*` resolves to: `./src/*`, `./types/*`, `./services/*`, `./hooks/*`, `./components/*`, `./lib/*`
- Config: `tsconfig.json`

**Build:**
- Production source maps disabled
- Images: unoptimized (handled by sharp scripts), webp format, remote patterns for `lh3.googleusercontent.com` and `firebasestorage.googleapis.com`

**Environment:**
- Client env vars prefixed `NEXT_PUBLIC_`
- Central validation: `src/config/env.ts` (throws on missing required vars)
- `.env.example` at project root documents required keys

---

## Platform Requirements

**Development:**
- Node.js 22+ (inferred from `@types/node ^25`)
- npm
- Firebase CLI (`firebase-tools ^15.10.0`) for emulators and deployment
- Java + Android SDK for Android builds

**Production:**
- Firebase Hosting (`out/` directory, static export)
- Firebase Functions (Node.js runtime, `functions/` directory)
- Android APK / iOS IPA via Capacitor for native channels

---

_Stack analysis: 2026-04-03_
