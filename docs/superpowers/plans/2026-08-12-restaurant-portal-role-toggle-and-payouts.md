# Restaurant Portal Role Toggle and Payouts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the restaurant portal use a compact icon-only role toggle, perform real logout, expose Stripe payout setup, and preserve secure menu-image handling.

**Architecture:** Extend the existing `RoleSwitcher` into one connected pill control with one icon segment per available role. The portal gets a focused header component that owns logout and embeds the toggle; role changes persist through the existing role service, reload the auth context, and then navigate. The existing Stripe Connect onboarding remains the single payout flow, while Storage rules remain owner-only.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Firebase Auth/Firestore/Storage, Firebase Functions, Tailwind CSS v4, Jest, React Testing Library.

## Global Constraints

- UI text stays in French; code and test names stay in English.
- The role control is one connected pill toggle, not a dropdown, and renders icons without long persistent labels.
- Only roles present on the account are rendered; a professional account may render Client as an activation segment when it has no client role yet.
- Role navigation uses `router.replace()` only after the Firestore write and `reloadUser()` complete.
- Restaurant Storage permissions remain restricted to the restaurant owner and WebP files up to 500 KiB.
- Preserve all unrelated working-tree changes.

---

### Task 1: Convert `RoleSwitcher` into the connected icon toggle

**Files:**
- Modify: `src/components/role/RoleSwitcher.tsx`
- Modify: `src/components/role/__tests__/RoleSwitcher.test.tsx`
- Modify: `src/context/AuthContext.tsx`

**Interfaces:**
- Consumes: `useAuth()`, `useEffectiveRoleStatus()`, `useActiveRideGuard()`, `setActiveRole()`, `getDashboardRouteFor()`.
- Produces: `RoleSwitcher({ allowClientActivation?: boolean })`, a single `role="group"` containing icon buttons with `aria-pressed`, `title`, and `data-testid="role-toggle-{role}"`.

- [ ] **Step 1: Write the failing tests for the connected toggle**

Update the auth mock to expose `reloadUser`, then replace dropdown expectations with these behaviors:

```tsx
it('renders one connected icon toggle for the available roles', () => {
  mockUserData = makeUserData({ driver: true, restaurant: true }, 'restaurant');
  mockStatuses = {
    driver: { status: 'approved', loading: false },
    restaurant: {
      status: 'approved',
      stripeConnectStatus: 'active',
      restaurantId: 'rest1',
      loading: false,
    },
  };

  render(<RoleSwitcher />);

  expect(screen.getByRole('group', { name: 'Changer d’espace' })).toBeInTheDocument();
  expect(screen.getByTestId('role-toggle-client')).toBeInTheDocument();
  expect(screen.getByTestId('role-toggle-driver')).toBeInTheDocument();
  expect(screen.getByTestId('role-toggle-restaurant')).toBeInTheDocument();
  expect(screen.queryByTestId('role-dropdown')).not.toBeInTheDocument();
  expect(screen.getByTestId('role-toggle-restaurant')).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByTestId('role-toggle-restaurant')).not.toHaveTextContent('Restaurateur');
});

it('persists a role, reloads the auth profile, then replaces the route', async () => {
  mockUserData = makeUserData({ driver: true }, 'client');
  mockStatuses = {
    driver: { status: 'approved', loading: false },
    restaurant: null,
  };

  render(<RoleSwitcher />);
  fireEvent.click(screen.getByTestId('role-toggle-driver'));

  await waitFor(() => expect(mockSetActiveRole).toHaveBeenCalledWith(mockUserData, 'driver'));
  expect(mockReloadUser).toHaveBeenCalledTimes(1);
  expect(mockReplace).toHaveBeenCalledWith('/driver/dashboard');
  expect(mockReloadUser.mock.invocationCallOrder[0]).toBeLessThan(mockReplace.mock.invocationCallOrder[0]);
});

it('shows Client as an activation segment when a professional account has no client role', () => {
  mockUserData = {
    ...makeUserData({ driver: true }, 'driver'),
    roles: {
      driver: { joinedAt: {} as any },
    },
  };
  mockStatuses = {
    driver: { status: 'approved', loading: false },
    restaurant: null,
  };

  render(<RoleSwitcher allowClientActivation />);

  expect(screen.getByTestId('role-toggle-client')).toHaveAttribute('aria-label', 'Activer l’espace client');
});
```

Define the test fixtures used above before the suite:

