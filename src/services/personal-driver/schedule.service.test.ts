import { buildPersonalDriverTripDrafts } from './schedule.service';

describe('Personal Driver schedule generation', () => {
  it('creates one outbound trip for each selected weekday in the 30-day period', () => {
    const trips = buildPersonalDriverTripDrafts({
      subscriptionId: 'sub_1',
      userId: 'user_1',
      startDate: '2026-08-03',
      selectedWeekdays: [1, 2, 3, 4, 5],
      tripType: 'one_way',
      departureTime: '07:30',
      pickupAddress: 'Maison',
      destinationAddress: 'Travail',
      planId: 'basic',
    });

    expect(trips).toHaveLength(22);
    expect(trips[0]).toMatchObject({
      subscriptionId: 'sub_1',
      userId: 'user_1',
      direction: 'outbound',
      status: 'scheduled',
    });
  });

  it('creates outbound and return trips for round trips', () => {
    const trips = buildPersonalDriverTripDrafts({
      subscriptionId: 'sub_2',
      userId: 'user_1',
      startDate: '2026-08-03',
      selectedWeekdays: [1],
      tripType: 'round_trip',
      departureTime: '07:30',
      returnTime: '17:00',
      pickupAddress: 'Maison',
      destinationAddress: 'Travail',
      planId: 'classic',
    });

    expect(trips).toHaveLength(10);
    expect(trips[0].direction).toBe('outbound');
    expect(trips[1].direction).toBe('return');
    expect(trips[1].pickupAddress).toBe('Travail');
    expect(trips[1].destinationAddress).toBe('Maison');
  });
});
