# Editable Personal Driver Plans Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Allow admins to edit the Basic, Classic, and Premium Personal Driver plan content and calculation parameters, applying changes only to new subscriptions and future renewals.

**Architecture:** Store one validated plan document per fixed plan in the public-read, client-write-denied Firestore collection personal_driver_plans/{planId}. The existing admin callable owns all writes and audit fields. Client pages and backend quote creation read the same catalogue; static plans remain safe defaults and paid subscriptions keep their persisted price and entitlement snapshots.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict mode, Firebase Firestore v12, Firebase Cloud Functions v2, Zod v4, Jest 30, React Testing Library, Firestore emulator.

## Global Constraints

- Keep fixed plan IDs basic, classic, and premium; do not add create or delete operations.
- Keep the calculation algorithm controlled by code: max(minimumAmount, monthlyDistanceKm * pricePerKm).
- Apply edits to new subscriptions and future renewals only; never rewrite existing subscription snapshots.
- Keep code and comments in English and UI copy in French.
- Route every privileged write through adminManagePersonalDriver after server-side admin verification.
- Preserve the current static plan values as fallback when Firestore data is absent or unusable.
- Read the installed Next.js 16 guides under node_modules/next/dist/docs/01-app/ before changing App Router files.

## File Map

Create:

- src/services/personal-driver/plan-config.service.ts — client Firestore read, normalization, validation, and fallback.
- src/services/personal-driver/plan-config.service.test.ts — loader tests.
- src/hooks/usePersonalDriverPlans.ts — React hook for the loaded catalogue.
- src/app/personal-driver/PersonalDriverPlansProvider.tsx and layout.tsx — one shared load for the Personal Driver route tree.
- src/app/admin/personal-driver/PersonalDriverPlansEditor.tsx and its test — admin forms and save behavior.
- functions/src/personalDriver/planConfig.ts and its test — backend defaults, Firestore loading, and normalization.

Modify:

- src/types/personal-driver.ts and src/services/personal-driver/plans.ts — plan metadata and fixed order.
- Personal Driver presentation files under src/app/personal-driver/ — consume the live catalogue.
- src/app/admin/personal-driver/PersonalDriverAdminPageClient.tsx — mount the editor.
- functions/src/personalDriver/pricing.ts — pure calculation with injected plans.
- functions/src/personalDriver/createSubscriptionPayment.ts, renewSubscriptionPayment.ts, and clientManagePersonalDriver.ts — dynamic new quotes and stable old entitlements.
- functions/src/personalDriver/adminManagePersonalDriver.ts and tests — secured updatePlan action.
- firestore.rules and tests/firestore/personal-driver.rules.test.ts — public plan reads and denied client writes.

Before implementation, create an isolated codex/ worktree using superpowers:using-git-worktrees. Every task follows TDD: write the named failing test, run it and observe the expected failure, implement the minimum change, rerun the focused test, run the regression command, and commit.

## Task 1: Add the typed client catalogue loader

**Files:**
- Create: src/services/personal-driver/plan-config.service.ts
- Create: src/services/personal-driver/plan-config.service.test.ts
- Modify: src/types/personal-driver.ts
- Modify: src/services/personal-driver/plans.ts

**Interfaces:**
- PERSONAL_DRIVER_PLAN_IDS: PersonalDriverPlanId[]
- getPersonalDriverPlans(): Promise<PersonalDriverPlansResult>
- normalizePersonalDriverPlan(planId, raw): PersonalDriverPlan | null
- PersonalDriverPlansResult = { plans, source: 'firestore' | 'fallback', error: Error | null }

- [ ] **Step 1: Write the failing tests.**

Mock getDocs and cover a valid Premium override, missing-plan defaults, invalid-plan fallback, and Firestore read failure:

~~~ts
it('uses a valid Firestore override and defaults for missing plans', async () => {
  mockGetDocs.mockResolvedValue({
    docs: [{ id: 'premium', data: () => ({ name: 'Premium Plus', minimumAmount: 800 }) }],
  });
  await expect(getPersonalDriverPlans()).resolves.toMatchObject({
    source: 'firestore',
    plans: {
      premium: expect.objectContaining({ name: 'Premium Plus', minimumAmount: 800 }),
      basic: expect.objectContaining({ id: 'basic' }),
      classic: expect.objectContaining({ id: 'classic' }),
    },
  });
});

it('falls back to every static plan when Firestore fails', async () => {
  mockGetDocs.mockRejectedValue(new Error('offline'));
  await expect(getPersonalDriverPlans()).resolves.toMatchObject({
    source: 'fallback',
    plans: PERSONAL_DRIVER_PLANS,
    error: expect.any(Error),
  });
});
~~~

