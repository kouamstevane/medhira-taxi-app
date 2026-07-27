import { calculatePersonalDriverPrices } from '../pricing';

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
});