```tsx
const mockReloadUser = jest.fn().mockResolvedValue(undefined);

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    currentUser: { uid: 'uid1' },
    userData: mockUserData,
    loading: false,
    reloadUser: mockReloadUser,
  }),
}));
```

Also test that a disabled segment does not call `setActiveRole` while the driver has an active ride, and that a failed `reloadUser` prevents navigation.

- [ ] **Step 2: Run the focused test and verify it fails for the old dropdown implementation**

Run:

```powershell
npm test -- --runInBand src/components/role/__tests__/RoleSwitcher.test.tsx
```

Expected: FAIL because the current component exposes a circular button and dropdown instead of a connected role group, and does not reload the auth profile before navigation.

- [ ] **Step 3: Implement the minimal connected toggle and observable auth reload**

Keep `ROLE_META`, status badges, active-ride rules, and route resolution. Replace the dropdown state and outside-click listener with:

```tsx
const visibleRoles: SwitchableRole[] = [];
if (userData?.roles?.client || allowClientActivation) visibleRoles.push('client');
if (userData?.roles?.driver) visibleRoles.push('driver');
if (userData?.roles?.restaurant) visibleRoles.push('restaurant');

async function handleSelect(role: SwitchableRole) {
  if (switching || role === activeRole || isRoleDisabled(role)) return;
  setSwitching(role);
  try {
    if (role === 'client' && !userData.roles.client) {
      const activateClientRole = httpsCallable<unknown, { success: boolean }>(functions, 'activateClientRole');
      await activateClientRole();
    }
    await setActiveRole(userData, role);
    await reloadUser();
    const routeContext = {
      driverStatus: statuses.driver?.status,
      restaurantStatus: statuses.restaurant?.status,
      stripeConnectStatus: statuses.restaurant?.stripeConnectStatus,
    };
    router.replace(getDashboardRouteFor(role, routeContext));
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Impossible de changer d’espace pour le moment.');
  } finally {
    setSwitching(null);
  }
}
```

Render one `role="group"` with a `button` per `visibleRoles`, using `MaterialIcon`, `aria-pressed`, `aria-label`, `title`, and a selected background. The default prop is `allowClientActivation = false`; the portal passes `true` so Client appears even before activation. Use a short busy state on the clicked segment and no persistent role text.

In `src/context/AuthContext.tsx`, keep the existing Firestore refresh logic but make `reloadUser()` reject when it cannot resolve a user document. After `const resolvedUserData = await fetchUserData(refreshedUser)`, throw `new Error('Impossible de recharger le profil utilisateur.')` when the result is null; this lets the toggle stop before navigation instead of hiding a stale-profile failure.

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```powershell
npm test -- --runInBand src/components/role/__tests__/RoleSwitcher.test.tsx
```

Expected: PASS with no dropdown-related failures.

- [ ] **Step 5: Commit the isolated toggle changes**

```powershell
git add -- 'src/components/role/RoleSwitcher.tsx' 'src/components/role/__tests__/RoleSwitcher.test.tsx'
git commit -m "feat: add compact restaurant role toggle"
```

### Task 2: Add a portal header with real logout

**Files:**
- Create: `src/app/food/portal/[id]/RestaurantPortalHeader.tsx`
- Create: `src/app/food/portal/[id]/__tests__/RestaurantPortalHeader.test.tsx`
- Modify: `src/app/food/portal/[id]/PortalClient.tsx`

**Interfaces:**
- Consumes: `restaurantName: string`, `allowClientActivation: boolean`.
- Produces: a header containing `RoleSwitcher`, an icon-only logout button, and a loading/error state.

- [ ] **Step 1: Write the failing header tests**

Mock `next/navigation`, `AuthService.signOut`, `RoleSwitcher`, and `MaterialIcon`. Test that the header renders the toggle, that logout calls `AuthService.signOut` before `router.replace('/login')`, and that a rejected sign-out leaves the route unchanged and shows an error.

