# Food Card Payment Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the food checkout send a server-valid card-order payload and guide the user clearly when the delivery address is invalid.

**Architecture:** Keep the server as the source of truth for order totals and payment state. Align the checkout address helper with the server schema, centralize construction of the callable payload in `food-delivery.service.ts`, and map callable validation failures to a user-facing checkout message without changing Stripe PaymentIntent logic.

**Tech Stack:** Next.js 16 App Router, TypeScript, Firebase Callable Functions, Zod, Jest, React Testing Library.

## Global Constraints

- Code and comments remain in English; UI text remains in French.
- Do not alter server-side pricing, Stripe settlement, or Firestore payment state transitions.
- Preserve unrelated working-tree changes.
- No production code is written before a failing regression test is observed.
- Do not deploy Firebase Functions as part of this local correction.

---

## File Map

- Modify `src/app/food/checkout/checkout-address.ts`: expose the same 5–500 character address rule used by the server.
- Modify `src/app/food/checkout/__tests__/checkout-address.test.ts`: cover short, trimmed, and maximum-length address behavior.
- Modify `src/services/food-delivery.service.ts`: build a clean callable payload and preserve the card payment method.
- Modify `src/__tests__/unit/food-create-order.service.test.ts`: verify card payload fields and omission of empty optional fields.
- Modify `src/app/food/checkout/checkout-ui.ts`: expose a safe user-facing mapping for callable validation errors.
- Modify `src/app/food/checkout/__tests__/checkout-layout.test.ts`: cover the validation-error message mapping.
- Modify `src/app/food/checkout/page.tsx`: use the address rule and mapped error message.
- Modify `functions/src/restaurant/__tests__/submitRestaurantApplication.test.ts`: add a valid card request regression case for the deployed contract.

### Task 1: Align address validation with the server

**Files:**
- Modify: `src/app/food/checkout/checkout-address.ts`
- Test: `src/app/food/checkout/__tests__/checkout-address.test.ts`

**Interfaces:**
- Produces `isCheckoutAddressValid(address: string): boolean`, returning `true` only when `address.trim().length` is between 5 and 500 inclusive.

- [ ] **Step 1: Write the failing tests**

Add these cases to `checkout-address.test.ts`:

```ts
  it('rejects addresses shorter than the callable contract', () => {
    expect(isCheckoutAddressValid('1234')).toBe(false);
  });

  it('accepts a trimmed address at the server minimum', () => {
    expect(isCheckoutAddressValid(' 12345 ')).toBe(true);
  });

  it('rejects addresses longer than the callable contract', () => {
    expect(isCheckoutAddressValid('a'.repeat(501))).toBe(false);
  });
```

- [ ] **Step 2: Run the focused test and verify the expected failure**

Run:

```bash
npm test -- --runInBand src/app/food/checkout/__tests__/checkout-address.test.ts
```

Expected: the new short-address and 501-character cases fail because the current helper accepts every non-empty string.

- [ ] **Step 3: Implement the minimal validation change**

Replace the helper body with:

