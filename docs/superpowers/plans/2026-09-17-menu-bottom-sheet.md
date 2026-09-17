# Menu Bottom Sheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Use one responsive, draggable bottom-sheet component for menu add/edit, catalog import, and store connection modals, while leaving delete confirmation uncha1nged.

**Architecture:** Create a controlled client component at `src/components/ui/BottomSheet.tsx`. It owns overlay rendering, scroll locking, Escape/backdrop dismissal, accessibility, safe-area spacing, and pointer-based drag-to-dismiss. Existing feature components keep their business state and pass a guarded `onOpenChange` callback or `canDismiss` predicate.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict mode, Tailwind CSS v4, Jest 30, React Testing Library.

## Global Constraints

- Code and comments are in English; existing UI text remains French.
- Do not add a dependency for drawer behavior.
- The delete confirmation dialog remains unchanged.
- Preserve existing upload, compression, import, synchronization, validation, and sensitive-state cleanup behavior.
- Use `apply_patch` for source edits and run verification before claiming completion.

---

### Task 1: Build the shared BottomSheet primitive

**Files:**
- Create: `src/components/ui/BottomSheet.tsx`
- Create: `src/components/ui/__tests__/BottomSheet.test.tsx`
- Modify: `src/components/ui/index.ts`

**Interfaces:**
- Produces:
  `BottomSheet({ open, onOpenChange, title, children, canDismiss = true, className? }: BottomSheetProps)`.
- `BottomSheetProps`: `open: boolean`, `onOpenChange: (open: boolean) => void`, `title: string`, `children: React.ReactNode`, optional `canDismiss?: boolean`, optional `className?: string`.

- [ ] **Step 1: Write failing behavior tests.**