```tsx
it('signs out before returning to login', async () => {
  render(<RestaurantPortalHeader restaurantName="Chez Medjira" />);

  fireEvent.click(screen.getByRole('button', { name: 'Se déconnecter' }));

  await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
  expect(mockReplace).toHaveBeenCalledWith('/login');
  expect(mockSignOut.mock.invocationCallOrder[0]).toBeLessThan(mockReplace.mock.invocationCallOrder[0]);
});

it('keeps the portal open when sign-out fails', async () => {
  mockSignOut.mockRejectedValueOnce(new Error('network')); 
  render(<RestaurantPortalHeader restaurantName="Chez Medjira" />);

  fireEvent.click(screen.getByRole('button', { name: 'Se déconnecter' }));

  expect(await screen.findByText('Impossible de vous déconnecter. Réessayez.')).toBeInTheDocument();
  expect(mockReplace).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the focused test and verify it fails because the header does not exist**

Run:

```powershell
npm test -- --runInBand src/app/food/portal/[id]/__tests__/RestaurantPortalHeader.test.tsx
```

Expected: FAIL with the missing module/component or missing logout button.

- [ ] **Step 3: Implement the header and replace the portal header markup**

Use `AuthService.signOut()` from `src/services/auth.service`, `useRouter()` from `next/navigation`, and `RoleSwitcher allowClientActivation`. The logout button must be icon-only visually but have `aria-label="Se déconnecter"`, `title="Se déconnecter"`, `disabled={signingOut}`, and a spinner while awaiting sign-out. On success call `router.replace('/login')`; on failure set the exact French error used by the test.

In `PortalClient`, render `<RestaurantPortalHeader restaurantName={restaurant.name} />` and remove the inline `RestaurantClientActivation` and text logout button.

- [ ] **Step 4: Run the header and existing portal-related tests**

Run:

```powershell
npm test -- --runInBand src/app/food/portal/[id]/__tests__/RestaurantPortalHeader.test.tsx src/components/role/__tests__/RoleSwitcher.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit the portal header changes**

```powershell
git add -- 'src/app/food/portal/[id]/RestaurantPortalHeader.tsx' 'src/app/food/portal/[id]/__tests__/RestaurantPortalHeader.test.tsx' 'src/app/food/portal/[id]/PortalClient.tsx'
git commit -m "fix: make restaurant portal logout explicit"
```

### Task 3: Surface Stripe payout setup inside the portal

**Files:**
- Create: `src/components/restaurant/RestaurantPortalPayoutBanner.tsx`
- Create: `src/components/restaurant/__tests__/RestaurantPortalPayoutBanner.test.tsx`
- Modify: `src/app/food/portal/[id]/PortalClient.tsx`

**Interfaces:**
- Consumes: `Restaurant.stripeConnectStatus`, `Restaurant.status`, existing `StripeConnectBanner`.
- Produces: payout configuration visible before portal statistics for approved restaurants.

- [ ] **Step 1: Write the failing payout-placement tests**

Create a test for the new gate component. It must render the existing banner only for an approved restaurant and pass through its Stripe state:

```tsx
it.each([
  ['not_started', 'Configurer', '/restaurant/onboarding/payments'],
  ['in_progress', 'Reprendre', '/restaurant/onboarding/payments'],
  ['restricted', 'Réparer', '/restaurant/onboarding/payments?mode=update'],
] as const)('exposes the Stripe action for an approved restaurant in %s', (stripeConnectStatus, label, href) => {
  render(<RestaurantPortalPayoutBanner status="approved" stripeConnectStatus={stripeConnectStatus} />);
  expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', href);
});

it('renders nothing for an active or non-approved restaurant', () => {
  const { container, rerender } = render(
    <RestaurantPortalPayoutBanner status="approved" stripeConnectStatus="active" />,
  );
  expect(container).toBeEmptyDOMElement();
  rerender(<RestaurantPortalPayoutBanner status="pending_approval" stripeConnectStatus="not_started" />);
  expect(container).toBeEmptyDOMElement();
});
```

- [ ] **Step 2: Run the focused test and verify it fails because the gate component does not exist**

Run:

```powershell
npm test -- --runInBand src/components/restaurant/__tests__/RestaurantPortalPayoutBanner.test.tsx
```

Expected: FAIL because `RestaurantPortalPayoutBanner` has not been implemented yet.

- [ ] **Step 3: Implement the portal placement**

Implement `RestaurantPortalPayoutBanner` with props `{ status: RestaurantStatus; stripeConnectStatus: StripeConnectStatus }`, returning `null` unless `status === 'approved'`, and otherwise rendering `StripeConnectBanner` inside the existing spacing wrapper. After the validation alert and before the stats grid in `PortalClient`, add:

```tsx
<RestaurantPortalPayoutBanner
  status={restaurant.status}
  stripeConnectStatus={restaurant.stripeConnectStatus}
/>
```

Keep the existing `StripeConnectBanner` state mapping and onboarding URLs unchanged.

