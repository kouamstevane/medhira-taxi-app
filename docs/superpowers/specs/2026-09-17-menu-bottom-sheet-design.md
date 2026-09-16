# Menu modals as mobile bottom sheets

## Scope

Replace the current modal presentation for menu item creation/editing, catalog import, and store connection with one shared responsive `BottomSheet` component. The delete confirmation dialog is explicitly out of scope and must remain unchanged.

## Goals

- Present the three in-scope flows as a drawer rising from the bottom on mobile.
- Allow dismissal by dragging the drawer downward, tapping the backdrop, pressing Escape, or using the close action when the flow is not busy.
- Keep long forms and import/synchronization content scrollable inside the sheet.
- Preserve existing business logic, form state, validation, upload cancellation, and import synchronization behavior.
- Keep a centered dialog-like presentation on larger screens.
- Respect mobile safe-area insets and avoid shifting the existing bottom navigation unexpectedly.

## Design

Add `src/components/ui/BottomSheet.tsx` as a client component. Its public API will expose controlled `open` state, `onOpenChange`, an accessible title, children, optional class names, and a dismissal guard. It will render a fixed overlay with a backdrop and a sheet container. The sheet will use pointer events on its drag handle/header to track vertical movement, translate while dragging, and dismiss when the downward distance or velocity passes a threshold; otherwise it will spring back. Pointer capture and cleanup will support touch, pen, and mouse input without interfering with controls inside the sheet body.

The component will own document scroll locking, Escape handling, backdrop dismissal, ARIA dialog attributes, focus affordances, and the mobile safe-area bottom padding. Consumers will remain responsible for business-specific busy state by passing the dismissal guard and close callback behavior.

## Integration

- The menu item editor in `MenuManagementClient` will be wrapped by `BottomSheet`; its existing form and close guards will be retained.
- `BulkCsvImportModal` will use `BottomSheet` while preserving its import progress and processing close restrictions.
- `StoreConnectorModal` will use `BottomSheet` while preserving testing, saving, syncing, and result states.
- `DeleteMenuItemDialog` will not be migrated.
- The shared component will be exported from `src/components/ui/index.ts`.

## Interaction and accessibility

- The drawer opens from the bottom with a short enter transition and closes with a matching exit transition.
- Dragging downward updates the drawer position directly; a short or upward gesture snaps back.
- A modal backdrop remains available for pointer dismissal unless the consumer disables dismissal.
- Escape and close controls are unavailable or ignored while the consumer reports a busy state.
- The dialog has an accessible name from its title and keeps keyboard focus usable within the content.
- The sheet body uses bounded height and internal overflow scrolling so mobile forms remain usable above the keyboard and bottom navigation.

## Verification

Add or update component tests for: open state and accessible dialog, backdrop/close/Escape dismissal, drag threshold snap-back and dismissal, scroll-lock cleanup, and dismissal blocking while busy. Update menu management tests to verify add, import, and store flows use the shared sheet while delete remains the existing dialog. Run targeted Jest tests, lint, typecheck, and the production build.
