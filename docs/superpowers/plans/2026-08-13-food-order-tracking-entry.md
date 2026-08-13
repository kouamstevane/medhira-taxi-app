# Food order tracking entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Food page’s top-right order action immediately recognizable as the meal-order tracking entry point on mobile.

**Architecture:** Keep the existing `/food/orders` route and `MaterialIcon` abstraction. Update only the Food page header action so it becomes a compact, responsive pill containing the existing delivery icon, a visible French label, and a navigation chevron. Add a focused React Testing Library test around the rendered link contract.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS v4, Jest, React Testing Library.

## Global Constraints

- Keep the existing Material Icons visual language and orange primary accent.
- The visible action label must be `Suivre ma commande`.
- The action must link to `/food/orders`.
- Keep the label visible and prevent wrapping inside the action on narrow mobile screens.
- Do not change order retrieval, status handling, or the tracking page.
- Code and comments remain in English; user-facing UI text remains in French.

---

### Task 1: Add a failing Food tracking-entry UI test

**Files:**
- Create: `src/app/food/__tests__/FoodHomePage.test.tsx`

**Interfaces:**
- Consumes: `FoodHomePage` from `@/app/food/page`.
- Produces: A regression test proving the header exposes a link named `Suivre ma commande`, targeting `/food/orders`, with the `delivery_dining` icon.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react';
import FoodHomePage from '@/app/food/page';

jest.mock('@/services/food-delivery.service', () => ({
  FoodDeliveryService: {
    getApprovedRestaurants: jest.fn().mockResolvedValue({ restaurants: [], lastDoc: null }),
  },
}));

jest.mock('@/components/food/RestaurantCard', () => ({
  RestaurantCard: () => null,
}));

jest.mock('@/components/ui/BottomNav', () => ({
  BottomNav: () => null,
}));

jest.mock('@/components/ui/MaterialIcon', () => ({
  MaterialIcon: ({ name }: { name: string }) => <span data-testid={`material-icon-${name}`} />,
}));

describe('FoodHomePage order tracking entry point', () => {
  it('shows a descriptive mobile-friendly link to meal order tracking', () => {
    render(<FoodHomePage />);

    const trackingLink = screen.getByRole('link', { name: 'Suivre ma commande' });

    expect(trackingLink).toHaveAttribute('href', '/food/orders');
    expect(screen.getByTestId('material-icon-delivery_dining')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
npx jest src/app/food/__tests__/FoodHomePage.test.tsx --runInBand
```

Expected: FAIL because the current header link has no accessible name `Suivre ma commande`.

### Task 2: Implement the descriptive responsive header action

**Files:**
- Modify: `src/app/food/page.tsx:109-117`

**Interfaces:**
- Consumes: The existing `Link`, `MaterialIcon`, and `/food/orders` route.
- Produces: A visible, responsive order-tracking link in the Food page header.

- [ ] **Step 1: Replace the icon-only header action with the labeled pill**

Use this header structure in `src/app/food/page.tsx`:

```tsx
<div className="relative flex flex-wrap items-start justify-between gap-3 mb-6 pt-4">
  <div className="min-w-0 flex-1">
    <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">Food Delivery</h1>
    <p className="text-slate-400 mt-1">Qu&apos;est-ce qui vous ferait plaisir ?</p>
  </div>
  <Link
    href="/food/orders"
    aria-label="Suivre ma commande"
    className="inline-flex max-w-full shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-bold text-primary shadow-[0_0_18px_rgba(242,146,0,0.12)] transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
  >
    <MaterialIcon name="delivery_dining" size="md" className="text-primary" />
    <span>Suivre ma commande</span>
    <MaterialIcon name="chevron_right" size="sm" className="text-primary/70" />
  </Link>
</div>
```

The wrapping parent lets the labeled action move below the title only when the viewport is too narrow; the action itself stays compact and the label never wraps.

- [ ] **Step 2: Run the focused test to verify it passes**

Run:

```powershell
npx jest src/app/food/__tests__/FoodHomePage.test.tsx --runInBand
```

Expected: PASS with one test and zero failures.

### Task 3: Verify the change and commit only scoped files

**Files:**
- Verify: `src/app/food/page.tsx`
- Verify: `src/app/food/__tests__/FoodHomePage.test.tsx`

- [ ] **Step 1: Run lint on the changed files**

Run:

```powershell
npx eslint src/app/food/page.tsx src/app/food/__tests__/FoodHomePage.test.tsx
```

Expected: exit code 0 with no lint errors.

- [ ] **Step 2: Run the focused Food tests**

Run:

```powershell
npx jest src/app/food --runInBand
```

Expected: all Food tests pass.

- [ ] **Step 3: Inspect the final diff**

Run:

```powershell
git diff --check -- src/app/food/page.tsx src/app/food/__tests__/FoodHomePage.test.tsx
git diff -- src/app/food/page.tsx src/app/food/__tests__/FoodHomePage.test.tsx
```

Expected: only the labeled responsive header action and its focused test are changed; no unrelated working-tree changes are staged.

- [ ] **Step 4: Commit the scoped implementation**

```powershell
git add -- src/app/food/page.tsx src/app/food/__tests__/FoodHomePage.test.tsx
git commit -m "fix: clarify food order tracking action"
```
