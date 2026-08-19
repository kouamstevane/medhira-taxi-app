# Customer Restaurant Menu V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add customer menu item details, modifier groups, supplements, allergens, nutrition, and checkout validation as a separate follow-up to the scalable restaurant menu work.

**Architecture:** Keep V2 isolated from the V1 discovery flow. Introduce a dedicated customer menu item detail schema and service surface for item configuration, then thread that data through the customer UI, cart validation, and checkout rules without reworking the paginated catalog plumbing. Treat data migration and rollout as first-class work so existing menu items remain readable while new item metadata is introduced incrementally.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Firebase Firestore, Firebase Cloud Functions, Tailwind CSS v4, Jest, React Testing Library, Playwright.

## Global Constraints

- V2 is separate from menu discovery and must not reintroduce full-menu fetching on the customer page.
- Customer-facing copy remains in French; code, tests, and schema names remain in English.
- Existing V1 catalog behavior stays intact until V2 item details are fully migrated and verified.
- New menu item metadata must be backwards compatible with legacy items that have no modifiers, supplements, allergens, or nutrition data.
- Checkout must reject invalid selections before order creation, not after payment or fulfillment.
- Data migration must be staged and reversible where practical.
- Do not modify unrelated working-tree changes.

---

### Task 1: Define the V2 customer menu item data model and service contracts

**Files:**
- Modify: `src/types/food-delivery.ts`
- Modify: `src/services/food-delivery.service.ts`
- Create: `src/services/__tests__/customer-menu-item-details.service.test.ts`
- Modify: `firestore.indexes.json` only if the verified customer item detail queries require a composite index

**Interfaces:**
- Consumes: `MenuItem`, restaurant menu document data, Firestore query primitives, and the existing customer menu service surface from V1.
- Produces: typed customer item detail payloads for modifier groups, supplements, allergens, nutrition, and validation metadata.

Use these exact types as the contract boundary:

```ts
export interface CustomerMenuModifierOption {
  id: string;
  label: string;
  priceDelta: number;
  isDefault?: boolean;
  isAvailable: boolean;
}

export interface CustomerMenuModifierGroup {
  id: string;
  label: string;
  selectionType: 'single' | 'multiple';
  required: boolean;
  minSelections: number;
  maxSelections: number;
  options: CustomerMenuModifierOption[];
}

export interface CustomerMenuSupplement {
  id: string;
  label: string;
  price: number;
  isAvailable: boolean;
}

export interface CustomerMenuAllergen {
  code: string;
  label: string;
}

export interface CustomerMenuNutrition {
  calories?: number;
  proteinGrams?: number;
  carbsGrams?: number;
  fatGrams?: number;
  saltGrams?: number;
}

export interface CustomerMenuItemDetails {
  itemId: string;
  description?: string;
  imageUrl?: string;
  modifierGroups: CustomerMenuModifierGroup[];
  supplements: CustomerMenuSupplement[];
  allergens: CustomerMenuAllergen[];
  nutrition?: CustomerMenuNutrition;
  checkoutRules: {
    allowZeroQuantity?: boolean;
    maxQuantity?: number;
  };
}
```

- [ ] **Step 1: Write the failing service and type tests**

Test that legacy menu items deserialize cleanly with empty modifier groups, supplements, allergens, and nutrition. Test that a customer item detail query returns only available modifier options and supplements, preserves default options, and maps nutrition values without inventing missing fields. Test that checkout rule metadata is present and can be read independently of the catalog page query.

- [ ] **Step 2: Run the tests to verify red**

```bash
npx jest src/services/__tests__/customer-menu-item-details.service.test.ts --runInBand
```

Expected: FAIL because the customer item detail contracts and service functions do not exist yet.

- [ ] **Step 3: Implement the new contracts and service helpers**

Add the new item detail types to the centralized food-delivery type surface and expose a dedicated customer item detail read path from `FoodDeliveryService`. Keep the customer detail query separate from the paginated catalog query so item details can be loaded on demand when a user opens a dish. Preserve backwards compatibility by returning empty arrays and undefined nutrition for legacy documents that do not define the V2 fields.

- [ ] **Step 4: Run the tests to verify green**

```bash
npx jest src/services/__tests__/customer-menu-item-details.service.test.ts --runInBand
```

Expected: all service tests pass.

- [ ] **Step 5: Commit**

```bash
git add -- src/types/food-delivery.ts src/services/food-delivery.service.ts src/services/__tests__/customer-menu-item-details.service.test.ts
git commit -m "feat: add customer menu item detail contracts"
```

---

### Task 2: Build the customer item details and customization UI