- [ ] **Step 2: Run the focused test and verify the expected failure.**

Run npx jest src/services/personal-driver/plan-config.service.test.ts --runInBand. Expected: FAIL because the loader does not exist.

- [ ] **Step 3: Implement the loader.**

Add optional updatedAt and updatedBy metadata to the plan document type. Read collection(db, 'personal_driver_plans'), accept only the fixed IDs, validate non-empty text, finite non-negative numbers, positive integer minimum distance, unique weekdays in 0..6, and one to twelve non-empty benefits. Merge each valid document over its static default. Return all defaults and source fallback if the read throws.

- [ ] **Step 4: Run focused tests and commit.**

Run npx jest src/services/personal-driver/plan-config.service.test.ts src/services/personal-driver/pricing.service.test.ts --runInBand. Expected: PASS. Commit with:

~~~text
git add src/types/personal-driver.ts src/services/personal-driver/plans.ts src/services/personal-driver/plan-config.service.ts src/services/personal-driver/plan-config.service.test.ts
git commit -m 'feat: add personal driver plan catalogue loader'
~~~

## Task 2: Make backend pricing configuration-driven

**Files:**
- Create: functions/src/personalDriver/planConfig.ts
- Create: functions/src/personalDriver/__tests__/planConfig.test.ts
- Modify: functions/src/personalDriver/pricing.ts
- Modify: functions/src/personalDriver/__tests__/pricing.test.ts

**Interfaces:**
- getConfiguredPersonalDriverPlans(db): Promise<PersonalDriverPlans>
- calculatePersonalDriverPrices(input, plans = DEFAULT_PERSONAL_DRIVER_PLANS): PersonalDriverPriceComparison
- Backend plans include all client fields, including includedSpecialTrips.

- [ ] **Step 1: Write failing tests.**

Test that Firestore Premium minimumAmount 800 overrides the default while missing plans remain default. Test that calculatePersonalDriverPrices receives an injected plan map and calculates with the injected value.

~~~ts
const plans = structuredClone(DEFAULT_PERSONAL_DRIVER_PLANS);
plans.premium.minimumAmount = 800;
const result = calculatePersonalDriverPrices(
  { monthlyDistanceKm: 600, requestedWeekdays: [1, 2, 3, 4, 5] },
  plans,
);
expect(result.plans.premium.totalBeforeTax).toBe(800);
~~~

- [ ] **Step 2: Run and observe the expected failure.**

Run npm --prefix functions test -- --runInBand src/personalDriver/__tests__/planConfig.test.ts src/personalDriver/__tests__/pricing.test.ts. Expected: FAIL because the loader and injected plan argument do not exist.

- [ ] **Step 3: Implement defaults, normalization, and injection.**

Move the existing backend values into DEFAULT_PERSONAL_DRIVER_PLANS. Read personal_driver_plans with the Admin SDK, normalize each fixed ID over its default, and use defaults for missing or invalid documents. Change the pure calculator to accept an optional plan map. Use plans[planId].includedSpecialTrips instead of a hardcoded limit map.

- [ ] **Step 4: Run build and commit.**

Run npm --prefix functions test -- --runInBand src/personalDriver/__tests__/planConfig.test.ts src/personalDriver/__tests__/pricing.test.ts and npm --prefix functions run build. Expected: PASS. Commit the four Task 2 files with message feat: load personal driver plans in backend pricing.

## Task 3: Secure admin plan updates

**Files:**
- Modify: functions/src/personalDriver/adminManagePersonalDriver.ts
- Modify: functions/src/personalDriver/__tests__/adminManagePersonalDriver.test.ts
- Modify: firestore.rules
- Modify: tests/firestore/personal-driver.rules.test.ts

**Interfaces:**
- Callable payload: { action: 'updatePlan'; plan: PersonalDriverPlan }
- Callable result: { success: true; planId: PersonalDriverPlanId }
- Public reads are allowed only for the three fixed plan IDs; all client writes are denied.

- [ ] **Step 1: Write failing tests.**

Add callable tests for unauthenticated rejection, non-admin rejection, successful audited save, unknown ID rejection, negative number rejection, duplicate weekday rejection, and empty benefit rejection. The successful save must assert updatedBy equals the caller and updatedAt is a server timestamp. Add emulator tests for public unauthenticated reads and failed client create, update, and delete.

- [ ] **Step 2: Run and observe expected failures.**

Run npm --prefix functions test -- --runInBand src/personalDriver/__tests__/adminManagePersonalDriver.test.ts and firebase emulators:exec --project medjira-taxi-test --only firestore "npx jest --config jest.firestore.config.js tests/firestore/personal-driver.rules.test.ts --runInBand". Expected: FAIL because updatePlan and its rules match are absent.

