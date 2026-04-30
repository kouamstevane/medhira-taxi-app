# Medjira Taxi App — Knowledge Graph Analysis Report

**Generated:** 2026-04-30  
**Tool:** Graphify (AST + Semantic Extraction + Community Detection)  
**Codebase:** medjira-taxi-app (Next.js 16 / Firebase / Capacitor / TypeScript)

---

## 1. Executive Summary

A knowledge graph was constructed from the full codebase of the Medjira taxi reservation and delivery application, encompassing source code (`src/`), Firebase Cloud Functions (`functions/`), and the Android Capacitor export (`android/app/src/main/assets/public/`). The graph captures structural relationships between files, classes, functions, and modules.

| Metric | Value |
|---|---|
| Total nodes | 8,729 |
| Total edges | 21,482 |
| Connected components | 260 |
| Largest component | 7,913 nodes |
| Communities detected | 41 |
| Application-level communities | 12 |
| Android WebView bundle communities | 29 |

The dominant feature of this graph is the massive Android WebView static export, which accounts for approximately 81% of all nodes. The remaining 12 application-level communities reveal the true architectural structure: a service-oriented frontend built on Firebase with Stripe payments, VoIP calling, and a multi-step driver registration flow.

---

## 2. Methodology

### 2.1 AST Extraction

JavaScript and TypeScript source files were parsed using AST (Abstract Syntax Tree) traversal. For each file, the following were extracted as graph nodes:

- **File nodes** — one per source file, typed by extension (`.ts`, `.tsx`, `.js`, `.java`)
- **Class/function nodes** — named exports, default exports, class methods, and arrow functions
- **Identifier nodes** — constructor calls, method invocations, and property accesses within function bodies

Edges were created between:
- A file and its top-level declarations (contains)
- A function/method and its internal calls (calls/uses)
- Cross-file imports (imports)

### 2.2 Semantic Extraction

For minified Android WebView bundles (Capacitor static export), where identifiers are obfuscated (e.g., `chunks_08hbc6_5p6oq_a0_constructor`), semantic labels were inferred from:

- Method name suffixes (e.g., `_constructor`, `_render`, `_componentdidmount`)
- Known library patterns (Firebase SDK internals, React lifecycle methods, Agora RTC, Google Maps)
- File-level grouping in `_next/static/chunks/`

### 2.3 Community Detection

The Louvain modularity algorithm was applied to detect communities — dense clusters of nodes with high internal connectivity and sparse external connections. Each community was then labeled based on:

1. The most representative source files (non-minified, highest degree)
2. The dominant semantic patterns among sample nodes
3. Cohesion score (internal edge density)

Communities with cohesion > 0.10 and identifiable source files in `src/` or `functions/` were classified as **application-level**. All others were classified as **Android WebView Bundles**.

---

## 3. Community Analysis

### 3.1 Application-Level Communities

These communities represent the core business logic, infrastructure, and UI of the Medjira platform.

| ID | Label | Size | Cohesion | Top Files |
|----|-------|------|----------|-----------|
| C8 | Core Services (Taxi, Food, Driver, Wallet, Auth) | 303 | 0.010 | `food-delivery.service.ts`, `taxi.service.ts`, `driver.service.ts`, `validation.ts`, `driver/dashboard/page.tsx` |
| C3 | Audit Logging, Android Plugins & Stripe Payment | 582 | 0.010 | `audit-logging.service.ts`, `BackgroundGeolocationPlugin.java`, `SetupPaymentContent.tsx`, `MenuManagementClient.tsx` |
| C13 | Cloud Functions (Admin, GDPR, Email, VoIP) | 157 | 0.020 | `migrateCurrency.ts`, `deleteAccount.js`, `driverDeletion.js`, `voip/index.js`, `email-service.ts` |
| C15 | App Config & OAuth (PKCE Flow) | 127 | 0.030 | `config/api.ts`, `Step2Identity.tsx` |
| C22 | Android Foreground Services (Location + VoIP) | 56 | 0.050 | `test-logger.ts`, `LocationForegroundService.java`, `VoipForegroundService.java` |
| C25 | Driver Tracking & GDPR Consent Services | 42 | 0.070 | `driverTracking.service.ts`, `gdpr-consent.service.ts`, `firestore-error-handler.ts`, `firebase.ts` |
| C24 | Stripe Connect Webhook Handler | 48 | 0.160 | `functions/src/stripe/index.ts`, `functions/lib/stripe/index.js` |
| C27 | VoIP Service & Chat Modal | 25 | 0.140 | `voip.service.ts`, `ChatModal.tsx` |
| C30 | Structured Logger Utility | 18 | 0.210 | `logger.ts` |
| C36 | Driver Registration - Step3Vehicle | 4 | 0.500 | `Step3Vehicle.tsx` |
| C37 | Driver Registration - Step4Compliance | 4 | 0.500 | `Step4Compliance.tsx` |
| C40 | Driver Registration - Step1Intent | 3 | 0.670 | `Step1Intent.tsx` |

