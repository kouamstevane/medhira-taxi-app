import { isRestaurantOpenForOrdering } from '../restaurantAvailability.js';

describe('restaurant availability', () => {
  it('allows ordering during the configured opening interval', () => {
    expect(isRestaurantOpenForOrdering({
      isOpen: false,
      openingHours: {
        thursday: { open: '09:00', close: '22:00', closed: false },
      },
    }, new Date('2026-08-13T12:00:00'))).toBe(true);
  });
});