- [ ] **Step 3: Implement validation and save.**

Add the updatePlan member to the discriminated union. Validate name 1–80 chars, badge 0–80, promise 1–200, price 0–1000, minimum distance as a positive integer up to 100000, minimum amount 0–1000000, one to seven unique weekdays, waiting minutes 0–1440, special trips 0–100, and one to twelve benefits of 1–200 chars. After assertAdminUser, write personal_driver_plans/{plan.id} with validated fields, updatedAt serverTimestamp, and updatedBy adminUid using merge mode.

- [ ] **Step 4: Add rules, rerun tests, and commit.**

Add this match inside the Firestore documents match:

~~~text
match /personal_driver_plans/{planId} {
  allow read: if planId == 'basic' || planId == 'classic' || planId == 'premium';
  allow write: if false;
}
~~~

Rerun the commands from Step 2. Expected: PASS. Commit with message feat: secure personal driver plan updates.

## Task 4: Apply live plans to new quotes and preserve old entitlements

**Files:**
- Modify: functions/src/personalDriver/createSubscriptionPayment.ts
- Modify: functions/src/personalDriver/renewSubscriptionPayment.ts
- Modify: functions/src/personalDriver/clientManagePersonalDriver.ts
- Modify: functions/src/personalDriver/__tests__/createSubscriptionPayment.test.ts
- Modify: functions/src/personalDriver/__tests__/renewSubscriptionPayment.test.ts
- Modify: functions/src/personalDriver/__tests__/clientManagePersonalDriver.test.ts

- [ ] **Step 1: Write failing behavior tests.**

Configure Premium with minimum 800 and assert new creation and renewal persist the modified selectedPlanPrice, totalAmount, and includedSpecialTrips. Add an existing subscription with includedSpecialTrips 4, set the current Premium configuration to one, and assert the old operation still reports four remaining entitlements.

~~~ts
expect(createdSubscription.selectedPlanPrice.minimumAmount).toBe(800);
expect(createdSubscription.includedSpecialTrips).toBe(4);
expect(existingSubscriptionResult.specialTripsRemaining).toBe(4);
~~~

- [ ] **Step 2: Run and observe failure.**

Run npm --prefix functions test -- --runInBand src/personalDriver/__tests__/createSubscriptionPayment.test.ts src/personalDriver/__tests__/renewSubscriptionPayment.test.ts src/personalDriver/__tests__/clientManagePersonalDriver.test.ts. Expected: FAIL because handlers still use hardcoded plans or limits.

- [ ] **Step 3: Update new quote flows.**

Load getConfiguredPersonalDriverPlans(db) once per handler, pass the map to calculatePersonalDriverPrices, use the selected plan’s configured weekday list for eligibility, and persist the resulting quote, selectedPlanPrice, and includedSpecialTrips as the new snapshot.

- [ ] **Step 4: Preserve existing snapshots.**

In clientManagePersonalDriver.ts, remove current-plan equality checks for stored entitlements. Validate stored includedSpecialTrips and use it for remaining-trip calculations. Never recalculate a paid subscription from the current catalogue.

- [ ] **Step 5: Run regression and commit.**

Run npm --prefix functions test -- --runInBand src/personalDriver/__tests__ and npm --prefix functions run build. Expected: PASS. Commit with message feat: apply editable plans to new personal driver quotes.

## Task 5: Render live plans in the client

**Files:**
- Create: src/hooks/usePersonalDriverPlans.ts
- Create: src/app/personal-driver/PersonalDriverPlansProvider.tsx
- Create: src/app/personal-driver/layout.tsx
- Modify: src/app/personal-driver/page.tsx
- Modify: src/app/personal-driver/components/PersonalDriverPlanCard.tsx
- Modify: src/app/personal-driver/configurer/page.tsx
- Modify: src/app/personal-driver/components/PersonalDriverEstimate.tsx
- Modify: src/app/personal-driver/components/PersonalDriverConfirmation.tsx
- Modify: src/app/personal-driver/components/PersonalDriverClientDashboard.tsx
- Modify: src/app/personal-driver/components/PersonalDriverPlanCard.test.tsx
- Modify: src/app/personal-driver/components/PersonalDriverEstimate.test.tsx
- Modify: src/app/personal-driver/components/PersonalDriverConfigurator.test.tsx
- Modify: src/app/personal-driver/components/PersonalDriverConfirmation.test.tsx
- Modify: src/app/personal-driver/components/PersonalDriverClientDashboard.test.tsx

**Interface:** usePersonalDriverPlans() returns plans, isLoading, error, and reload.

- [ ] **Step 1: Write failing provider and consumer tests.**