**Files:**
- Create: `src/components/food/CustomerMenuItemDetails.tsx`
- Create: `src/components/food/CustomerMenuItemCustomization.tsx`
- Create: `src/components/food/__tests__/CustomerMenuItemDetails.test.tsx`
- Create: `src/components/food/__tests__/CustomerMenuItemCustomization.test.tsx`

**Interfaces:**
- Consumes: Task 1 item detail contracts and the existing customer menu item card or selection entry point.
- Produces: item detail presentation, modifier-group controls, supplement selectors, allergen badges, nutrition display, and a validated add-to-cart payload.

- [ ] **Step 1: Write the failing component tests**

Cover rendering of description, image, allergens, nutrition, and grouped modifiers. Assert that single-select groups behave like radios, multi-select groups behave like checkboxes, required groups cannot be skipped, and supplements can be added independently. Assert that the UI shows clear validation copy when a customer exceeds a group maximum or leaves a required group incomplete.

- [ ] **Step 2: Run the tests to verify red**

```bash
npx jest src/components/food/__tests__/CustomerMenuItemDetails.test.tsx src/components/food/__tests__/CustomerMenuItemCustomization.test.tsx --runInBand
```

Expected: FAIL because the detail and customization components do not exist yet.

- [ ] **Step 3: Implement the UI components**

Render a focused item details surface that can open from the customer menu flow without requiring a full page reload. Keep modifier groups visually separated from supplements, show allergens in a compact but readable format, and present nutrition as optional reference data rather than a blocking form element. Build the customization controls so they emit a normalized selection object that downstream cart and checkout code can validate.

- [ ] **Step 4: Run the tests to verify green**

```bash
npx jest src/components/food/__tests__/CustomerMenuItemDetails.test.tsx src/components/food/__tests__/CustomerMenuItemCustomization.test.tsx --runInBand
```

Expected: all component tests pass.

- [ ] **Step 5: Commit**

```bash
git add -- src/components/food/CustomerMenuItemDetails.tsx src/components/food/CustomerMenuItemCustomization.tsx src/components/food/__tests__/CustomerMenuItemDetails.test.tsx src/components/food/__tests__/CustomerMenuItemCustomization.test.tsx
git commit -m "feat: add customer menu item customization UI"
```

---

### Task 3: Add checkout validation for modifiers, supplements, and item limits

**Files:**
- Modify: `src/store/cartStore.ts`
- Modify: `src/services/checkout.service.ts`
- Modify: `functions/src/validators/` customer order schemas only if checkout payload validation is enforced server-side there
- Create: `src/services/__tests__/checkout-validation.test.ts`

**Interfaces:**
- Consumes: Task 1 customer item detail contracts and the normalized selection object from Task 2.
- Produces: validated cart entries, checkout-safe line items, and rejection reasons for invalid customization states.

- [ ] **Step 1: Write the failing validation tests**

Test that a required modifier group blocks checkout when it is unanswered, a single-select group rejects multiple selections, a multi-select group rejects selections beyond its max, and unavailable supplements cannot be submitted. Add a cart-level test that ensures merged line items preserve the selected modifiers and supplements in their identity key so different customizations do not collapse into one item.

- [ ] **Step 2: Run the tests to verify red**

```bash
npx jest src/services/__tests__/checkout-validation.test.ts --runInBand
```

Expected: FAIL because the checkout validation path does not yet understand customer menu customization.

- [ ] **Step 3: Implement validation and cart normalization**

Extend the cart and checkout service layers to validate a selected item against the item detail contract before submission. Keep the validation outcome explicit so the UI can explain what must be fixed, and ensure customizations remain part of the cart item identity, quantity updates, and order payload.

- [ ] **Step 4: Run the tests to verify green**

```bash
npx jest src/services/__tests__/checkout-validation.test.ts --runInBand
```

Expected: all validation tests pass.

- [ ] **Step 5: Commit**

```bash
git add -- src/store/cartStore.ts src/services/checkout.service.ts src/services/__tests__/checkout-validation.test.ts functions/src/validators/
git commit -m "feat: validate customer menu checkout options"
```

---

### Task 4: Migrate existing menu data to the V2 schema safely

**Files:**
- Modify: Firestore seed or fixture data files used for food menus
- Modify: any existing menu import or admin menu write path that persists menu item metadata
- Create: `scripts/backfill-customer-menu-v2.ts`
- Create: `docs/superpowers/plans/2026-08-19-customer-restaurant-menu-v2-migration-notes.md`

**Interfaces:**
- Consumes: the legacy menu item schema and the new Task 1 customer detail contracts.
- Produces: a staged migration that backfills detail metadata without breaking the live customer menu.

- [ ] **Step 1: Write the migration coverage checks**

Define tests or scripted assertions that prove legacy items can be backfilled into the new schema without losing name, price, availability, or category data. Include at least one item with no customization data and one item with full modifier, supplement, allergen, and nutrition data. Verify that the migration is idempotent so a second run does not duplicate nested entries.

