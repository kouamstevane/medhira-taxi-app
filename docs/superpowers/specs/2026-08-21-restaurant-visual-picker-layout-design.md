# Restaurant Visual Picker Layout Design

## Goal

Make the restaurant registration visual section shorter and visually balanced on mobile by giving the logo and cover selectors the same compact frame.

## Design

`RestaurantVisualPicker` keeps its current file validation, preview, replace, remove, and accessibility behavior. Only its presentation changes:

- both `logo` and `cover` selectors use a shared `aspect-video` media frame;
- the logo preview uses `object-contain` with internal padding so the full square mark remains visible;
- the cover preview uses `object-cover` so the horizontal image fills the frame;
- the visual section reduces vertical spacing from `space-y-5` to `space-y-4`;
- the registration step keeps the selectors stacked on narrow screens to preserve readable controls.

## Verification

- Add a focused component test that asserts the logo and cover selectors expose the shared aspect-ratio class and that the logo image uses contain while the cover image uses cover.
- Run the focused Jest test and lint the changed component and test.
- Inspect `/restaurant/register/` in the in-app browser at the visual identity section to confirm both empty states have matching dimensions and the section is visibly shorter.

## Scope

No changes to image validation, upload preparation, Firebase Storage, registration data, or restaurant settings layout.
