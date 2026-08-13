# Restaurant Settings Hours Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a mobile-friendly restaurant « Paramètres » page where owners can edit weekly opening hours and see the real current-day schedule on the dashboard.

**Architecture:** Keep the existing static-export-compatible restaurant portal routes and bottom navigation. Add a pure schedule utility for defaults, legacy-data normalization, validation, and current-day lookup; add a narrowly scoped Firestore service method for owner schedule updates; add a dedicated settings client that reuses the portal header, cards, toast, and navigation styles.

**Tech Stack:** Next.js App Router, React 19, TypeScript strict mode, Firebase Firestore, Tailwind CSS v4, Jest, React Testing Library.

## Global Constraints

- Code and comments remain in English; restaurant-facing UI text remains in French.
- Keep the existing `restaurantId` query-parameter route shape for static export compatibility.
- Do not modify unrelated Stripe, Android, Firebase config, or existing user changes in the working tree.
- Preserve the separate manual `isOpen` state from the weekly `openingHours` schedule.
- Production code must be preceded by a failing test and verified with the targeted test command.

---

### Task 1: Add normalized opening-hours utilities

**Files:**
- Create: `src/utils/restaurant-hours.ts`
- Create: `src/utils/__tests__/restaurant-hours.test.ts`
- Modify: `src/types/food-delivery.ts:45-50`

**Interfaces:**
- `RestaurantOpeningHour = { open: string; close: string; closed: boolean }`
- `RestaurantOpeningHours = Record<RestaurantDayKey, RestaurantOpeningHour>`
- `normalizeOpeningHours(value?: Record<string, { open: string; close: string; closed?: boolean } | null>): RestaurantOpeningHours`
- `validateOpeningHours(hours: RestaurantOpeningHours): string | null`
- `getOpeningHoursForDate(hours: RestaurantOpeningHours, date: Date): RestaurantOpeningHour & { key: RestaurantDayKey; label: string }`

- [ ] **Step 1: Write the failing utility tests**

```ts
import {
  getOpeningHoursForDate,
  normalizeOpeningHours,
  validateOpeningHours,
} from '@/utils/restaurant-hours';

describe('restaurant hours', () => {
  it('uses the default schedule when the restaurant has no hours', () => {
    const hours = normalizeOpeningHours();

    expect(hours.monday).toEqual({ open: '09:00', close: '22:00', closed: false });
    expect(hours.sunday).toEqual({ open: '09:00', close: '22:00', closed: true });
  });

  it('normalizes null and legacy closed values', () => {
    const hours = normalizeOpeningHours({
      monday: { open: '08:00', close: '18:00' },
      tuesday: null,
    });

    expect(hours.monday).toEqual({ open: '08:00', close: '18:00', closed: false });
    expect(hours.tuesday.closed).toBe(true);
  });

  it('rejects a schedule with no open day', () => {
    const hours = normalizeOpeningHours();
    Object.values(hours).forEach((day) => { day.closed = true; });

    expect(validateOpeningHours(hours)).toBe('Au moins un jour doit être ouvert.');
  });

  it('rejects incomplete and inverted times', () => {
    const hours = normalizeOpeningHours();
    hours.monday.open = '18:00';
    hours.monday.close = '08:00';

    expect(validateOpeningHours(hours)).toBe('L’heure de fermeture doit être après l’heure d’ouverture pour lundi.');
  });

  it('returns the schedule entry for the requested date', () => {
    const hours = normalizeOpeningHours();
    const result = getOpeningHoursForDate(hours, new Date('2026-08-10T12:00:00'));

    expect(result.key).toBe('monday');
    expect(result.label).toBe('Lundi');
  });
});
```

- [ ] **Step 2: Run the utility test to verify it fails**

Run: `npx jest src/utils/__tests__/restaurant-hours.test.ts --runInBand`

Expected: FAIL because `@/utils/restaurant-hours` does not exist.

- [ ] **Step 3: Implement the smallest utility API**

Use `RESTAURANT_DAYS` as the single day-key and label source. Normalize `null` and `{ closed: true }` as closed, fill missing days from the default schedule, validate `HH:mm` values using a strict regular expression, compare minutes for open days, and map `Date.getDay()` from Sunday `0` to the shared day keys.

- [ ] **Step 4: Widen the stored Restaurant type for both historical formats**

Change `Restaurant.openingHours` to accept `{ open: string; close: string; closed?: boolean } | null`, without changing any unrelated restaurant fields.

- [ ] **Step 5: Run the utility tests to verify they pass**

Run: `npx jest src/utils/__tests__/restaurant-hours.test.ts --runInBand`

Expected: PASS with all schedule utility tests passing.

- [ ] **Step 6: Commit the utility boundary**

```bash
git add src/utils/restaurant-hours.ts src/utils/__tests__/restaurant-hours.test.ts src/types/food-delivery.ts
git commit -m "feat: normalize restaurant opening hours"
```

