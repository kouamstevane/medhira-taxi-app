import {
  buildDriverApplicationReviewUpdate,
  normalizeDriverApplicationEmail,
} from '../driverApplicationSync.js';

describe('driver application synchronization', () => {
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
});
