# Driver onboarding decision flow

## Goal

Prevent an incomplete chauffeur account from trapping the user in the registration wizard after login.

## Scope

When the authenticated profile is in `driver_onboarding`, the login page shows an intermediate decision screen instead of redirecting immediately to `/driver/register`.

The screen exposes exactly three actions:

1. **Reprendre l’inscription**: navigate to `/driver/register` and preserve the existing server/local draft.
2. **Plus tard**: sign out the current Firebase user and navigate to the application landing page `/`.
3. **Abandonner cette inscription**: show an explicit confirmation, call the existing `requestAccountDeletion` callable with `{ confirm: 'DELETE_MY_ACCOUNT' }`, clear the local driver-registration progress, sign out, and navigate to `/`.

## Architecture

- Keep the existing `getRouteForPostLogin` routing contract unchanged for other roles.
- Add a reusable client-side decision view for the `driver_onboarding` state.
- Route the login page's authenticated-profile effect to that view instead of automatically replacing the route.
- Reuse the existing GDPR account-deletion callable so deletion covers Firebase Auth, Firestore, Storage, RTDB, and associated records according to the server's deletion policy.
- The client must never directly delete protected Firestore/Auth data.

## UX and error handling

- The abandonment confirmation must clearly state that the account and entered information will be permanently deleted.
- While deletion is running, disable all three actions and show a loading state.
- On successful deletion, redirect to `/`.
- On deletion failure, keep the user on the decision screen and show an actionable French error message; do not sign out before the server confirms deletion.
- “Plus tard” must always sign out before redirecting to `/`.

## Local draft safety

- The decision flow must clear the local `driver_registration_progress` only after the user confirms abandonment and the server deletion succeeds.
- “Reprendre” and “Plus tard” must preserve the draft.

## Tests

- Authenticated `driver_onboarding` profile renders exactly the three requested actions.
- “Reprendre” navigates to `/driver/register` without deletion.
- “Plus tard” signs out and navigates to `/` without deletion.
- “Abandonner” requires confirmation, calls `requestAccountDeletion`, clears local progress, signs out, and navigates to `/` on success.
- Deletion errors keep the decision view visible and do not clear the draft or sign out.
- Existing role-routing tests continue to pass.
