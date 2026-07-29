import {
  CreateFoodOrderRequestSchema,
  SubmitRestaurantApplicationRequestSchema,
} from '../../validators/schemas';

describe('SubmitRestaurantApplicationRequestSchema', () => {
  const validPayload = {
    data: {
      name: 'Le Bistrot',
      description: 'Restaurant gastronomique au cœur de la ville avec des plats maison.',
      address: '12 Rue de la Paix, 75002 Paris',
      phone: '+33142860088',
      email: 'contact@lebistrot.fr',
      cuisineType: ['Française', 'Gastronomique'],
      avgPricePerPerson: 35,
      commissionRate: 15,
      location: { lat: 53.5461, lng: -113.4938 },
      openingHours: {
        lundi: { open: '09:00', close: '22:00', closed: false },
        mardi: { open: '09:00', close: '22:00', closed: false },
      },
    },
  };

  test('accepts valid payload without restaurantId (new submission)', () => {
    const result = SubmitRestaurantApplicationRequestSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  test('accepts valid payload with restaurantId (re-submission)', () => {
    const result = SubmitRestaurantApplicationRequestSchema.safeParse({
      ...validPayload,
      restaurantId: 'rest_abc123',
    });
    expect(result.success).toBe(true);
  });

  test('rejects missing required fields', () => {
    const { name, ...noName } = validPayload.data;
    const result = SubmitRestaurantApplicationRequestSchema.safeParse({ data: noName });
    expect(result.success).toBe(false);
  });

  test('rejects empty cuisineType array', () => {
    const result = SubmitRestaurantApplicationRequestSchema.safeParse({
      data: { ...validPayload.data, cuisineType: [] },
    });
    expect(result.success).toBe(false);
  });

  test('rejects submissions without restaurant coordinates', () => {
    const { location, ...withoutLocation } = validPayload.data;
    const result = SubmitRestaurantApplicationRequestSchema.safeParse({ data: withoutLocation });

    expect(result.success).toBe(false);
  });

  test('rejects unknown fields (strict mode)', () => {
    const result = SubmitRestaurantApplicationRequestSchema.safeParse({
      data: { ...validPayload.data, maliciousField: 'hack' },
    });
    expect(result.success).toBe(false);
  });
});

describe('CreateFoodOrderRequestSchema', () => {
  const validPayload = {
    restaurantId: 'rest_123',
    orderItems: [
      {
        menuItemId: 'item_1',
        itemName: 'Fake name ignored by server',
        itemQuantity: 2,
        itemPrice: 0.01,
      },
    ],
    isWeekend: false,
    deliveryAddress: '123 Rue Test, Edmonton',
    paymentMethod: 'wallet',
  };

  test('accepts the server-created food order payload', () => {
    expect(CreateFoodOrderRequestSchema.safeParse(validPayload).success).toBe(true);
  });

  test('rejects client-supplied totals and payment validation fields', () => {
    const result = CreateFoodOrderRequestSchema.safeParse({
      ...validPayload,
      totalOrderPrice: 0.01,
      paymentValidated: true,
      status: 'confirmed',
    });

    expect(result.success).toBe(false);
  });
});