Mock the loader to return Premium name Premium Plus and minimumAmount 800. Assert the provider, card, comparison table, configurator, and estimate render those values. Mock a rejected load and assert static defaults remain visible with a non-blocking error.

- [ ] **Step 2: Run and observe failure.**

Run npx jest src/app/personal-driver src/services/personal-driver --runInBand. Expected: FAIL because the provider and dynamic consumers are absent.

- [ ] **Step 3: Implement provider and hook.**

Create context that loads once on mount, starts with PERSONAL_DRIVER_PLANS, keeps defaults on error, exposes the error and retry method, and wraps the route tree from layout.tsx.

- [ ] **Step 4: Replace hardcoded presentation.**

Generate comparison rows from the plan map for amounts, price/km, allowed weekdays, special trips, and free waiting time. Use plan.badge, name, promise, minimumAmount, pricePerKm, and benefits in cards and detail views. Keep visual colors based on fixed IDs. Pass the live map to the pure estimate calculator. Continue displaying persisted subscription totals in history and confirmation.

- [ ] **Step 5: Run and commit.**

Run npx jest src/app/personal-driver src/services/personal-driver --runInBand, npm run lint:personal-driver, and npm run typecheck. Expected: PASS. Commit with message feat: render personal driver plans from Firestore config.

## Task 6: Build and mount the admin editor

**Files:**
- Create: src/app/admin/personal-driver/PersonalDriverPlansEditor.tsx
- Create: src/app/admin/personal-driver/PersonalDriverPlansEditor.test.tsx
- Modify: src/app/admin/personal-driver/PersonalDriverAdminPageClient.tsx
- Modify: src/app/admin/personal-driver/PersonalDriverAdminPageClient.test.tsx

- [ ] **Step 1: Write failing component tests.**

Mock the catalogue loader and callable. Assert all three plan cards render every editable field, changing Premium minimum to 800 sends action updatePlan with plan id premium and minimumAmount 800, and a rejected callable leaves the form visible with a French alert. Also cover weekday checkboxes, benefit add/remove, disabled save, reset without save, and audit metadata.

~~~ts
await user.clear(screen.getByLabelText('Montant minimum Premium'));
await user.type(screen.getByLabelText('Montant minimum Premium'), '800');
await user.click(screen.getByRole('button', { name: 'Enregistrer Premium' }));
expect(mockCallable).toHaveBeenCalledWith(expect.objectContaining({
  action: 'updatePlan',
  plan: expect.objectContaining({ id: 'premium', minimumAmount: 800 }),
}));
~~~

- [ ] **Step 2: Run and observe failure.**

Run npx jest src/app/admin/personal-driver/PersonalDriverPlansEditor.test.tsx src/app/admin/personal-driver/PersonalDriverAdminPageClient.test.tsx --runInBand. Expected: FAIL because the editor is absent.

- [ ] **Step 3: Implement and mount the editor.**

Keep draft state as Record<PersonalDriverPlanId, PersonalDriverPlan>. Render text inputs for name, badge, and promise; number inputs for all numeric fields; seven weekday checkboxes; benefit inputs with add/remove controls; reset buttons; and one save button per plan. Validate before calling the callable, show field-level role alert messages, preserve drafts after errors, display updatedAt and updatedBy, and mount the editor below the admin heading without changing operational actions.

- [ ] **Step 4: Run and commit.**

Run npx jest src/app/admin/personal-driver --runInBand, npm run lint:personal-driver, and npm run typecheck. Expected: PASS. Commit with message feat: add personal driver plan editor.

## Task 7: Final verification

- [ ] **Step 1: Read installed Next.js guidance.**

Run:

~~~text
Get-Content -Raw node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md
Get-Content -Raw node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md
Get-Content -Raw node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md
~~~

Confirm provider/layout boundaries and client callable usage comply with Next.js 16.

- [ ] **Step 2: Run the complete focused gate.**

Run npm run lint:personal-driver, npm run typecheck, npm run test:personal-driver, npm --prefix functions run test:personal-driver, npm run test:personal-driver:firestore, npm run build, and npm --prefix functions run build. Expected: every command exits 0.

- [ ] **Step 3: Manually verify the browser.**

As an admin, open /admin/personal-driver, change Premium from 650 to 800 and one benefit, save, refresh, and confirm audit metadata. Open /personal-driver and confirm the card and comparison table show the new values. Create a new Premium estimate and confirm it uses the new parameters. Confirm an existing subscription retains its stored amount and special-trip entitlement. Attempt a direct client write to personal_driver_plans/premium and confirm Firestore denies it.

- [ ] **Step 4: Inspect and review.**

Run git diff --check, git status --short, and git diff HEAD~6..HEAD --stat. Confirm no unrelated files changed. Then use superpowers:requesting-code-review before integration.
