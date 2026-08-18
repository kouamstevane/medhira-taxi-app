# Import catalogue avec revue manuelle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a mandatory server-backed review step before any catalogue import writes to Firestore.

**Architecture:** Storage receives the selected file, `previewMenuFileImport` parses and classifies rows without creating a Firestore import job, and `startMenuFileImport` creates the job only after an explicit confirmation containing selected valid row numbers. The existing worker revalidates and writes only the selected rows.

**Tech Stack:** Next.js 16, React 19, TypeScript, Firebase Callable Functions, Cloud Firestore, Firebase Storage, Jest, React Testing Library.

## Global Constraints

- No menu item write before explicit user confirmation.
- Invalid and conflicting rows are visible and excluded by default.
- The worker remains the final authority for validation and collision protection.
- UI copy remains in French; code and comments remain in English.
- Do not add a browser-side CSV/XLSX parsing dependency.

---

### Task 1: Server preview contract and callable

**Files:**
- Modify: `functions/src/restaurant/menuImportContracts.ts`
- Modify: `functions/src/restaurant/menuImportJobs.ts`
- Modify: `functions/src/index.ts`
- Test: `functions/src/restaurant/__tests__/menuImportJobs.test.ts`

**Interfaces:**
- `previewMenuFileImport({ restaurantId, importId, filePath, type })` returns `{ importId, rows, summary }`.
- Each preview row contains `rowNumber`, `name`, `externalId`, `price`, `category`, `description`, `status`, `selectable`, and optional `error`.
- `startMenuFileImport` requires `reviewConfirmed: true` and `includedRowNumbers: number[]`.

- [ ] **Step 1: Write failing tests** for preview classification (valid/new, same-source update, invalid row, manual conflict, duplicate external ID) and for rejecting a start request without explicit confirmation.
- [ ] **Step 2: Run the focused function tests** and verify they fail because the callable and contract are absent.
- [ ] **Step 3: Implement the preview types, callable, validation, ownership checks, file checks, parsing, row classification, and explicit start schema.
- [ ] **Step 4: Run the focused function tests** and verify they pass.
- [ ] **Step 5: Export `previewMenuFileImport` from `functions/src/index.ts` and run the functions TypeScript build.

### Task 2: Worker selection enforcement

**Files:**
- Modify: `functions/src/restaurant/menuImportContracts.ts`
- Modify: `functions/src/restaurant/menuImportJobs.ts`
- Test: `functions/src/restaurant/__tests__/menuImportJobs.test.ts`

**Interfaces:**
- `MenuImportJobRecord.includedRowNumbers?: number[]` stores the user-confirmed selection.
- `executeMenuImportJob` filters parsed records by the stored row numbers before setting totals or writing menu items.

- [ ] **Step 1: Add a failing worker test** proving an unselected valid row is not written.
- [ ] **Step 2: Run the test and verify it fails because the worker currently processes every row.
- [ ] **Step 3: Implement the selection filter and persist `includedRowNumbers` when creating the job.
- [ ] **Step 4: Run worker tests and the complete functions test suite.

### Task 3: Client service and review state

**Files:**
- Modify: `src/services/menu-import-client.service.ts`
- Modify: `src/types/food-delivery.ts`
- Test: `src/services/__tests__/menu-import-client.service.test.ts`

**Interfaces:**
- Add `previewMenuFileImport` client wrapper.
- Extend `startMenuFileImport` input with `reviewConfirmed` and `includedRowNumbers`.
- Add shared `MenuImportPreview`, `MenuImportPreviewRow`, and summary types.

- [ ] **Step 1: Add failing client tests** for callable payloads and preview response typing.
- [ ] **Step 2: Run the focused client tests and verify the new assertions fail.
- [ ] **Step 3: Implement the typed wrappers and preview types.
- [ ] **Step 4: Run the focused client tests and verify they pass.

### Task 4: Review-first modal UX

**Files:**
- Modify: `src/components/food/BulkCsvImportModal.tsx`
- Test: `src/components/food/__tests__/BulkCsvImportModal.test.tsx`

**Interfaces:**
- Modal states: file selection, review, and processing.
- Review actions: `Retourner au fichier`, row selection for selectable rows, and `Confirmer et importer`.

- [ ] **Step 1: Add failing component tests** proving file selection requests preview, preview is visible, start is not called before confirmation, invalid rows are unselected, and confirmation sends only selected row numbers.
- [ ] **Step 2: Run the component tests and verify they fail because the current modal starts immediately and has no review state.
- [ ] **Step 3: Implement the state machine, summary cards, row table, selection controls, explicit confirmation copy, and cleanup behavior.
- [ ] **Step 4: Run component, service, and menu page tests.
- [ ] **Step 5: Verify the complete flow in the local browser with the standard and partial-error datasets, including cancel-before-confirm.

### Task 5: Quality gate and deployment

**Files:**
- No additional source files.

- [ ] **Step 1: Run focused Jest tests for functions, client service, modal, and menu page.
- [ ] **Step 2: Run TypeScript checks, ESLint on changed files, and `git diff --check`.
- [ ] **Step 3: Run the production build.
- [ ] **Step 4: Deploy the verified build to Firebase Hosting and check the deployed route returns HTTP 200.
- [ ] **Step 5: Inspect the final diff and report the commit and verification evidence.
