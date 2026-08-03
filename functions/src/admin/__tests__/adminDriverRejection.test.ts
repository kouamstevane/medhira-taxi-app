import { DEFAULT_DRIVER_REJECTION_REASON, getDriverRejectionReason } from '../adminDriverRejection.js';

describe('getDriverRejectionReason', () => {
  it('keeps the admin reason after trimming whitespace', () => {
    expect(getDriverRejectionReason('  Photo illisible  ')).toBe('Photo illisible');
  });

  it('provides a driver-facing fallback when no reason is entered', () => {
    expect(getDriverRejectionReason('')).toBe(DEFAULT_DRIVER_REJECTION_REASON);
    expect(getDriverRejectionReason(undefined)).toBe(DEFAULT_DRIVER_REJECTION_REASON);
  });
});
