# Compact Mobile Role Switcher Design

## Goal

Prevent the role switcher from overflowing the driver header on narrow mobile screens and reduce visual saturation.

## Current Problem

The mobile header contains a 40 px profile button, a 40 px notification button, and a role switcher with an icon, the `Mode :` prefix, the active role label, a chevron, gaps, and horizontal padding. These elements cannot fit reliably on narrow viewports.

## Selected Design

Use a 44 by 44 px circular role switcher button that displays only the active role icon:

- `local_taxi` for the driver space
- `person` for the client space
- `restaurant` for the restaurant space

The icon remains dynamic so the current space is identifiable without a redundant text label. The dropdown remains aligned to the right edge of the trigger and retains full role names, status badges, disabled states, and the active-role checkmark.

## Alternatives Considered

1. Show the full label on larger screens and only the icon on mobile. This preserves redundant information and makes the control change shape between viewport sizes.
2. Show the icon with a chevron. This is more explicit but adds visual noise and width without being necessary for a familiar menu trigger.

The icon-only design is the most compact and consistent option.

## Accessibility

The trigger keeps a minimum 44 px touch target. Its accessible name identifies the active space and the action, for example `Changer d'espace, espace actuel : Chauffeur`. Existing `aria-expanded` and `aria-haspopup` attributes remain intact. Visible keyboard focus must remain available.

## Responsive Behavior

The button has fixed square dimensions and cannot shrink. The header can therefore fit the profile, notification, and role controls on narrow supported screens without horizontal overflow. The dropdown opens from the right edge so its placement does not extend beyond the application container on standard mobile widths.

## Testing

Component tests will verify that:

- the trigger contains the active-role icon without the `Mode :` prefix or visible role label;
- the trigger exposes the correct accessible name;
- opening the dropdown still shows the complete role options and preserves role switching behavior.

The result will also be checked with a production-relevant test command and a narrow mobile viewport.

## Scope

Only the role switcher trigger and its tests are changed. Existing uncommitted dashboard and dropdown-alignment work is preserved.
