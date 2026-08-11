# Restaurant Approval 400 Error Design

## Goal

Allow an administrator to approve a pending restaurant without receiving a `400 invalid-argument` response.

## Root Cause

The admin page sends `reason: null` for an approval request. The deployed callable validates `reason` with `z.string().optional()`, which accepts an omitted value but rejects `null`.

## Design

The client will build the callable payload without a `reason` field for approval and will include a trimmed reason only for rejection. The callable schema will accept `null` as a compatibility measure for older clients, while the rejection branch will continue to require a non-empty reason. The existing restaurant update and admin authorization flow remain unchanged.

## Error Handling

Approval sends `{ action: 'approve', restaurantId }`. Rejection sends `{ action: 'reject', restaurantId, reason }` and remains invalid when the reason is empty. No direct Firestore write will be added to the client.

## Testing

Add a regression test for the callable schema covering approval payloads with `null` and without `reason`, plus rejection payload validation. Add a client payload test covering omission of `reason` for approval and inclusion of a trimmed reason for rejection.

## Success Criteria

- Approval payloads are accepted when `reason` is omitted or `null`.
- Approval requests no longer serialize `reason: null` from the admin page.
- Rejection without a non-empty reason remains rejected.
- Focused tests, functions build, frontend lint, and the relevant frontend test pass.