```ts
export function isCheckoutAddressValid(address: string): boolean {
  const length = address.trim().length;
  return length >= 5 && length <= 500;
}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run the same Jest command. Expected: all checkout address tests pass.

- [ ] **Step 5: Commit the isolated helper change**

```bash
git add src/app/food/checkout/checkout-address.ts src/app/food/checkout/__tests__/checkout-address.test.ts
git commit -m "fix: align food checkout address validation"
```

### Task 2: Build a clean card-order callable payload

**Files:**
- Modify: `src/services/food-delivery.service.ts`
- Test: `src/__tests__/unit/food-create-order.service.test.ts`

**Interfaces:**
- Produces the existing `FoodDeliveryService.createFoodOrder(orderData)` behavior and `CreateFoodOrderResult` return type.
- The callable payload always contains `restaurantId`, `orderItems`, `isWeekend`, `deliveryAddress`, and `paymentMethod`.
- Optional fields are included only when they are defined; optional strings are included only when their trimmed value is non-empty.

- [ ] **Step 1: Write the failing service tests**

Add these tests to `food-create-order.service.test.ts`:

```ts
  test('sends a card payment method and populated delivery options to the callable', async () => {
    const createCallable = jest.fn().mockResolvedValue({
      data: {
        orderId: 'food_card_123',
        basePrice: 30,
        deliveryCost: 9,
        totalOrderPrice: 39,
        deliveryDistance: 5,
      },
    });
    (httpsCallable as jest.Mock).mockReturnValue(createCallable);

    await FoodDeliveryService.createFoodOrder({
      userId: 'client_1',
      restaurantId: 'restaurant_1',
      orderItems: [{ menuItemId: 'item_1', itemName: 'Plat', itemPrice: 30, itemQuantity: 1 }],
      deliveryDistance: 5,
      isWeekend: true,
      deliveryAddress: '123 Rue Test, Edmonton',
      deliveryPreference: 'meet_at_door',
      deliveryInstructions: 'Porte gauche',
      paymentMethod: 'card',
    });

    expect(createCallable).toHaveBeenCalledWith({
      restaurantId: 'restaurant_1',
      orderItems: [{ menuItemId: 'item_1', itemName: 'Plat', itemPrice: 30, itemQuantity: 1 }],
      isWeekend: true,
      deliveryAddress: '123 Rue Test, Edmonton',
      deliveryPreference: 'meet_at_door',
      deliveryInstructions: 'Porte gauche',
      paymentMethod: 'card',
    });
  });

  test('does not send empty or undefined optional fields', async () => {
    const createCallable = jest.fn().mockResolvedValue({
      data: { orderId: 'food_clean_123', basePrice: 30, deliveryCost: 9, totalOrderPrice: 39, deliveryDistance: 5 },
    });
    (httpsCallable as jest.Mock).mockReturnValue(createCallable);

    await FoodDeliveryService.createFoodOrder({
      userId: 'client_1',
      restaurantId: 'restaurant_1',
      orderItems: [{ menuItemId: 'item_1', itemName: 'Plat', itemPrice: 30, itemQuantity: 1 }],
      deliveryDistance: 5,
      isWeekend: false,
      deliveryAddress: '123 Rue Test, Edmonton',
      deliveryInstructions: '   ',
      customerPhone: '',
      clientNeighbourhood: '   ',
      cityId: undefined,
      paymentMethod: 'card',
    });

    expect(createCallable).toHaveBeenCalledWith({
      restaurantId: 'restaurant_1',
      orderItems: [{ menuItemId: 'item_1', itemName: 'Plat', itemPrice: 30, itemQuantity: 1 }],
      isWeekend: false,
      deliveryAddress: '123 Rue Test, Edmonton',
      paymentMethod: 'card',
    });
  });
```

- [ ] **Step 2: Run the focused service test and verify the expected failure**

Run:

```bash
npm test -- --runInBand src/__tests__/unit/food-create-order.service.test.ts
```

Expected: the new assertions fail because the current service passes optional properties with empty/undefined values.

- [ ] **Step 3: Implement the minimal payload builder**

In `food-delivery.service.ts`, add a local helper immediately before `createFoodOrder`:

```ts
const compactOptionalString = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed || undefined;
};
```

Replace the direct callable object with a base payload and conditional assignments:

```ts
    const payload: {
      restaurantId: string;
      orderItems: OrderItem[];
      isWeekend: boolean;
      deliveryAddress: string;
      deliveryLocation?: { lat: number; lng: number };
      deliveryPreference?: 'leave_at_door' | 'meet_outside' | 'meet_at_door';
      deliveryInstructions?: string;
      customerPhone?: string;
      clientNeighbourhood?: string;
      cityId?: string;
      paymentMethod: 'wallet' | 'card';
    } = {
      restaurantId: orderData.restaurantId,
      orderItems: orderData.orderItems,
      isWeekend: orderData.isWeekend,
      deliveryAddress: orderData.deliveryAddress.trim(),
      paymentMethod: selectedPaymentMethod,
    };

    if (orderData.deliveryLocation) payload.deliveryLocation = orderData.deliveryLocation;
    if (orderData.deliveryPreference) payload.deliveryPreference = orderData.deliveryPreference;

    const deliveryInstructions = compactOptionalString(orderData.deliveryInstructions);
    if (deliveryInstructions) payload.deliveryInstructions = deliveryInstructions;

    const customerPhone = compactOptionalString(orderData.customerPhone);
    if (customerPhone) payload.customerPhone = customerPhone;

    const clientNeighbourhood = compactOptionalString(orderData.clientNeighbourhood);
    if (clientNeighbourhood) payload.clientNeighbourhood = clientNeighbourhood;

    const cityId = compactOptionalString(orderData.cityId);
    if (cityId) payload.cityId = cityId;

    const result = await createCallable(payload);
