# Food order tracking entry point

## Goal

Make the Food page action in the top-right corner immediately recognizable as the place to follow a meal order on mobile.

## Current issue

The action currently displays only a delivery icon inside a circular button. Users can reach `/food/orders`, but the icon does not communicate that it opens order tracking at a glance.

## Design

- Keep the existing Material Icons visual language and orange primary accent.
- Replace the icon-only circle with a compact, pill-shaped link containing the existing delivery icon and the visible label `Suivre ma commande`.
- Keep the link target `/food/orders`, where the user can select an order and open its real-time tracking screen.
- Use responsive sizing and prevent the label from wrapping so the action remains fully visible on narrow mobile screens.
- Keep an accessible name and visible focus state; the visible label is the primary explanation, not a tooltip-only solution.

## Scope

- Update the Food page header action only.
- Add or update a focused UI test for the link target, visible label, and delivery icon.
- Do not change order retrieval, status handling, or the tracking page.

## Acceptance criteria

1. On `/food`, a user can identify the tracking action without guessing from an icon.
2. The action visibly contains `Suivre ma commande` and links to `/food/orders`.
3. The Material Icon remains consistent with the rest of the app.
4. The action fits within the mobile header at the project’s narrow layout and does not overflow or wrap.
5. Existing Food page behavior and relevant tests remain passing.