### Task 2: Add the owner update service and Paramètres navigation

**Files:**
- Modify: `src/services/food-delivery.service.ts:819-865`
- Create: `src/services/__tests__/restaurant-opening-hours.service.test.ts`
- Modify: `src/app/food/portal/restaurant-portal-paths.ts:1-10`
- Modify: `src/components/ui/BottomNav.tsx:25-31`
- Modify: `src/app/food/portal/restaurant-portal-paths.test.ts`

**Interfaces:**
- `updateRestaurantOpeningHours(restaurantId: string, openingHours: RestaurantOpeningHours): Promise<void>` writes only `openingHours` and `updatedAt`.
- `getRestaurantPortalPath(restaurantId, 'settings')` returns `/food/portal/settings?restaurantId=...`.
- `portalNavItems(restaurantId)` includes a fourth item labeled `Paramètres` with the `settings` icon.

- [ ] **Step 1: Write the failing service and navigation tests**

The service test should mock `firebase/firestore` and assert that `updateDoc` receives the restaurant document reference plus exactly `{ openingHours, updatedAt: expect.anything() }`. The path test should assert the settings URL and the navigation test should assert that the last portal item has label `Paramètres` and uses the settings URL.

```ts
it('builds the settings portal URL', () => {
  expect(getRestaurantPortalPath('rest/123', 'settings')).toBe(
    '/food/portal/settings?restaurantId=rest%2F123',
  );
});

it('adds Paramètres to the restaurant portal navigation', () => {
  const items = portalNavItems('restaurant-1');

  expect(items.at(-1)).toEqual({
    href: '/food/portal/settings?restaurantId=restaurant-1',
    icon: 'settings',
    label: 'Paramètres',
  });
});
```

- [ ] **Step 2: Run the targeted tests to verify they fail**

Run: `npx jest src/app/food/portal/restaurant-portal-paths.test.ts src/services/__tests__/restaurant-opening-hours.service.test.ts --runInBand`

Expected: FAIL because the `settings` section and service method do not exist.

- [ ] **Step 3: Add the service method**

Import `RestaurantOpeningHours`, add the method near the existing restaurant update methods, call `updateDoc(doc(db, FIRESTORE_COLLECTIONS.RESTAURANTS, restaurantId), { openingHours, updatedAt: serverTimestamp() })`, and expose it through `FoodDeliveryService`.

- [ ] **Step 4: Add the settings route and nav item contract**

Extend `RestaurantPortalSection` with `'settings'`, then add the settings item after Menu in `portalNavItems`. Do not change the existing Dashboard, Commandes, or Menu URLs.

- [ ] **Step 5: Run the targeted tests to verify they pass**

Run: `npx jest src/app/food/portal/restaurant-portal-paths.test.ts src/services/__tests__/restaurant-opening-hours.service.test.ts --runInBand`

Expected: PASS with the new service and navigation behavior covered.

- [ ] **Step 6: Commit the data and navigation boundary**

```bash
git add src/services/food-delivery.service.ts src/services/__tests__/restaurant-opening-hours.service.test.ts src/app/food/portal/restaurant-portal-paths.ts src/app/food/portal/restaurant-portal-paths.test.ts src/components/ui/BottomNav.tsx
git commit -m "feat: add restaurant settings navigation"
```

### Task 3: Build the Paramètres page and form

**Files:**
- Create: `src/app/food/portal/settings/page.tsx`
- Create: `src/app/food/portal/[id]/settings/RestaurantSettingsClient.tsx`
- Create: `src/app/food/portal/[id]/settings/__tests__/RestaurantSettingsClient.test.tsx`

**Interfaces:**
- `RestaurantSettingsClient` reads `restaurantId` from `useSearchParams`, loads the owner restaurant, and renders the settings form.
- The form state is `RestaurantOpeningHours` from `normalizeOpeningHours`.
- Save calls `FoodDeliveryService.updateRestaurantOpeningHours(id, hours)` only after `validateOpeningHours` returns `null`.

- [ ] **Step 1: Write failing component tests**

Cover these user-visible behaviors:

