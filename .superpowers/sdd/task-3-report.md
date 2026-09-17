# Task 3 report: migrate catalog action modals to BottomSheet

## Status

Implemented Task 3 in the four approved feature files. Existing public `isOpen` and `onClose` props remain unchanged, and business service workflows, cleanup, progress handling, and import confirmation logic were preserved.

## Changes

- Migrated `BulkCsvImportModal` to the shared `BottomSheet` exported from `@/components/ui`.
- Migrated `StoreConnectorModal` to the shared `BottomSheet`.
- Removed the feature-local fixed overlays, panel wrappers, and import modal body-overflow effect.
- Routed sheet dismissal through each modal’s existing `handleClose`.
- Applied the requested dismissal rules:
  - Import: `canDismiss={!(isProcessing && importJob?.status === 'processing')}`.
  - Store: `canDismiss={!isTesting && !isSaving && !isSyncing}`.
  - Store footer cancellation is also disabled while testing, saving, or syncing so it cannot bypass the shared dismissal guard.
- Added focused presentation coverage for accessible titles, shared handles, idle import drag dismissal, and busy-state dismissal blocking. Existing workflow tests remain in place.

## Verification evidence

Focused command, run after implementation:

```text
npx jest src/components/food/__tests__/BulkCsvImportModal.test.tsx src/components/food/__tests__/StoreConnectorModal.test.tsx --runInBand

Test Suites: 2 passed, 2 total
Tests:       15 passed, 15 total
```

The required red-first check was also observed before migration: the new shared-handle assertions failed because both modals still rendered local overlays and no `bottom-sheet-handle` existed. After migration, the focused suite passed.

`git diff --check` completed without whitespace errors.

## Task 3 review-fix evidence

Required covering command:

```text
npx jest src/components/ui/__tests__/BottomSheet.test.tsx src/components/food/__tests__/BulkCsvImportModal.test.tsx src/components/food/__tests__/StoreConnectorModal.test.tsx --runInBand

Test Suites: 3 passed, 3 total
Tests:       30 passed, 30 total
Snapshots:   0 total
Time:        10.104 s
Ran all test suites matching src/components/ui/__tests__/BottomSheet.test.tsx|src/components/food/__tests__/BulkCsvImportModal.test.tsx|src/components/food/__tests__/StoreConnectorModal.test.tsx.
```

The review fix adds optional `BottomSheet.onCloseRequest` behavior for the explicit close button only. With no callback, existing `canDismiss` behavior remains unchanged; backdrop, Escape, and drag dismissal continue to use `canDismiss`. `BulkCsvImportModal` routes the explicit close button to `handleClose`, allowing its active-processing `window.confirm` path while drag/backdrop/Escape remain blocked. `StoreConnectorModal` routes the explicit close request through its testing/saving/syncing guard, preserving blocked close behavior in those states. `MenuManagementClient` routes the explicit close request through `handleAttemptCloseModal`.

Focused regressions cover the callback contract, import confirmation reachability with `window.confirm` mocked, blocked import drag, and blocked store close while testing. `git diff --check` completed without whitespace errors.

## Scope and concerns

Only the four Task 3 source/test files are intended for the Task 3 commit. Other pre-existing working-tree modifications were left unstaged and untouched. No full build or repository-wide test run was requested; validation is limited to the focused feature tests and diff check.
