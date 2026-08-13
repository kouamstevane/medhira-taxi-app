import {
  getOpeningHoursForDate,
  isRestaurantOpenAt,
  normalizeOpeningHours,
  validateOpeningHours,
} from '@/utils/restaurant-hours';

describe('restaurant hours', () => {
  it('uses the default schedule when the restaurant has no hours', () => {
    const hours = normalizeOpeningHours();

    expect(hours.monday).toEqual({ open: '09:00', close: '22:00', closed: false });
    expect(hours.sunday).toEqual({ open: '09:00', close: '22:00', closed: true });
  });

  it('normalizes null and legacy closed values', () => {
    const hours = normalizeOpeningHours({
      monday: { open: '08:00', close: '18:00' },
      tuesday: null,
    });

    expect(hours.monday).toEqual({ open: '08:00', close: '18:00', closed: false });
    expect(hours.tuesday.closed).toBe(true);
  });

  it('rejects a schedule with no open day', () => {
    const hours = normalizeOpeningHours();
    Object.values(hours).forEach((day) => {
      day.closed = true;
    });

    expect(validateOpeningHours(hours)).toBe('Au moins un jour doit être ouvert.');
  });

  it('rejects incomplete and inverted times', () => {
    const hours = normalizeOpeningHours();
    hours.monday.open = '18:00';
    hours.monday.close = '08:00';

    expect(validateOpeningHours(hours)).toBe(
      'L’heure de fermeture doit être après l’heure d’ouverture pour lundi.',
    );
  });

  it('returns the schedule entry for the requested date', () => {
    const hours = normalizeOpeningHours();
    const result = getOpeningHoursForDate(hours, new Date('2026-08-10T12:00:00'));

    expect(result.key).toBe('monday');
    expect(result.label).toBe('Lundi');
  });

  it('keeps ordering available during configured opening hours', () => {
    const date = new Date('2026-08-13T12:00:00');
    const openingHours = normalizeOpeningHours({
      thursday: { open: '09:00', close: '22:00', closed: false },
    });

    expect(isRestaurantOpenAt({ isOpen: false, openingHours }, date)).toBe(true);
  });
});
