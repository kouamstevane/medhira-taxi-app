# Task 3 Report: Firestore Rules and Indexes

## Implementation

- Added `personal_driver_subscriptions` rules: owners and admins can read; all client SDK writes are denied, preserving Cloud Functions/Admin SDK control of payment and activation state.
- Added `personal_driver_trips` rules: owners, assigned drivers, and admins can read; admins can create, update, and delete; assigned drivers can update only operational fields.
- Added five required composite indexes for subscription and trip access patterns.
- Added focused emulator-backed rules coverage in `tests/firestore/personal-driver.rules.test.ts`.

## Test Results

Initial required command:

```text
npm run test:firestore -- personal-driver
```

Result: failed before implementation because no Firestore emulator was listening on `127.0.0.1:8080`. The Jest pattern also included unrelated suites, which produced existing failures in `src/__tests__/unit/firestore-error-handler.test.ts` and the shared Firestore Jest setup.

Focused verification command:

```text
npx firebase emulators:exec --only firestore "npx jest --config jest.firestore.config.js tests/firestore/personal-driver.rules.test.ts --runInBand"
```

Result: passed. One suite, six tests passed.

The focused test locally neutralizes the shared setup's recursive `console.warn` and `console.error` hooks so expected permission denials can be asserted without stack-overflowing. No shared setup files were changed.

## Validation

- `firestore.indexes.json` parses as valid JSON.
- `git diff --check` passed for the implementation files.

## Review Fix Evidence

- Changed `personal_driver_subscriptions` create, update, and delete rules to `false`; Admin SDK writes remain available because Admin SDK bypasses Firestore rules.
- Replaced the admin client-SDK subscription activation test with negative coverage for admin create/update/delete and owner create/update/delete attempts, including `status` and `paymentStatus`.
- Strengthened assigned-driver trip coverage for protected `assignedDriverId`, `userId`, `subscriptionId`, and `scheduledAt` fields, and added read/update denial coverage for an unassigned driver.

Focused verification command:

```text
npx firebase emulators:exec --only firestore "npx jest --config jest.firestore.config.js tests/firestore/personal-driver.rules.test.ts --runInBand"
```

Result: passed. One suite, eight tests passed.
