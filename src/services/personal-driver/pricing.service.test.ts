import {
  calculatePersonalDriverPrices,
  getRecommendedPersonalDriverPlan,
} from './pricing.service';
import { PERSONAL_DRIVER_PLANS } from './plans';

describe('Personal Driver pricing', () => {
  it('uses explicit PDF tariffs and minimums', () => {
    expect(PERSONAL_DRIVER_PLANS.basic).toMatchObject({
      pricePerKm: 1.5,
      minimumBillableKm: 200,
      minimumAmount: 300,
    });
    expect(PERSONAL_DRIVER_PLANS.classic).toMatchObject({
      pricePerKm: 1.25,
      minimumBillableKm: 360,
      minimumAmount: 450,
    });
    expect(PERSONAL_DRIVER_PLANS.premium).toMatchObject({
      pricePerKm: 1.1,
      minimumBillableKm: 591,
      minimumAmount: 650,
    });
  });

  it('applies the plan minimum when monthly distance is below threshold', () => {
    const result = calculatePersonalDriverPrices({ monthlyDistanceKm: 150, requestedWeekdays: [1, 2, 3, 4, 5] });

    expect(result.plans.basic.totalBeforeTax).toBe(300);
    expect(result.plans.classic.totalBeforeTax).toBe(450);
    expect(result.plans.premium.totalBeforeTax).toBe(650);
    expect(result.plans.basic.minimumApplied).toBe(true);
  });

  it('applies explicit minimums below thresholds and distance pricing at thresholds', () => {
    const premiumBelowThreshold = calculatePersonalDriverPrices({ monthlyDistanceKm: 590, requestedWeekdays: [1, 2, 3, 4, 5] });
    const premiumAtThreshold = calculatePersonalDriverPrices({ monthlyDistanceKm: 591, requestedWeekdays: [1, 2, 3, 4, 5] });
    const classicAtThreshold = calculatePersonalDriverPrices({ monthlyDistanceKm: 360, requestedWeekdays: [1, 2, 3, 4, 5] });
    const basicAtThreshold = calculatePersonalDriverPrices({ monthlyDistanceKm: 200, requestedWeekdays: [1, 2, 3, 4, 5] });

    expect(premiumBelowThreshold.plans.premium.totalBeforeTax).toBe(650);
    expect(premiumAtThreshold.plans.premium.totalBeforeTax).toBe(650.1);
    expect(classicAtThreshold.plans.classic.totalBeforeTax).toBe(450);
    expect(basicAtThreshold.plans.basic.totalBeforeTax).toBe(300);
  });

  it('recommends Classic when Classic is cheaper than Basic for high weekday mileage', () => {
    const result = calculatePersonalDriverPrices({ monthlyDistanceKm: 440, requestedWeekdays: [1, 2, 3, 4, 5] });

    expect(result.plans.basic.totalBeforeTax).toBe(660);
    expect(result.plans.classic.totalBeforeTax).toBe(550);
    expect(result.plans.premium.totalBeforeTax).toBe(650);
    expect(result.recommendedPlanId).toBe('classic');
    expect(getRecommendedPersonalDriverPlan(result).planId).toBe('classic');
  });

  it('rejects Basic recommendation when weekend service is requested', () => {
    const result = calculatePersonalDriverPrices({ monthlyDistanceKm: 150, requestedWeekdays: [1, 2, 3, 4, 5, 6] });

    expect(result.plans.basic.isEligible).toBe(false);
    expect(result.recommendedPlanId).toBe('classic');
  });
});
