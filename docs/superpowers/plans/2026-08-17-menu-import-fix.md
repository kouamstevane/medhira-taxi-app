# Menu Import Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make menu catalogue uploads cancellable and time-bounded, deploy the import security rules and functions to `medjira-service`, and verify real CSV imports.

**Architecture:** Keep Firebase Storage upload orchestration in `uploadMenuImportFile`, adding an optional `AbortSignal` and timeout around the existing `UploadTask`. The modal owns cancellation during the upload phase and continues using the existing callable and Firestore progress listener afterward. Deploy only the committed import rules and functions from this isolated worktree.

**Tech Stack:** TypeScript, React, Firebase Storage `UploadTask`, Jest, Firebase Emulator Suite, Firebase CLI.

## Global Constraints

- Keep code and comments in English; preserve French UI text.
- Do not change Stripe dependencies or unrelated working-tree changes.
- Preserve the existing three-argument `uploadMenuImportFile` call contract.
- Do not alter CSV/XLSX parsing or import validation behavior.
- Verify before claiming completion.

### Task 1: Add failing upload timeout and cancellation tests

**Files:**
- Modify: `src/services/__tests__/menu-import-client.service.test.ts`
- Modify: `src/components/food/__tests__/BulkCsvImportModal.test.tsx`

- [ ] Add a service test with a pending mocked `UploadTask`; advance fake timers past the configured timeout; assert cancellation and the French expiration error.
- [ ] Add a modal test with a pending upload promise; select a valid CSV; click Annuler; assert the upload receives an abort signal and the modal closes without starting the callable.
- [ ] Update the existing happy-path expectation to include the fourth options argument without changing the original three arguments.
- [ ] Run both test files and confirm the new tests fail because timeout/cancellation support is absent.

### Task 2: Implement bounded and cancellable uploads

**Files:**
- Modify: `src/services/menu-import-client.service.ts`
- Modify: `src/components/food/BulkCsvImportModal.tsx`

- [ ] Add an optional `MenuImportUploadOptions` argument with `signal?: AbortSignal` and `timeoutMs?: number`.
- [ ] Set the default timeout to 30 seconds; cancel the Firebase `UploadTask` on timeout or signal abort; clear timers and listeners on every settle path.
- [ ] Mark deliberate abort errors so the modal can close without presenting a spurious error.
- [ ] Store an `AbortController` only for the Storage phase; abort it from Annuler/close before resetting modal state.
- [ ] Pass the signal to `uploadMenuImportFile` and preserve the existing callable and Firestore listener flow.
- [ ] Run the two focused test files and confirm they pass.

### Task 3: Verify local rules and application build

**Files:**
- No source changes expected.

- [ ] Install `functions` dependencies with the existing lockfile.
- [ ] Run the focused client tests, Storage rules emulator test, and TypeScript/build checks available in the workspace.
- [ ] Inspect the diff to confirm only the timeout/cancellation implementation, tests, and plan/spec files changed.

### Task 4: Deploy the import backend

**Files:**
- Deploy: `firestore.rules`, `storage.rules`, `functions`

- [ ] Confirm Firebase CLI authentication and active project are `medjira-service`.
- [ ] Deploy `firestore`, `storage`, and `functions` from the isolated worktree.
- [ ] Record the deployment output and function deployment status.

### Task 5: Re-run real import scenarios

**Files:**
- Read: `.worktrees/menu-import-sync/test-datasets/01-menu-standard-valide.csv`
- Read: `.worktrees/menu-import-sync/test-datasets/02-menu-separateur-point-virgule-fr.csv`
- Read: `.worktrees/menu-import-sync/test-datasets/03-menu-avec-erreurs-partielles.csv`

- [ ] Run scenario 1 and verify the upload is no longer rejected with HTTP 403 and the import completes.
- [ ] Run scenario 2 and verify semicolon/French headers complete without parsing errors.
- [ ] Run scenario 3 and verify valid rows import while invalid rows appear in the detailed error report.
- [ ] Capture any remaining failure with its exact UI state and browser/network error.
