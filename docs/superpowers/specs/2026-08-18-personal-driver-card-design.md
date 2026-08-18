# Personal Driver dashboard card copy

## Goal

Make the Personal Driver card on the dashboard more concise while preserving its main identification and monthly transport context.

## Design

The card in `src/app/dashboard/components/DashboardServiceGrid.tsx` will:

- keep the title `Personal Driver`;
- keep the subtitle `Transport mensuel`;
- use the description `Un chauffeur dédié pour vos trajets réguliers.`;
- remove the `Configurer mon transport mensuel` call to action.

No route, service data, styling system, or other dashboard cards will change.

## Testing

Update the existing Personal Driver dashboard entry test to assert the concise description and assert that the removed CTA is not rendered. Existing route and title assertions remain unchanged.