```

- [ ] **Step 4: Run the focused service test and verify it passes**

Run the same Jest command. Expected: all food order service tests pass.

- [ ] **Step 5: Commit the service contract change**

```bash
git add src/services/food-delivery.service.ts src/__tests__/unit/food-create-order.service.test.ts
git commit -m "fix: normalize food order callable payload"
```

### Task 3: Make callable validation errors actionable in checkout

**Files:**
- Modify: `src/app/food/checkout/checkout-ui.ts`
- Test: `src/app/food/checkout/__tests__/checkout-layout.test.ts`
- Modify: `src/app/food/checkout/page.tsx`

**Interfaces:**
- Produces `getFoodCheckoutErrorMessage(error: unknown): string` for the checkout UI.
- It maps Firebase callable `invalid-argument` errors and the existing French validation message to `Vérifiez votre adresse et les informations de commande, puis réessayez.`; other errors keep their existing message when available.

- [ ] **Step 1: Write the failing mapping tests**

Update the test import and add:

```ts
import { CHECKOUT_FOOTER_CLASS, PROFILE_ADDRESS_EDIT_HREF, getFoodCheckoutErrorMessage } from '../checkout-ui';

  it('maps callable validation errors to an actionable French message', () => {
    expect(getFoodCheckoutErrorMessage({ code: 'invalid-argument', message: 'Données de commande invalides.' })).toBe(
      'Vérifiez votre adresse et les informations de commande, puis réessayez.'
    );
  });
```

- [ ] **Step 2: Run the focused test and verify the expected failure**

Run:

```bash
npm test -- --runInBand src/app/food/checkout/__tests__/checkout-layout.test.ts
```

Expected: the new test fails because the mapping helper does not exist.

- [ ] **Step 3: Implement the mapping and use it in the page**

Add to `checkout-ui.ts`:

```ts
export function getFoodCheckoutErrorMessage(error: unknown): string {
  const candidate = error as { code?: unknown; message?: unknown } | null;
  if (
    candidate?.code === 'invalid-argument'
    || candidate?.message === 'Données de commande invalides.'
  ) {
    return 'Vérifiez votre adresse et les informations de commande, puis réessayez.';
  }

  return candidate && typeof candidate.message === 'string' && candidate.message.trim()
    ? candidate.message
    : 'Une erreur est survenue lors de la validation de votre commande.';
}
```

Import `getFoodCheckoutErrorMessage` in `page.tsx` and replace the catch-body message selection with:

```ts
      const msg = getFoodCheckoutErrorMessage(error);
```

Also change the short-address early-return text to:

```ts
      setErrorMsg('Renseignez une adresse de livraison valide (5 à 500 caractères).');
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run the same Jest command. Expected: all checkout layout tests pass.

- [ ] **Step 5: Commit the checkout error-handling change**

```bash
git add src/app/food/checkout/checkout-ui.ts src/app/food/checkout/__tests__/checkout-layout.test.ts src/app/food/checkout/page.tsx
git commit -m "fix: clarify food checkout validation errors"
```

### Task 4: Cover the server contract for card requests

**Files:**
- Modify: `functions/src/restaurant/__tests__/submitRestaurantApplication.test.ts`

**Interfaces:**
- Reuses `CreateFoodOrderRequestSchema` and verifies that the server accepts the exact card payload produced by the client.

- [ ] **Step 1: Write the server regression test**

Add beside the existing valid wallet payload test:

```ts
  test('accepts a card payment request with delivery options', () => {
    expect(CreateFoodOrderRequestSchema.safeParse({
      ...validPayload,
      deliveryPreference: 'meet_at_door',
      deliveryInstructions: 'Porte gauche',
      paymentMethod: 'card',
    }).success).toBe(true);
  });
```

- [ ] **Step 2: Run the functions schema test and verify the contract passes**

Run:

```bash
npm --prefix functions test -- src/restaurant/__tests__/submitRestaurantApplication.test.ts --runInBand
```

Expected: the new test passes against the current server contract, confirming that the rejection is in the client payload path rather than the card enum or delivery-option contract.

- [ ] **Step 3: Commit the server regression test**

```bash
git add functions/src/restaurant/__tests__/submitRestaurantApplication.test.ts
git commit -m "test: cover card food order request contract"
```

### Task 5: Run the full verification set

**Files:**
- No new production files.

- [ ] **Step 1: Run all targeted frontend tests**

```bash
npm test -- --runInBand \
  src/app/food/checkout/__tests__/checkout-address.test.ts \
  src/app/food/checkout/__tests__/checkout-layout.test.ts \
  src/__tests__/unit/food-create-order.service.test.ts \
  src/__tests__/unit/food-delivery.service.test.ts
```

Expected: all targeted suites pass with no test failures.

- [ ] **Step 2: Run the functions schema regression test**

```bash
npm --prefix functions test -- src/restaurant/__tests__/submitRestaurantApplication.test.ts --runInBand
```

Expected: 13 tests pass in the suite after the new test is added.

- [ ] **Step 3: Run TypeScript checks**

```bash
npm run typecheck
npm --prefix functions run build
```

Expected: both commands exit with code 0.

- [ ] **Step 4: Inspect the final diff and working tree**

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; unrelated pre-existing modifications remain untouched; the four focused implementation commits and the existing spec commit are visible in history.