```tsx
it('renders Paramètres with existing hours and hides controls for a closed day', async () => {
  mockGetRestaurantById.mockResolvedValue(makeRestaurant({
    openingHours: {
      monday: { open: '10:00', close: '20:00', closed: false },
      tuesday: null,
    },
  }));

  render(<RestaurantSettingsClient />);

  expect(await screen.findByRole('heading', { name: 'Paramètres' })).toBeInTheDocument();
  expect(screen.getByLabelText('Lundi ouverture')).toHaveValue('10:00');
  expect(screen.queryByLabelText('Mardi ouverture')).not.toBeInTheDocument();
});

it('prevents saving when every day is closed', async () => {
  render(<RestaurantSettingsClient />);

  const toggles = await screen.findAllByRole('checkbox');
  toggles.forEach((toggle) => {
    if (!(toggle as HTMLInputElement).checked) fireEvent.click(toggle);
  });
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les horaires' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('Au moins un jour doit être ouvert.');
  expect(mockUpdateRestaurantOpeningHours).not.toHaveBeenCalled();
});

it('saves valid changes and confirms success', async () => {
  render(<RestaurantSettingsClient />);
  fireEvent.change(await screen.findByLabelText('Lundi ouverture'), { target: { value: '08:00' } });
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les horaires' }));

  await waitFor(() => expect(mockUpdateRestaurantOpeningHours).toHaveBeenCalled());
  expect(await screen.findByText('Horaires enregistrés.')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the component test to verify it fails**

Run: `npx jest "src/app/food/portal/[id]/settings/__tests__/RestaurantSettingsClient.test.tsx" --runInBand`

Expected: FAIL because the settings client does not exist.

- [ ] **Step 3: Implement the route wrapper**

Render the client inside `Suspense` with the same full-screen `LoadingSpinner` fallback used by the Menu and Commandes route wrappers.

- [ ] **Step 4: Implement loading and owner access checks**

Use the existing `onAuthStateChanged(auth, ...)` pattern from `PortalClient`: redirect unauthenticated users to `/login`, load the restaurant by query ID, show `Restaurant introuvable` for a missing record, show `Accès non autorisé` and redirect to `/dashboard` for a different owner, and keep the page loading until the first successful read.

- [ ] **Step 5: Implement the form and save state**

Render `RestaurantPortalHeader`, a page heading, a back link, the seven day rows, a styled checkbox for each `closed` value, time inputs only for open days, and a bottom navigation using `portalNavItems(id)`. Track the last saved normalized value to disable the save button when clean. On save, validate, call the service, update the saved snapshot, and show `Horaires enregistrés.` through the existing toast hook. Keep entered values on errors and show an alert.

- [ ] **Step 6: Run the component tests to verify they pass**

Run: `npx jest "src/app/food/portal/[id]/settings/__tests__/RestaurantSettingsClient.test.tsx" --runInBand`

Expected: PASS with load, normalization, validation, save, and confirmation behaviors covered.

- [ ] **Step 7: Commit the settings screen**

```bash
git add src/app/food/portal/settings/page.tsx src/app/food/portal/[id]/settings/RestaurantSettingsClient.tsx src/app/food/portal/[id]/settings/__tests__/RestaurantSettingsClient.test.tsx
git commit -m "feat: add restaurant opening hours settings"
```

### Task 4: Use real hours on the dashboard and verify the feature

**Files:**
- Modify: `src/app/food/portal/[id]/PortalClient.tsx:1-305`
- Create: `src/app/food/portal/[id]/__tests__/PortalClient.test.tsx`

**Interfaces:**
- Dashboard consumes `normalizeOpeningHours` and `getOpeningHoursForDate` without duplicating day-key logic.
- Dashboard links to `getRestaurantPortalPath(id, 'settings')` with the label `Modifier les horaires`.

- [ ] **Step 1: Write the failing dashboard regression test**

Mock the restaurant with Monday hours `10:00–20:00`, freeze the test date to Monday, render the portal, and assert that `10:00 – 20:00` and `Modifier les horaires` appear. Assert that `08:00 - 22:00` does not appear.

- [ ] **Step 2: Run the regression test to verify it fails**

Run: `npx jest "src/app/food/portal/[id]/__tests__/PortalClient.test.tsx" --runInBand`

Expected: FAIL because the dashboard currently renders the fixed `08:00 - 22:00` text.

- [ ] **Step 3: Replace the hard-coded schedule**

Import the shared schedule helpers, derive the current day entry from `restaurant.openingHours`, render `Fermé aujourd’hui` for a closed day, otherwise render the real range, and add a link to the settings route. Keep the existing `isOpen` toggle behavior unchanged.

- [ ] **Step 4: Run the feature test set**

Run: `npx jest src/utils/__tests__/restaurant-hours.test.ts src/app/food/portal/restaurant-portal-paths.test.ts src/services/__tests__/restaurant-opening-hours.service.test.ts "src/app/food/portal/[id]/settings/__tests__/RestaurantSettingsClient.test.tsx" "src/app/food/portal/[id]/__tests__/PortalClient.test.tsx" --runInBand`

Expected: PASS with zero failed tests.

- [ ] **Step 5: Run repository verification**

Run: `npm run lint`

Expected: exit code 0 with no lint errors.

Run: `npm run typecheck`

Expected: exit code 0 with no TypeScript errors.

Run: `npm run build`

Expected: exit code 0 and a successful Next.js production build.

- [ ] **Step 6: Review the diff and commit dashboard integration**

```bash
git diff --check
git status --short
git add src/app/food/portal/[id]/PortalClient.tsx src/app/food/portal/[id]/__tests__/PortalClient.test.tsx
git commit -m "fix: show restaurant opening hours on dashboard"
```

The final status must show only the pre-existing user changes plus the feature commits; do not stage or alter unrelated files.
