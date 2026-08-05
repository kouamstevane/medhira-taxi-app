import {
  cancelPersonalDriverTripByClient,
  getPendingPersonalDriverRenewal,
  getPersonalDriverSubscriptionView,
  getPersonalDriverSubscriptionById,
  requestSpecialTrip,
} from './subscription.service';
import { httpsCallable } from 'firebase/functions';
import { doc, where } from 'firebase/firestore';

const mockCallable = jest.fn();
const mockGetDoc = jest.fn();
const mockGetDocs = jest.fn();

jest.mock('firebase/functions', () => ({
  httpsCallable: jest.fn(() => mockCallable),
}));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  doc: jest.fn((_db, collectionName: string, documentId: string) => ({ collectionName, documentId })),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
  limit: jest.fn(),
  orderBy: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
}));

jest.mock('@/config/firebase', () => ({
  db: {},
  functions: { region: 'europe-west1' },
}));

describe('Personal Driver subscription client actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2026-08-04T12:00:00.000Z'));
    mockCallable.mockResolvedValue({
      data: {
        success: true,
        tripId: 'trip_special',
        officialDistanceKm: 18.4,
        specialTripsRemaining: 1,
        monthlyDistanceKmRemaining: 81.6,
      },
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns an older current subscription beside a newer pending renewal', async () => {
    mockGetDocs.mockResolvedValue({
      empty: false,
      docs: [
        {
          id: 'pending_newer',
          data: () => ({
            userId: 'client_1',
            status: 'pending_payment',
            paymentStatus: 'pending',
            periodStartAtUtc: new Date('2026-09-01T00:00:00.000Z'),
            periodEndAtUtc: new Date('2026-10-01T00:00:00.000Z'),
          }),
        },
        {
          id: 'active_older',
          data: () => ({
            userId: 'client_1',
            status: 'active',
            paymentStatus: 'succeeded',
            periodStartAtUtc: new Date('2026-08-01T00:00:00.000Z'),
            periodEndAtUtc: new Date('2026-09-01T00:00:00.000Z'),
          }),
        },
      ],
    });

    await expect(getPersonalDriverSubscriptionView('client_1')).resolves.toEqual({
      active: expect.objectContaining({ id: 'active_older' }),
      pending: expect.objectContaining({ id: 'pending_newer' }),
    });
    expect(where).toHaveBeenCalledWith('status', 'in', ['active', 'pending_payment']);
  });

  it('uses the active period containing now instead of a newer future active renewal', async () => {
    mockGetDocs.mockResolvedValue({
      empty: false,
      docs: [
        {
          id: 'future_active_renewal',
          data: () => ({
            userId: 'client_1',
            sourceSubscriptionId: 'current_active',
            status: 'active',
            paymentStatus: 'succeeded',
            activationStatus: 'active',
            periodStartAtUtc: { toDate: () => new Date('2026-09-01T00:00:00.000Z') },
            periodEndAtUtc: { toDate: () => new Date('2026-10-01T00:00:00.000Z') },
          }),
        },
        {
          id: 'current_active',
          data: () => ({
            userId: 'client_1',
            status: 'active',
            paymentStatus: 'succeeded',
            periodStartAtUtc: { toDate: () => new Date('2026-08-01T00:00:00.000Z') },
            periodEndAtUtc: { toDate: () => new Date('2026-09-01T00:00:00.000Z') },
          }),
        },
      ],
    });

    await expect(getPersonalDriverSubscriptionView('client_1')).resolves.toEqual({
      active: expect.objectContaining({ id: 'current_active' }),
      pending: expect.objectContaining({ id: 'future_active_renewal' }),
    });
  });

  it('prefers the nearest future active renewal over a stale failed activation', async () => {
    mockGetDocs.mockResolvedValue({
      empty: false,
      docs: [
        {
          id: 'stale_failed_activation',
          data: () => ({
            userId: 'client_1',
            sourceSubscriptionId: 'expired_source',
            status: 'pending_payment',
            paymentStatus: 'succeeded',
            activationStatus: 'activation_failed',
            periodStartAtUtc: new Date('2026-07-01T00:00:00.000Z'),
            periodEndAtUtc: new Date('2026-08-01T00:00:00.000Z'),
          }),
        },
        {
          id: 'nearest_future_active',
          data: () => ({
            userId: 'client_1',
            sourceSubscriptionId: 'current_active',
            status: 'active',
            paymentStatus: 'succeeded',
            activationStatus: 'active',
            periodStartAtUtc: new Date('2026-09-01T00:00:00.000Z'),
            periodEndAtUtc: new Date('2026-10-01T00:00:00.000Z'),
          }),
        },
        {
          id: 'current_active',
          data: () => ({
            userId: 'client_1',
            status: 'active',
            paymentStatus: 'succeeded',
            periodStartAtUtc: new Date('2026-08-01T00:00:00.000Z'),
            periodEndAtUtc: new Date('2026-09-01T00:00:00.000Z'),
          }),
        },
      ],
    });

    await expect(getPersonalDriverSubscriptionView('client_1')).resolves.toEqual({
      active: expect.objectContaining({ id: 'current_active' }),
      pending: expect.objectContaining({ id: 'nearest_future_active' }),
    });
  });

  it('prefers the nearest future pending renewal over a stale pending payment', async () => {
    mockGetDocs.mockResolvedValue({
      empty: false,
      docs: [
        {
          id: 'stale_pending_payment',
          data: () => ({
            userId: 'client_1',
            sourceSubscriptionId: 'expired_source',
            status: 'pending_payment',
            paymentStatus: 'pending',
            periodStartAtUtc: new Date('2026-07-01T00:00:00.000Z'),
            periodEndAtUtc: new Date('2026-08-01T00:00:00.000Z'),
          }),
        },
        {
          id: 'nearest_future_pending',
          data: () => ({
            userId: 'client_1',
            sourceSubscriptionId: 'current_active',
            status: 'pending_payment',
            paymentStatus: 'pending',
            periodStartAtUtc: new Date('2026-09-01T00:00:00.000Z'),
            periodEndAtUtc: new Date('2026-10-01T00:00:00.000Z'),
          }),
        },
      ],
    });

    await expect(getPersonalDriverSubscriptionView('client_1')).resolves.toEqual({
      active: null,
      pending: expect.objectContaining({ id: 'nearest_future_pending' }),
    });
  });

  it('returns only the pending subscription when no active period contains now', async () => {
    mockGetDocs.mockResolvedValue({
      empty: false,
      docs: [
        {
          id: 'pending_only',
          data: () => ({
            userId: 'client_1',
            status: 'pending_payment',
            paymentStatus: 'succeeded',
            periodStartAtUtc: '2026-09-01T00:00:00.000Z',
            periodEndAtUtc: '2026-10-01T00:00:00.000Z',
          }),
        },
      ],
    });

    await expect(getPersonalDriverSubscriptionView('client_1')).resolves.toEqual({
      active: null,
      pending: expect.objectContaining({ id: 'pending_only' }),
    });
  });

  it('cancels trips through the secure callable', async () => {
    await cancelPersonalDriverTripByClient('trip_1');

    expect(httpsCallable).toHaveBeenCalledWith({ region: 'europe-west1' }, 'clientManagePersonalDriver');
    expect(mockCallable).toHaveBeenCalledWith({ action: 'cancelTrip', tripId: 'trip_1' });
  });

  it('requests special trips through the secure callable', async () => {
    const result = await requestSpecialTrip(
      'sub_1',
      'client_1',
      'classic',
      'Clinique',
      'Aeroport',
      '2026-08-12T09:30:00',
      18,
    );

    expect(mockCallable).toHaveBeenCalledWith({
      action: 'requestSpecialTrip',
      subscriptionId: 'sub_1',
      pickupAddress: 'Clinique',
      destinationAddress: 'Aeroport',
      scheduledAtIso: '2026-08-12T09:30:00',
      distanceKm: 18,
    });
    expect(result).toEqual({
      success: true,
      tripId: 'trip_special',
      officialDistanceKm: 18.4,
      specialTripsRemaining: 1,
      monthlyDistanceKmRemaining: 81.6,
    });
  });

  it('reads one subscription by its document ID', async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      id: 'sub_1',
      data: () => ({
        userId: 'client_1',
        activationStatus: 'activating',
        activationError: null,
      }),
    });

    await expect(getPersonalDriverSubscriptionById('sub_1')).resolves.toEqual({
      id: 'sub_1',
      userId: 'client_1',
      activationStatus: 'activating',
      activationError: null,
    });
    expect(doc).toHaveBeenCalledWith({}, 'personal_driver_subscriptions', 'sub_1');
    expect(mockGetDoc).toHaveBeenCalledTimes(1);
  });

  it('does not expose broader view-only candidates as a pending renewal', async () => {
    mockGetDocs.mockResolvedValue({
      empty: false,
      docs: [
        {
          id: 'initial_pending_purchase',
          data: () => ({
            userId: 'client_1',
            status: 'pending_payment',
            paymentStatus: 'pending',
            periodStartAtUtc: new Date('2026-08-05T00:00:00.000Z'),
            periodEndAtUtc: new Date('2026-09-05T00:00:00.000Z'),
          }),
        },
        {
          id: 'future_active_period',
          data: () => ({
            userId: 'client_1',
            sourceSubscriptionId: 'current_active',
            status: 'active',
            paymentStatus: 'succeeded',
            activationStatus: 'active',
            periodStartAtUtc: new Date('2026-09-05T00:00:00.000Z'),
            periodEndAtUtc: new Date('2026-10-05T00:00:00.000Z'),
          }),
        },
        {
          id: 'legacy_activation_state',
          data: () => ({
            userId: 'client_1',
            sourceSubscriptionId: 'current_active',
            status: 'pending_payment',
            paymentStatus: 'succeeded',
            periodStartAtUtc: new Date('2026-08-06T00:00:00.000Z'),
            periodEndAtUtc: new Date('2026-09-06T00:00:00.000Z'),
          }),
        },
      ],
    });

    await expect(getPendingPersonalDriverRenewal('client_1')).resolves.toBeNull();
  });

  it('selects only an eligible sourced pending renewal from broader view candidates', async () => {
    mockGetDocs.mockResolvedValue({
      empty: false,
      docs: [
        {
          id: 'initial_pending_purchase',
          data: () => ({
            userId: 'client_1',
            status: 'pending_payment',
            paymentStatus: 'pending',
            periodStartAtUtc: new Date('2026-08-05T00:00:00.000Z'),
            periodEndAtUtc: new Date('2026-09-05T00:00:00.000Z'),
          }),
        },
        {
          id: 'future_active_period',
          data: () => ({
            userId: 'client_1',
            sourceSubscriptionId: 'current_active',
            status: 'active',
            paymentStatus: 'succeeded',
            activationStatus: 'active',
            periodStartAtUtc: new Date('2026-09-05T00:00:00.000Z'),
            periodEndAtUtc: new Date('2026-10-05T00:00:00.000Z'),
          }),
        },
        {
          id: 'eligible_pending_renewal',
          data: () => ({
            userId: 'client_1',
            sourceSubscriptionId: 'current_active',
            status: 'pending_payment',
            paymentStatus: 'requires_action',
            activationStatus: 'pending_payment',
            periodStartAtUtc: new Date('2026-10-05T00:00:00.000Z'),
            periodEndAtUtc: new Date('2026-11-05T00:00:00.000Z'),
          }),
        },
      ],
    });

    await expect(getPendingPersonalDriverRenewal('client_1')).resolves.toEqual(
      expect.objectContaining({ id: 'eligible_pending_renewal' }),
    );
  });

  it.each(['activating', 'activation_failed'])(
    'selects a paid renewal whose activation is %s',
    async (activationStatus) => {
      mockGetDocs.mockResolvedValue({
        empty: false,
        docs: [
          {
            id: 'sub_renewal',
            data: () => ({
              userId: 'client_1',
              sourceSubscriptionId: 'sub_active',
              status: 'pending_payment',
              paymentStatus: 'succeeded',
              activationStatus,
            }),
          },
          {
            id: 'sub_active',
            data: () => ({
              userId: 'client_1',
              status: 'active',
              paymentStatus: 'succeeded',
              activationStatus: 'active',
            }),
          },
        ],
      });

      await expect(getPendingPersonalDriverRenewal('client_1')).resolves.toEqual(
        expect.objectContaining({
          id: 'sub_renewal',
          paymentStatus: 'succeeded',
          activationStatus,
        }),
      );
    },
  );
});