- [ ] **Step 2: Run the migration checks in a non-production context**

```bash
npx tsx scripts/backfill-customer-menu-v2.ts --dry-run
```

Expected: the migration can be applied to the local or emulator dataset without corrupting existing menu reads.

- [ ] **Step 3: Implement the backfill and write path compatibility**

Backfill the new customer detail fields from the most reliable existing source available, then update the write path so new or edited menu items can persist V2 metadata directly. Keep legacy reads working during the transition and avoid destructive schema changes until the new data is verified in place.

- [ ] **Step 4: Verify the migrated records**

Check a representative sample of items in the emulator or seeded dataset and confirm that customer reads return the expected modifiers, supplements, allergens, and nutrition values.

- [ ] **Step 5: Commit**

```bash
git add -- scripts/backfill-customer-menu-v2.ts docs/superpowers/plans/2026-08-19-customer-restaurant-menu-v2-migration-notes.md
git commit -m "chore: migrate customer menu data to v2 schema"
```

---

### Task 5: Finish rollout boundaries, API/UI integration, and regression coverage

**Files:**
- Modify: `src/app/food/restaurant/[id]/RestaurantClient.tsx`
- Modify: `src/services/food-delivery.service.ts`
- Modify: `src/services/checkout.service.ts`
- Create: `e2e/customer-menu-customization.spec.ts`
- Create: `src/components/food/__tests__/CustomerMenuIntegration.test.tsx`

**Interfaces:**
- Consumes: Task 1 service contracts, Task 2 UI, Task 3 validation, and Task 4 migrated data.
- Produces: a customer-facing flow where item details can be inspected, customized, validated, and purchased safely.

- [ ] **Step 1: Write the integrated regression tests**

Cover the full customer path: open a menu item, inspect details, select modifier groups, add supplements, observe allergens and nutrition, and attempt checkout with both valid and invalid selections. Include a mobile-sized Playwright scenario so the details panel or sheet remains usable on small screens and validation messages stay visible.

- [ ] **Step 2: Run the integrated tests to verify red**

```bash
npx playwright test e2e/customer-menu-customization.spec.ts --project=chromium
npx jest src/components/food/__tests__/CustomerMenuIntegration.test.tsx --runInBand
```

Expected: the integrated flow fails until the new UI and validation are connected to the live customer entry point.

- [ ] **Step 3: Wire the final UI and API boundaries**

Expose the customer item detail surface from the existing menu page in a way that does not disturb V1 pagination. Keep the API layer narrow: one read path for item details and one validation path for checkout safety. Do not widen the catalog query or move customization concerns into the discovery list itself.

- [ ] **Step 4: Run the full focused regression suite**

```bash
npx jest src/services/__tests__/customer-menu-item-details.service.test.ts src/components/food/__tests__/CustomerMenuItemDetails.test.tsx src/components/food/__tests__/CustomerMenuItemCustomization.test.tsx src/services/__tests__/checkout-validation.test.ts --runInBand
npx playwright test e2e/customer-menu-customization.spec.ts --project=chromium
```

Expected: all focused tests pass and the new customer customization flow is stable on mobile and desktop viewports.

- [ ] **Step 5: Commit**

```bash
git add -- src/components/ src/services/ functions/src/validators/ e2e/
git commit -m "feat: ship customer menu v2 customization flow"
```

---

### Task 6: Release and rollback guardrails

**Files:**
- Review: all files changed by Tasks 1–5
- Modify: release notes, feature flags, or rollout config only if the repository already uses those mechanisms for food features

**Interfaces:**
- Consumes: the finished V2 feature surface and migration artifacts.
- Produces: a safe rollout checklist with a clear rollback path.

- [ ] **Step 1: Verify the final diff**

```bash
git diff --stat
git status --short
```

Expected: only V2-related files, tests, migration assets, and rollout metadata are present.

- [ ] **Step 2: Confirm rollout boundaries**

Ensure the customer-facing V2 path can be enabled without changing the V1 discovery query, and confirm the team has a rollback path that preserves legacy menu reads.

- [ ] **Step 3: Record residual risks**

Document any limitations that remain for older seeded items, missing nutrition data, or partial migration coverage so the rollout owner knows what to watch after deployment.

- [ ] **Step 4: Final commit or release handoff**

```bash
git commit -m "docs: finalize customer menu v2 rollout plan"
```

---

### Open Questions

- Which existing menu write path is the source of truth for backfilling modifier groups and supplements?
- Should nutrition values be required for newly created items, or only recommended during migration?
- Do checkout validation errors belong only in the customer UI, or should they also be enforced at the Cloud Functions boundary?
