# Restaurant Visual Picker Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the restaurant registration visual section shorter and visually balanced on mobile.

**Architecture:** Keep file validation and upload behavior unchanged. Update the shared `RestaurantVisualPicker` presentation so both variants use a compact `aspect-video` frame, with variant-specific image fitting, while the registration section uses tighter spacing.

**Tech Stack:** Next.js 16, React, TypeScript, Tailwind CSS v4, Jest, React Testing Library.

## Global Constraints

- Keep French UI copy unchanged.
- Preserve the existing file input, validation, remove, replace, and accessibility behavior.
- Do not change Firebase Storage or registration payload handling.
- Keep the selectors stacked on narrow screens.

---

### Task 1: Add the failing layout regression test

**Files:**
- Modify: `src/components/food/__tests__/RestaurantVisualPicker.test.tsx`

**Interfaces:**
- Consumes: `RestaurantVisualPicker` with `kind="logo"` and `kind="cover"`.
- Produces: Regression coverage for the shared media frame and variant image fitting classes.

- [ ] **Step 1: Write the failing test**

Add a test that renders both variants with object URLs and asserts:

```tsx
expect(screen.getByLabelText('Choisir le logo')).toHaveClass('aspect-video');
expect(screen.getByLabelText('Choisir la photo de couverture')).toHaveClass('aspect-video');
expect(screen.getByAltText('Logo du restaurant')).toHaveClass('object-contain');
expect(screen.getByAltText('Photo de couverture')).toHaveClass('object-cover');
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --runInBand src/components/food/__tests__/RestaurantVisualPicker.test.tsx`

Expected: FAIL because the logo picker currently has `aspect-square max-w-[220px]` and the image does not expose variant-specific fitting classes.

### Task 2: Implement the compact balanced frames

**Files:**
- Modify: `src/components/food/RestaurantVisualPicker.tsx`
- Modify: `src/app/restaurant/register/components/Step3Restaurant.tsx`

**Interfaces:**
- Consumes: Existing `RestaurantVisualPicker` props and `kind` values.
- Produces: Both visual selectors rendered with the same compact frame dimensions.

- [ ] **Step 1: Update the media frame classes**

Replace the conditional frame sizing with a shared `aspect-video w-full` class and use `kind` only for the image fit:

```tsx
className={`relative flex aspect-video w-full cursor-pointer items-center justify-center overflow-hidden rounded-2xl border border-dashed border-white/20 bg-white/[0.04] transition hover:border-primary/70 ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
```

Apply `object-contain p-6` to the logo image and `object-cover` to the cover image.

- [ ] **Step 2: Tighten the registration section spacing**

Change the visual section wrapper in `Step3Restaurant` from `space-y-5` to `space-y-4`, leaving the two pickers stacked.

- [ ] **Step 3: Run the focused test**

Run: `npm test -- --runInBand src/components/food/__tests__/RestaurantVisualPicker.test.tsx`

Expected: PASS.

### Task 3: Verify the changed surface

**Files:**
- Verify: `src/components/food/RestaurantVisualPicker.tsx`
- Verify: `src/app/restaurant/register/components/Step3Restaurant.tsx`

- [ ] **Step 1: Run lint on changed files**

Run: `npx eslint src/components/food/RestaurantVisualPicker.tsx src/components/food/__tests__/RestaurantVisualPicker.test.tsx src/app/restaurant/register/components/Step3Restaurant.tsx`

Expected: exit code 0.

- [ ] **Step 2: Run the related registration tests**

Run: `npm test -- --runInBand src/app/restaurant/register/components/__tests__/Step3Restaurant.test.tsx src/components/food/__tests__/RestaurantVisualPicker.test.tsx`

Expected: all tests pass.

- [ ] **Step 3: Inspect the page in the in-app browser**

Open `/restaurant/register/`, scroll to `Identité visuelle`, and confirm the logo and cover empty states have equal width and height while the section occupies less vertical space.
