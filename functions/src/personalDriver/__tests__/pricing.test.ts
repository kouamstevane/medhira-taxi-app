import { calculatePersonalDriverPrices } from '../pricing';
import { DEFAULT_PERSONAL_DRIVER_PLANS } from '../planConfig';

describe('Personal Driver backend pricing', () => {
  it('keeps Classic eligible for the full weekend', () => {
    const result = calculatePersonalDriverPrices({
      monthlyDistanceKm: 150,
      requestedWeekdays: [0, 6],
    });

    expect(result.plans.basic.isEligible).toBe(false);
    expect(result.plans.classic.isEligible).toBe(true);
    expect(result.plans.premium.isEligible).toBe(true);
  });

  it('calculates using an injected plan map', () => {
    const result = calculatePersonalDriverPrices(
      {
        monthlyDistanceKm: 600,
        requestedWeekdays: [1, 2, 3, 4, 5],
      },
      {
        basic: {
          ...DEFAULT_PERSONAL_DRIVER_PLANS.basic,
        },
        classic: {
          ...DEFAULT_PERSONAL_DRIVER_PLANS.classic,
        },
        premium: {
          ...DEFAULT_PERSONAL_DRIVER_PLANS.premium,
          minimumAmount: 800,
          includedSpecialTrips: 9,
        },
      },
    );

    expect(result.plans.premium.minimumAmount).toBe(800);
    expect(result.plans.premium.totalBeforeTax).toBe(800);
    expect(result.plans.premium.includedSpecialTrips).toBe(9);
  });

  it('prices an injected plan from distance even when monthly distance is below minimum billable kilometers', () => {
    const result = calculatePersonalDriverPrices(
      {
        monthlyDistanceKm: 300,
        requestedWeekdays: [1, 2, 3, 4, 5],
      },
      {
        basic: {
          ...DEFAULT_PERSONAL_DRIVER_PLANS.basic,
        },
        classic: {
          ...DEFAULT_PERSONAL_DRIVER_PLANS.classic,
        },
        premium: {
          ...DEFAULT_PERSONAL_DRIVER_PLANS.premium,
          minimumAmount: 300,
          pricePerKm: 1.5,
          minimumBillableKm: 500,
        },
      },
    );

    expect(result.plans.premium.totalBeforeTax).toBe(450);
  });
});