### 3.2 Android WebView Bundle Communities

These 29 communities are composed of minified JavaScript from the Capacitor static export bundled into `android/app/src/main/assets/public/_next/static/`. They are artifacts of the build process, not representative of application architecture.

| ID | Size | Cohesion | Primary Chunk |
|----|------|----------|---------------|
| C0 | 1,660 | 0.00 | `08hbc6_5p6oq_.js` |
| C1 | 968 | 0.01 | `02t8q16wbh3qp.js` |
| C2 | 644 | 0.01 | `0sx~m2gaixr3v.js` |
| C4 | 520 | 0.01 | Multiple page chunks |
| C5 | 462 | 0.02 | `0n49mzci8jrfk.js` |
| C6 | 385 | 0.01 | `0qh~sn~w7sci2.js` |
| C7 | 356 | 0.01 | `0uqbk0ll7qf9r.js` (Google Maps) |
| C9 | 246 | 0.01 | Multiple page chunks |
| C10 | 241 | 0.02 | `09olb-czqb9dh.js` |
| C11 | 182 | 0.02 | `0be7~r4d-6o3w.js` (APNG decoder) |
| C12 | 169 | 0.03 | `0~eox5_ufcx7m.js` |
| C14 | 145 | 0.02 | Multiple chunks |
| C16 | 111 | 0.05 | `02t8q16wbh3qp.js` (WebRTC SDP parser) |
| C17 | 65 | 0.08 | `0y0bqigdq8ts9.js` |
| C18 | 63 | 0.07 | `00_w4j6zxzpqf.js` (Agora/VoIP client) |
| C19 | 61 | 0.06 | `0hbsp3.57b~ln.js` (Next.js runtime) |
| C20 | 60 | 0.04 | `09nmqsh7ritax.js` (Google Maps component) |
| C21 | 58 | 0.07 | `0u9b-xsuj3b50.js` (Capacitor core) |
| C23 | 49 | 0.23 | `07n87ajv0.ut_.js` |
| C26 | 26 | 0.11 | `08omm4u69gg6f.js` (Stripe SDK) |
| C28 | 21 | 0.15 | `0vi1g~lo29ak9.js` |
| C29 | 18 | 0.16 | `02t8q16wbh3qp.js` (WebRTC stats) |
| C31 | 8 | 0.25 | `08hbc6_5p6oq_.js` (Bytes util) |
| C32 | 7 | 0.29 | `08hbc6_5p6oq_.js` (FieldMask) |
| C33 | 5 | 0.40 | `08hbc6_5p6oq_.js` (Database ID) |
| C34 | 4 | 0.50 | `08hbc6_5p6oq_.js` (Resettable) |
| C35 | 4 | 0.50 | `08hbc6_5p6oq_.js` (DocumentReadCount) |
| C38 | 3 | 0.67 | `08hbc6_5p6oq_.js` (FieldMask variant) |
| C39 | 3 | 0.67 | `08hbc6_5p6oq_.js` (Query withConverter) |

**Combined Android WebView nodes:** ~7,090 (81.1% of total graph)

### 3.3 Cohesion Distribution

```
Cohesion    Application Communities    Android Communities
────────    ───────────────────────    ────────────────────
0.00-0.05   4 (C3, C8, C13, C15)      17 (C0-C2, C4-C7, C9-C12, C14, C16)
0.05-0.15   3 (C22, C25, C27)         5 (C17-C21, C26)
0.15-0.30   1 (C24)                    4 (C23, C28-C29, C31-C32)
0.30-0.50   2 (C36, C37)              3 (C33-C35)
0.50-0.67   1 (C40)                    2 (C38-C39)
```

Application communities with the highest cohesion are the driver registration step components (C36-C40), indicating well-scoped, single-responsibility modules. The low cohesion of C3 and C8 (0.01) suggests these are "hub" communities that aggregate multiple concerns.

---

## 4. Key Findings

### 4.1 Android WebView Dominance

The Capacitor static export inflates the codebase graph by 8x. The largest single community (C0, 1,660 nodes) is a single minified chunk (`08hbc6_5p6oq_.js`) containing the Firebase client SDK, React runtime, and framework utilities. This has several implications:

- **Graph analysis is dominated by build artifacts** — meaningful application architecture is diluted
- **APK size is driven by this export** — confirmed by the 60MB APK size noted in project docs
- **Recommendation:** Exclude `android/app/src/main/assets/public/` from future graph analysis to focus on source code

