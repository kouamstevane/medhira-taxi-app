# Scalable customer restaurant menu

## Goal

Make the customer-facing restaurant page usable for menus of up to 1,000 dishes without rendering or fetching the full catalog at once.

## Scope

### V1 — Menu discovery

V1 focuses on finding and adding available dishes:

- server-side search by dish name, category, and indexed reference prefixes;
- sticky search input near the restaurant header;
- sticky horizontal category navigation with `Tout` and item counts when available;
- cursor-based Firestore pagination with 24 dishes per page;
- URL synchronization for `search` and `category`;
- available dishes only for the customer experience;
- progressive loading that preserves already rendered dishes;
- explicit loading, error, empty-result, empty-menu, and closed-restaurant states;
- reuse of the current quick-add card and cart flow.

### V2 — Dish details and customization

V2 is intentionally separate and may introduce a dedicated menu-item schema for modifiers, supplements, allergens, nutrition information, and checkout validation. It is not required to ship V1.

## Architecture

Add a customer-specific menu page query instead of using the current `getRestaurantMenu` method, which is limited to 50 records and is not cursor-paginated. The query contract is:

```ts
getCustomerRestaurantMenuPage({
  restaurantId,
  search,
  category,
  cursor,
  pageSize: 24,
})
```

The service applies `isAvailable == true`, an optional category equality filter, an optional indexed prefix search, stable ordering by category and document ID, `limit(24)`, and `startAfter(cursor)` for subsequent pages.

The customer page owns a focused hook for search, category, cursor, loading, errors, and stale-request protection. Existing admin catalog hooks and components may be reused as references, but their availability and management semantics must not be copied blindly into the customer flow.

## Customer experience

The page hierarchy is:

1. Compact restaurant header.
2. Sticky search field with the placeholder `Rechercher un plat…`.
3. Sticky horizontal category rail containing `Tout` and available categories.
4. Optional popular-items section only when a reliable popularity signal exists.
5. Current category/search result list using the existing menu item card as the starting point.
6. `Afficher plus` or equivalent progressive page loading.
7. Empty-result and retry states.
8. Existing cart affordance when the cart contains an item.

The page must never require the customer to scan 1,000 cards in one uninterrupted document. Search and category controls remain reachable while scrolling.

## Data flow and state handling

The flow is:

`restaurantId → categories → first page → search/category change → new page query → next cursor page`

Required states:

- initial skeleton without layout shift;
- next-page loading that does not clear existing results;
- retryable network error;
- no matching results with a reset action;
- restaurant with no menu;
- closed restaurant with ordering disabled;
- stale response protection when search criteria change quickly;
- category data reused without unnecessary refetches.

Search and category criteria are encoded in the URL so the state survives refreshes and can be shared.

## Preproduction migration policy

The application is not yet in production and currently has one authorized operator. Schema and index changes can therefore be introduced directly, but they must still be implemented as a coherent migration: update the service contract, add required Firestore indexes/rules, update fixtures, and keep the old method untouched until the customer page has moved to the new query.

## Testing

- Service tests cover availability filtering, page size, stable ordering, search prefixes, category filters, cursors, and `hasMore`.
- Hook tests cover URL synchronization, filter resets, pagination, stale responses, loading, and retry states.
- Component tests cover sticky search/category controls, result counts, empty states, and progressive loading.
- Playwright covers a mobile customer flow: open a restaurant, search a dish, select a category, load more, and add a dish to the cart.
- V2 modifier and checkout tests are excluded from this implementation.

## Non-goals

- Do not implement dish modifiers, supplements, allergens, or nutrition details in V1.
- Do not load the complete menu into the browser.
- Do not add popularity ranking without a trustworthy data source.
- Do not replace the existing cart architecture.
