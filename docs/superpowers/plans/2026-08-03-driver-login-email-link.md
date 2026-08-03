# Driver Login Email Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make driver login and reactivation email buttons open the Android app through the existing verified App Link host, with web fallback.

**Architecture:** Reuse the canonical `medjira-service.web.app` host already used by driver invitation links and declared in the Android manifest. Update both email template implementations and protect the behavior with a focused Functions Jest test.

**Tech Stack:** TypeScript, Firebase Cloud Functions, Jest, Resend email templates, Capacitor Android App Links.

## Global Constraints

- Keep code and comments in English; preserve French UI/email copy.
- Do not change authentication routing or Android manifest configuration.
- Use the existing `/driver/login` route, which redirects to the unified `/login` page.
- Add the regression test before changing production code.

---

### Task 1: Add the failing regression test

**Files:**
- Create: `functions/src/__tests__/driverStatusEmail.test.ts`
- Test: `functions/src/__tests__/driverStatusEmail.test.ts`

**Interfaces:**
- Consumes: `sendDriverStatusEmail` from `functions/src/email-service.ts`.
- Produces: assertions that approval and reactivation payloads use `https://medjira-service.web.app/driver/login`.

- [ ] **Step 1: Write the failing test**

Mock Resend like the existing email tests, invoke `sendDriverStatusEmail` once for `approval` and once for `reactivation`, then assert each generated HTML payload contains the canonical App Link and does not contain `https://medjira.com/driver/login`.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm --prefix functions test -- --runInBand src/__tests__/driverStatusEmail.test.ts`

Expected: FAIL because the current templates still contain `https://medjira.com/driver/login`.

### Task 2: Update the production email links

**Files:**
- Modify: `functions/src/email-service.ts:146,194,210`
- Modify: `src/lib/email-templates.ts:29,194`

**Interfaces:**
- Consumes: the existing `APP_URL` and `NEXT_PUBLIC_APP_URL` template paths.
- Produces: approval and reactivation email buttons pointing to the existing verified App Link host.

- [ ] **Step 1: Replace the Functions template host**

Set the Functions `APP_URL` constant to `https://medjira-service.web.app`, keeping the existing `/driver/login` path.

- [ ] **Step 2: Align the shared application templates**

Use `https://medjira-service.web.app` as the production fallback in the approval and reactivation templates while preserving an explicitly configured `NEXT_PUBLIC_APP_URL` value for non-production environments.

- [ ] **Step 3: Run the focused test to verify it passes**

Run: `npm --prefix functions test -- --runInBand src/__tests__/driverStatusEmail.test.ts`

Expected: PASS with both status email link assertions green.

### Task 3: Verify the affected code paths

**Files:**
- Verify: `functions/src/email-service.ts`
- Verify: `src/lib/email-templates.ts`
- Verify: `functions/src/__tests__/driverStatusEmail.test.ts`

- [ ] **Step 1: Run the Functions test suite**

Run: `npm --prefix functions test -- --runInBand`

Expected: PASS with zero failed tests.

- [ ] **Step 2: Run the Functions build**

Run: `npm --prefix functions run build`

Expected: TypeScript compilation exits with code 0.

- [ ] **Step 3: Inspect the diff**

Run: `git diff --check; git diff --stat; git status --short`

Expected: no whitespace errors and only the intended email templates, focused test, and planning documents changed.