- [ ] **Step 4: Run banner, header, and role tests**

Run:

```powershell
npm test -- --runInBand src/components/restaurant/__tests__/RestaurantPortalPayoutBanner.test.tsx src/app/food/portal/[id]/__tests__/RestaurantPortalHeader.test.tsx src/components/role/__tests__/RoleSwitcher.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit the payout placement and tests**

```powershell
git add -- 'src/components/restaurant/RestaurantPortalPayoutBanner.tsx' 'src/components/restaurant/__tests__/RestaurantPortalPayoutBanner.test.tsx' 'src/app/food/portal/[id]/PortalClient.tsx'
git commit -m "feat: expose restaurant payout setup in portal"
```

### Task 4: Diagnose and harden menu-image Storage failures

**Files:**
- Modify: `src/app/food/portal/[id]/menu/MenuManagementClient.tsx` only if the authenticated owner or error path is incorrect
- Modify: `src/services/menu-image-storage.service.ts` only if the Storage error is swallowed or the upload lifecycle is incomplete
- Modify: `src/services/__tests__/menu-image-storage.service.test.ts`
- Modify: `storage.rules` only if a read-only rule comparison proves the existing owner check is incorrect; do not broaden ownership

**Interfaces:**
- Consumes: `restaurantId` from the authenticated restaurant portal and Storage path `menu-images/{restaurantId}/{itemId}/{uploadId}.webp`.
- Produces: a completed resumable upload before `getDownloadURL()`, and a user-visible error for unauthorized uploads/deletes.

- [ ] **Step 1: Reproduce the current failure path with targeted evidence**

Trace the menu page’s source of `restaurantId`, the current Firebase UID, and the `restaurants/{restaurantId}.ownerId` comparison. Run the existing service test and inspect the browser error code. Do not weaken `storage.rules` during diagnosis.

Run:

```powershell
npm test -- --runInBand src/services/__tests__/menu-image-storage.service.test.ts
```

Expected: the service test establishes whether the local upload completion behavior is covered; the browser evidence must identify whether the 403 is an owner mismatch, invalid content type/size, or stale session.

- [ ] **Step 2: Add a failing regression test for the confirmed cause**

If the confirmed cause is lifecycle-related, assert `getDownloadURL` is not called before `uploadTask.complete` resolves. If it is an error-surfacing issue, assert `storage/unauthorized` is converted into the French permission message while `storage/object-not-found` remains tolerated for deletion.

- [ ] **Step 3: Implement only the confirmed root-cause fix**

Keep the current owner-only rule, the WebP metadata, and the 500 KiB limit. Preserve the already-present `complete` promise behavior if it is correct. Update only the portal ID/session source or error handling proven by the regression test.

- [ ] **Step 4: Run the Storage service tests and rules tests**

Run:

```powershell
npm test -- --runInBand src/services/__tests__/menu-image-storage.service.test.ts
npm run test:firestore -- --runInBand tests/firestore.rules.test.ts
```

Expected: PASS, with unauthorized owners still refused.

- [ ] **Step 5: Commit only the Storage-specific changes**

```powershell
git add -- 'src/app/food/portal/[id]/menu/MenuManagementClient.tsx' 'src/services/menu-image-storage.service.ts' 'src/services/__tests__/menu-image-storage.service.test.ts' 'storage.rules'
git commit -m "fix: harden restaurant menu image permissions"
```

### Task 5: Full verification and handoff

**Files:**
- No planned source changes; update tests only if a verified regression is discovered.

- [ ] **Step 1: Run the focused regression suite**

```powershell
npm test -- --runInBand src/components/role/__tests__/RoleSwitcher.test.tsx src/app/food/portal/[id]/__tests__/RestaurantPortalHeader.test.tsx src/components/restaurant/__tests__/StripeConnectBanner.test.tsx src/services/__tests__/menu-image-storage.service.test.ts
```

Expected: all focused suites pass with zero failing tests.

- [ ] **Step 2: Run typecheck and lint**

```powershell
npm run typecheck
npm run lint
```

Expected: both exit with code 0.

- [ ] **Step 3: Run the production build**

```powershell
npm run build
```

Expected: Next.js production build exits with code 0.

- [ ] **Step 4: Inspect the final diff and working tree**

```powershell
git diff --check HEAD~3..HEAD
git status --short
git log -5 --oneline
```

Confirm only the implementation commits and the user’s pre-existing unrelated changes are present; do not reset or discard any unrelated work.
