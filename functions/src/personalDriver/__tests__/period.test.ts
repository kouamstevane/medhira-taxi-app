import {
  countWeekdayOccurrences,
  getPeriodEndDateExclusive,
} from '../period.js';

describe('personal driver periods', () => {
  it('ends exactly 30 calendar days after the inclusive start', () => {
    expect(getPeriodEndDateExclusive('2026-02-01')).toBe('2026-03-03');
    expect(getPeriodEndDateExclusive('2026-01-15')).toBe('2026-02-14');
  });

  it('counts weekdays only inside the half-open period', () => {
    expect(countWeekdayOccurrences('2026-07-27', '2026-08-26', [1])).toBe(5);
    expect(countWeekdayOccurrences('2026-07-27', '2026-08-26', [1, 2, 3, 4, 5])).toBe(22);
  });

  it('rejects invalid calendar dates and weekday values', () => {
    expect(() => getPeriodEndDateExclusive('2026-02-30')).toThrow();
    expect(() => countWeekdayOccurrences('2026-07-27', '2026-08-26', [7])).toThrow();
    expect(() => countWeekdayOccurrences('2026-08-26', '2026-07-27', [1])).toThrow();
  });
});