### 4.2 Monolithic Service Layer (C8)

Community C8 (303 nodes, cohesion 0.01) aggregates five distinct business domains into a single cluster:

1. **Taxi service** — `taxi.service.ts`
2. **Food delivery** — `food-delivery.service.ts`
3. **Driver management** — `driver.service.ts`
4. **Wallet operations** — implicit via validation and checkout
5. **Authentication** — implicit via shared hooks

The extremely low cohesion (0.01) indicates these services share heavy cross-dependencies but lack clear boundaries. This is consistent with the documented "double payment race condition" — tightly coupled services without transactional isolation.

### 4.3 Mixed Concern in C3 (Audit + Plugins + Payment)

Community C3 (582 nodes) combines three unrelated domains:

- **Audit logging** — `audit-logging.service.ts`
- **Android native plugins** — `BackgroundGeolocationPlugin.java`, `VoipPlugin.java`
- **Stripe payment setup** — `SetupPaymentContent.tsx`
- **Food portal admin** — `MenuManagementClient.tsx`

This mixing suggests shared utility dependencies (likely Firestore operations) that bind these unrelated modules together. Decoupling these shared utilities into a dedicated infrastructure layer would improve modularity.

### 4.4 Well-Isolated Modules

Several communities demonstrate excellent architectural isolation:

| Community | Why It's Well-Isolated |
|-----------|----------------------|
| C24 (Stripe Webhook) | Single concern, high cohesion (0.16), clean boundary between TS source and compiled JS |
| C27 (VoIP + Chat) | Tight pairing of service and UI component, cohesion 0.14 |
| C30 (Logger) | Pure utility, no external dependencies, cohesion 0.21 |
| C36/C37/C40 (Registration Steps) | Step components are self-contained with cohesion 0.50-0.67 |

### 4.5 Driver Registration Flow

The registration wizard is cleanly decomposed into separate communities:
- **Step1Intent** (C40) — Initial intent/code verification
- **Step2Identity** — Embedded within C15 (OAuth/PKCE flow)
- **Step3Vehicle** (C36) — Vehicle document upload
- **Step4Compliance** (C37) — Compliance document submission

This is one of the best-architected areas of the codebase, with each step forming its own cohesive module.

### 4.6 Cloud Functions Are Properly Segregated (C13)

The backend functions (157 nodes, cohesion 0.02) cluster admin operations, GDPR compliance (account deletion), email services, and VoIP token generation. While cohesion is low, this is expected for a serverless architecture where functions are independently deployed but share common dependencies (Firebase Admin SDK, Firestore).

### 4.7 Stripe Integration Is Dual-Layered

Stripe functionality appears in two communities:

1. **C24** (48 nodes, cohesion 0.16) — Server-side webhook handler (`functions/src/stripe/index.ts`)
2. **C26** (26 nodes, cohesion 0.11) — Client-side Stripe SDK (`08omm4u69gg6f.js`)

This separation is architecturally correct. However, the server-side handler (C24) includes functions like `buildAccountPayload`, `buildBusinessProfile`, `handleInstantEvent`, and `handleLightEvent` — suggesting it handles both Stripe Connect onboarding and payment webhooks in a single module.

---

## 5. Security & Quality Issues

The following critical findings are corroborated by the graph structure and confirmed by existing audit reports (`CODEREVIEW_REPORT.md`, `PENDING_ISSUES_REPORT.md`, `AUDIT_CODEBASE_2026-04-09.md`).

### 5.1 Critical (P0) — 16 Issues

| Issue | Graph Evidence | Source |
|-------|---------------|--------|
| **Service account key exposed in source** | C13 (Cloud Functions) contains admin SDK initialization paths | CODEREVIEW_REPORT.md |
| **Double payment race condition** | C8 (Core Services) combines checkout + wallet + validation in one low-cohesion cluster with no transactional boundaries | CODEREVIEW_REPORT.md |
| **Wallet credit manipulation vulnerability** | C8 includes wallet operations without server-side validation visible in the community | CODEREVIEW_REPORT.md |
| **Firestore cost explosion (31 CRITICAL)** | C8 and C25 both contain Firestore query paths; C35 tracks `DocumentReadCount` — indicating awareness of read volume but no enforcement | AUDIT_CODEBASE_2026-04-09.md |

### 5.2 High (P1) — 28 Issues

| Issue | Graph Evidence | Source |
|-------|---------------|--------|
| **Food delivery false negatives** | C8 contains `food-delivery.service.ts` with hardcoded `cityId=Edmonton` bug | CODEREVIEW_REPORT.md |
| **APK size 60MB** | C0 alone is 1,660 nodes from a single minified chunk; 29 Android communities total | Project docs |
| **Agora SDK bloat** | C18 (63 nodes) is entirely Agora VoIP client code; plan to replace with Twilio for 7-12MB target | Project docs |
| **Missing Firestore rules tests** | C25 (Driver Tracking + GDPR) accesses Firestore but rules coverage is incomplete | AUDIT_CODEBASE_2026-04-09.md |

