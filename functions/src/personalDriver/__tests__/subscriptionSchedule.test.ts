import { assertFutureSpecialTrip, assertValidSubscriptionSchedule } from '../subscriptionSchedule';
import { buildPersonalDriverTripDrafts } from '../schedule';

describe('personal driver subscription schedule validation', () => {
  const now = new Date('2026-08-04T02:00:00.000Z');

  afterEach(() => {
    jest.useRealTimers();
  });

  it('rejects a start date before today in the pickup service time zone', () => {
    expect(() => assertValidSubscriptionSchedule({
      startDate: '2026-08-02',
      departureTime: '08:00',
      tripType: 'one_way',
      serviceTimeZone: 'America/Toronto',
      now,
    })).toThrow('start date');
  });

  it.each(['07:59', '08:00'])(
    'rejects a round-trip return time that is not after departure: %s',
    (returnTime) => {
      expect(() => assertValidSubscriptionSchedule({
        startDate: '2026-08-03',
        departureTime: '08:00',
        returnTime,
        tripType: 'round_trip',
        serviceTimeZone: 'America/Toronto',
        now,
      })).toThrow('return time');
    },
  );

  it.each([
    new Date('2026-08-04T01:59:59.999Z'),
    new Date('2026-08-04T02:00:00.000Z'),
  ])('rejects a special trip at or before now: %s', (scheduledAtUtc) => {
    expect(() => assertFutureSpecialTrip(scheduledAtUtc, now)).toThrow('future');
  });

  it('accepts valid future subscription and special-trip schedules', () => {
    expect(() => assertValidSubscriptionSchedule({
      startDate: '2026-08-03',
      departureTime: '08:00',
      returnTime: '18:00',
      tripType: 'round_trip',
      serviceTimeZone: 'America/Toronto',
      now,
    })).not.toThrow();
    expect(() => assertFutureSpecialTrip(
      new Date('2026-08-04T02:00:00.001Z'),
      now,
    )).not.toThrow();
  });

  it('skips generated trip instants that are already in the past', () => {
    jest.useFakeTimers().setSystemTime(Date.parse('2026-08-04T12:00:00.000Z'));

    const drafts = buildPersonalDriverTripDrafts({
      subscriptionId: 'sub_1',
      userId: 'user_1',
      periodStartDate: '2026-08-03',
      periodEndDateExclusive: '2026-08-06',
      serviceTimeZone: 'UTC',
      selectedWeekdays: [1, 2, 3],
      tripType: 'one_way',
      departureTime: '08:00',
      pickupAddress: 'A',
      destinationAddress: 'B',
      pickupLocation: { latitude: 1, longitude: 2 },
      destinationLocation: { latitude: 3, longitude: 4 },
      planId: 'basic',
      distanceOneWayKm: 10,
      distanceReturnKm: 0,
    });

    expect(drafts.map((draft) => draft.scheduledAtIso)).toEqual([
      '2026-08-05T08:00:00.000Z',
    ]);
  });
});
