# Task 1 Report

**Task:** Define the V2 customer menu item data model and service contracts

**Status:** Implemented in the current checkout

**Scope**
- Modified `src/types/food-delivery.ts`
- Modified `src/services/food-delivery.service.ts`
- Created `src/services/__tests__/customer-menu-item-details.service.test.ts`
- Did not modify `firestore.indexes.json` because the Task 1 detail path uses a single-document read and did not require a verified composite index

**Brief alignment**
- Kept the existing V1 paginated customer menu discovery flow unchanged
- Added the exact V2 customer detail contract types requested by the brief
- Added a dedicated customer item detail read path so dish details can load on demand
- Preserved legacy compatibility by returning empty arrays, `{}` checkout rules, and `undefined` nutrition when V2 fields are absent

**RED evidence**
- Command:
  - `npx jest src/services/__tests__/customer-menu-item-details.service.test.ts --runInBand`
- Result:
  - `FAIL src/services/__tests__/customer-menu-item-details.service.test.ts`
  - `TypeError: (0 , _fooddeliveryservice.getCustomerMenuItemDetails) is not a function`
- Why this was the correct RED:
  - The failing test proved the new customer detail service entrypoint did not exist yet
  - All three tests failed for the missing contract/service boundary, which matches the Task 1 brief expectation

**GREEN evidence**
- Command:
  - `npx jest src/services/__tests__/customer-menu-item-details.service.test.ts --runInBand`
- Result:
  - `Test Suites: 1 passed, 1 total`
  - `Tests: 3 passed, 3 total`

**Implementation details**
- `src/types/food-delivery.ts`
  - Added `CustomerMenuModifierOption`
  - Added `CustomerMenuModifierGroup`
  - Added `CustomerMenuSupplement`
  - Added `CustomerMenuAllergen`
  - Added `CustomerMenuNutrition`
  - Added `CustomerMenuItemDetails`
- `src/services/food-delivery.service.ts`
  - Added a dedicated `getCustomerMenuItemDetails(restaurantId, itemId)` read path backed by `getDoc`
  - Added detail-mapping helpers for modifier groups, modifier options, supplements, allergens, nutrition, and checkout rules
  - Filtered out unavailable modifier options and unavailable supplements
  - Preserved default modifier options when available
  - Returned sparse nutrition objects without inventing missing nutrition fields
  - Returned empty arrays and `undefined` nutrition for legacy documents
  - Exposed the new function through `FoodDeliveryService`
- `src/services/__tests__/customer-menu-item-details.service.test.ts`
  - Added legacy fallback coverage
  - Added V2 availability filtering and sparse nutrition coverage
  - Added dedicated checkout rules lookup coverage proving the detail path does not depend on the catalog page query

**Focused test cases added**
1. Legacy menu items deserialize with empty modifier groups, supplements, allergens, and `undefined` nutrition
2. V2 detail reads return only available modifier options and supplements while preserving defaults and sparse nutrition values
3. Checkout rules are returned from a dedicated item detail lookup and can be read without invoking the paginated catalog query

**Self-review**
- The new detail reader is scoped to a single document read, so it does not alter the V1 paginated catalog behavior
- The mapper is intentionally defensive around legacy or partially populated menu documents
- The new tests verify the requested contract behavior at the service boundary using the repo’s existing Firestore mocking style
- No extra files in the implementation scope were modified

**Concerns**
- The type contracts were added to `src/types/food-delivery.ts` only. They are available for direct imports there, but they are not re-exported from `src/types/index.ts` because Task 1 scoped the required file changes to the food-delivery type surface itself

**Commit**
- Planned conventional commit:
  - `feat: add customer menu item detail contracts`