Test that an open sheet renders an accessible dialog with the title, locks body scrolling, closes from backdrop, close button, and Escape, restores the previous overflow value on close/unmount, and does not close when `canDismiss={false}). Test pointer drag dismissal with `pointerDown`, `pointerMove`, and `pointerUp`; a downward movement of at least 120px closes, while a short movement leaves the dialog open.

- [ ] **Step 2: Run the focused tests and verify they fail for the missing component.**

Run:
`npx jest src/components/ui/__tests__/BottomSheet.test.tsx --runInBand`

Expected: FAIL because `BottomSheet` does not exist yet.

- [ ] **Step 3: Implement the primitive.**

Render `null` when closed. When open, render a fixed full-screen dialog with a backdrop and a bottom-aligned sheet on mobile; use `sm:items-center` and rounded corners on larger screens. Add a visible mobile drag handle and close button. Track only pointer gestures beginning on the handle/header with refs; set pointer capture, calculate positive vertical displacement, apply a clamped inline translate while dragging, and call `onOpenChange(false)` at the distance/velocity threshold. Snap back with a CSS transition otherwise. Attach Escape and body overflow effects only while open, and restore the exact previous overflow in cleanup. Set `aria-modal="true"`, `role="dialog"`, and `aria-labelledby` to an internally generated title id. Use `env(safe-area-inset-bottom)` in the sheet padding.

- [ ] **Step 4: Export the component and run the focused tests.**

Run:
`npx jest src/components/ui/__tests__/BottomSheet.test.tsx --runInBand`

Expected: PASS with all primitive interaction tests passing.

- [ ] **Step 5: Commit the isolated primitive.**

`git add src/components/ui/BottomSheet.tsx src/components/ui/__tests__/BottomSheet.test.tsx src/components/ui/index.ts && git commit -m "feat: add draggable bottom sheet primitive"`

### Task 2: Migrate the menu item editor

**Files:**
- Modify: `src/app/food/portal/[id]/menu/MenuManagementClient.tsx`
- Modify: `src/app/food/portal/[id]/menu/__tests__/MenuManagementClient.test.tsx`

**Interfaces:**
- Consumes the exported `BottomSheet` from `@/components/ui`.
- Keeps `handleAttemptCloseModal` as the business guard for compression/upload.

- [ ] **Step 1: Extend the existing menu tests.**

Assert that opening Add renders the shared dialog with the existing add title and drag handle, that a downward pointer gesture on the handle invokes the existing close path when idle, and that the delete confirmation still renders its existing dialog class/behavior without a drag-sheet migration.

- [ ] **Step 2: Run the focused menu test file and verify the new assertions fail.**

`npx jest "src/app/food/portal/[id]/menu/__tests__/MenuManagementClient.test.tsx" --runInBand`

Expected: the new shared-sheet/drag assertions fail before migration.

- [ ] **Step 3: Replace the local fixed overlay wrapper with `BottomSheet`.**

Import `BottomSheet` from `@/components/ui`, remove the editor-only modal DOM and its duplicate body/Escape effect, and render the existing form as the sheet children. Pass `open={isModalOpen}`, `title={editingItem ? t('editItem') : t('addItem')}`, `onOpenChange={(open) => { if (!open) handleAttemptCloseModal(); }}`, and `canDismiss={!isCompressing && !isUploading}`. Keep the existing close button if useful only once; do not alter form submission or image upload state.

- [ ] **Step 4: Run menu tests and verify behavior.**

`npx jest "src/app/food/portal/[id]/menu/__tests__/MenuManagementClient.test.tsx" --runInBand`

Expected: PASS, including add-sheet behavior and unchanged delete confirmation.

- [ ] **Step 5: Commit the menu editor migration.**

`git add "src/app/food/portal/[id]/menu/MenuManagementClient.tsx" "src/app/food/portal/[id]/menu/__tests__/MenuManagementClient.test.tsx" && git commit -m "feat: migrate menu editor to bottom sheet"`

### Task 3: Migrate catalog import and store connection

**Files:**
- Modify: `src/components/food/BulkCsvImportModal.tsx`
- Modify: `src/components/food/StoreConnectorModal.tsx`
- Modify: `src/components/food/__tests__/BulkCsvImportModal.test.tsx`
- Add or modify: `src/components/food/__tests__/StoreConnectorModal.test.tsx`

**Interfaces:**
- Both feature modals consume `BottomSheet` and retain their existing `isOpen`/`onClose` public props.
- Busy states map to `canDismiss`: import processing confirmation remains in `handleClose`; store testing/saving/syncing blocks close.

- [ ] **Step 1: Add focused modal presentation tests.**

For import, assert the accessible title, bottom-sheet handle, and that a drag close calls `onClose` when idle while an active processing state still follows the existing confirmation rule. For store connection, assert the same presentation and that `onClose` is not called while testing, saving, or syncing.

- [ ] **Step 2: Run the focused feature tests and verify the presentation assertions fail.**

`npx jest src/components/food/__tests__/BulkCsvImportModal.test.tsx src/components/food/__tests__/StoreConnectorModal.test.tsx --runInBand`

Expected: FAIL only on the new shared-sheet assertions before migration.

- [ ] **Step 3: Wrap the import content with `BottomSheet`.**

Import the primitive, remove the component-local fixed overlay and body-overflow effect, and render the current panel as children. Pass `title="Importer un catalogue de plats"`, `canDismiss={!(isProcessing && importJob?.status === 'processing')}`, and `onOpenChange={(open) => { if (!open) handleClose(); }}`. Keep the existing `window.confirm` behavior inside `handleClose` so closing during background processing remains an explicit user decision.

- [ ] **Step 4: Wrap the store content with `BottomSheet`.**

Import the primitive, remove the fixed centered wrapper, and use `title="Connecter une boutique"`, `canDismiss={!isTesting && !isSaving && !isSyncing}`, and `onOpenChange={(open) => { if (!open) handleClose(); }}`. Preserve all credentials cleanup, service calls, progress display, and footer actions.

- [ ] **Step 5: Run the focused feature tests.**

`npx jest src/components/food/__tests__/BulkCsvImportModal.test.tsx src/components/food/__tests__/StoreConnectorModal.test.tsx --runInBand`

Expected: PASS, including existing import workflow tests and new sheet interactions.

- [ ] **Step 6: Commit the feature modal migrations.**

`git add src/components/food/BulkCsvImportModal.tsx src/components/food/StoreConnectorModal.tsx src/components/food/__tests__/BulkCsvImportModal.test.tsx src/components/food/__tests__/StoreConnectorModal.test.tsx && git commit -m "feat: migrate menu action modals to bottom sheets"`

### Task 4: Full verification and review

**Files:**
- Review only: all files changed in Tasks 1–3.

- [ ] **Step 1: Run the complete relevant Jest suite.**

`npx jest src/components/ui src/components/food src/app/food/portal/[id]/menu --runInBand`

Expected: exit code 0 with zero failed tests.

- [ ] **Step 2: Run static checks.**

`npm run lint`

`npm run typecheck`

Expected: both commands exit 0 without new diagnostics.

- [ ] **Step 3: Run the production build.**

`npm run build`

Expected: exit code 0 and a successful Next.js production build.

- [ ] **Step 4: Inspect the final diff and verify scope.**

`git diff HEAD~3 --check`

Confirm the shared component is exported, all three requested flows use it, delete confirmation is unchanged, and pre-existing unrelated working-tree modifications are not included in the feature commits.