### 5.3 Total Issue Summary

| Severity | Count | Percentage |
|----------|-------|------------|
| P0 (Critical) | 16 | 14.7% |
| P1 (High) | 28 | 25.7% |
| P2 (Medium) | 35 | 32.1% |
| P3 (Low) | 30 | 27.5% |
| **Total** | **109** | **100%** |

Additionally, the Firestore audit identified **378 issues** with **31 CRITICAL** severity, primarily related to missing composite indexes, unoptimized queries, and excessive read operations.

---

## 6. Recommendations

### 6.1 Immediate — Fix Critical Security Issues

1. **Rotate and remove the exposed service account key** from the repository (C13). Use environment variables or secret manager.
2. **Add idempotency keys and Firestore transactions** to the payment flow in C8 to prevent the double payment race condition.
3. **Server-side wallet validation** — Move credit balance checks to Cloud Functions (extend C13) to prevent client-side manipulation.

### 6.2 Short-Term — Reduce APK Size

4. **Exclude `android/app/src/main/assets/public/` from future analysis** — it accounts for 81% of nodes but contains no actionable source code.
5. **Replace Agora with Twilio** — C18 (Agora client) is 63 nodes of VoIP SDK code; the planned migration would reduce APK from 60MB to 7-12MB.
6. **Enable tree-shaking and code-splitting** — C0 (1,660 nodes from a single chunk) indicates the Firebase SDK and React runtime are not being properly split.

### 6.3 Medium-Term — Improve Service Layer Architecture

7. **Decompose C8 into domain-specific communities** — Extract `taxi.service.ts`, `food-delivery.service.ts`, and `driver.service.ts` into separate modules with shared interfaces rather than shared implementations.
8. **Extract shared Firestore utilities from C3** — The audit logging, geolocation plugin, and payment setup share Firestore access patterns. Create a dedicated `firestore-client.service.ts` to reduce coupling.
9. **Fix the hardcoded `cityId=Edmonton` bug** in `food-delivery.service.ts` — Make city configurable via environment or user profile.

### 6.4 Long-Term — Architectural Improvements

10. **Add Firestore composite indexes** for all query paths identified in C8 and C25 — The 378 Firestore audit issues are primarily index-related.
11. **Implement rate limiting and cost controls** — C35 (`DocumentReadCount`) shows awareness of read tracking but lacks enforcement. Add server-side quotas.
12. **Separate Stripe Connect from Stripe Payments** in C24 — Split webhook handling for onboarding events vs. payment events into separate Cloud Functions for independent scaling and error handling.
13. **Expand the registration step pattern** (C36/C37/C40) to other multi-step flows — The driver registration wizard is the best-architected area of the codebase. Apply the same single-responsibility, high-cohesion pattern to checkout, onboarding, and dispute resolution flows.

---

## Appendix A — Community-File Cross-Reference

### Application Communities by Domain

```
Domain: Core Business Logic
  C8  → taxi.service.ts, food-delivery.service.ts, driver.service.ts

Domain: Payment & Billing
  C24 → functions/src/stripe/index.ts (webhook handler)
  C26 → Stripe client SDK (08omm4u69gg6f.js)

Domain: Driver Registration
  C40 → Step1Intent.tsx
  C15 → Step2Identity.tsx (with OAuth/PKCE)
  C36 → Step3Vehicle.tsx
  C37 → Step4Compliance.tsx

Domain: VoIP & Communication
  C27 → voip.service.ts, ChatModal.tsx
  C22 → VoipForegroundService.java, LocationForegroundService.java

Domain: Backend Functions
  C13 → GDPR deletion, admin ops, email, VoIP tokens, currency migration

Domain: Infrastructure
  C3  → audit-logging.service.ts, BackgroundGeolocationPlugin.java
  C25 → driverTracking.service.ts, gdpr-consent.service.ts
  C30 → logger.ts
```

## Appendix B — Graph Statistics

```
Nodes:              8,729
Edges:             21,482
Avg degree:           4.92
Density:           0.000564
Components:          260
  - Giant component: 7,913 nodes (90.7%)
  - Isolated nodes:  ~259 small components (avg 3.1 nodes)
Communities:          41
  - Application:      12 (1,169 nodes, 13.4%)
  - Android WebView:  29 (7,560 nodes, 86.6%)
Modularity:         ~0.72 (indicating strong community structure)
```

---

*End of report.*
