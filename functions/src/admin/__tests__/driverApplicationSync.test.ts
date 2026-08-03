type DriverApplicationSyncMockState = {
  get: jest.Mock;
  update: jest.Mock;
  commit: jest.Mock;
  where: jest.Mock;
  serverTimestamp: jest.Mock;
};

jest.mock('firebase-admin', () => ({
  firestore: (() => {
    const get = jest.fn();
    const update = jest.fn();
    const commit = jest.fn().mockResolvedValue(undefined);
    const where = jest.fn(() => ({ get }));
    const collection = jest.fn(() => ({ where }));
    const batch = jest.fn(() => ({ update, commit }));
    const serverTimestamp = jest.fn(() => 'SERVER_TIMESTAMP');

    (globalThis as typeof globalThis & {
      __driverApplicationSyncMocks?: DriverApplicationSyncMockState;
    }).__driverApplicationSyncMocks = { get, update, commit, where, serverTimestamp };

    return Object.assign(jest.fn(() => ({ collection, batch })), {
      FieldValue: { serverTimestamp },
    });
  })(),
}));

import {
  buildDriverApplicationReviewUpdate,
  normalizeDriverApplicationEmail,
  syncDriverApplicationStatus,
} from '../driverApplicationSync.js';

const mockState = (globalThis as typeof globalThis & {
  __driverApplicationSyncMocks: DriverApplicationSyncMockState;
}).__driverApplicationSyncMocks;

describe('driver application synchronization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockState.commit.mockResolvedValue(undefined);
  });

  it('normalizes the driver email used to match legacy applications', () => {
    expect(normalizeDriverApplicationEmail('  Bilion@Example.COM ')).toBe('bilion@example.com');
    expect(normalizeDriverApplicationEmail(undefined)).toBe('');
  });

  it('builds an approval update without a rejection reason', () => {
    expect(buildDriverApplicationReviewUpdate({
      status: 'approved',
      driverId: 'driver-1',
      adminUid: 'admin-1',
    })).toEqual({
      status: 'approved',
      driverId: 'driver-1',
      reviewedBy: 'admin-1',
      rejectionReason: null,
    });
  });

  it('trims and stores the admin rejection reason', () => {
    expect(buildDriverApplicationReviewUpdate({
      status: 'rejected',
      driverId: 'driver-1',
      adminUid: 'admin-1',
      reason: '  Documents incomplets  ',
    })).toEqual({
      status: 'rejected',
      driverId: 'driver-1',
      reviewedBy: 'admin-1',
      rejectionReason: 'Documents incomplets',
    });
  });

  it('matches pending applications after normalizing legacy stored email', async () => {
    const matchingApplicationRef = {};
    mockState.get.mockResolvedValue({
      docs: [
        {
          ref: matchingApplicationRef,
          data: () => ({ email: ' Bilion@Example.COM ', status: 'pending_review' }),
        },
        {
          ref: {},
          data: () => ({ email: 'other@example.com', status: 'pending_review' }),
        },
      ],
    });

    const updatedCount = await syncDriverApplicationStatus({
      driverEmail: 'bilion@example.com',
      driverId: 'driver-1',
      adminUid: 'admin-1',
      status: 'approved',
    });

    expect(mockState.where).toHaveBeenCalledWith('status', '==', 'pending_review');
    expect(updatedCount).toBe(1);
    expect(mockState.update).toHaveBeenCalledWith(
      matchingApplicationRef,
      expect.objectContaining({ status: 'approved', driverId: 'driver-1' }),
    );
    expect(mockState.commit).toHaveBeenCalledTimes(1);
  });
});
