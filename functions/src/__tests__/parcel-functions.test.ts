import { isEligibleForAutoConfirmation } from '../parcels/parcelLifecycle.js';

describe('parcel auto-confirmation eligibility', () => {
  const nowMs = 48 * 60 * 60 * 1000;

  it('includes legacy delivered parcels when driverPaidOut is missing', () => {
    expect(
      isEligibleForAutoConfirmation(
        { status: 'delivered', updatedAtMs: 24 * 60 * 60 * 1000 },
        nowMs,
      ),
    ).toBe(true);
  });

  it('does not auto-confirm a delivered parcel without a reliable timestamp', () => {
    expect(
      isEligibleForAutoConfirmation({ status: 'delivered' }, nowMs),
    ).toBe(false);
  });

  it('does not auto-confirm parcels already paid out or not yet delivered', () => {
    expect(
      isEligibleForAutoConfirmation(
        { status: 'delivered', driverPaidOut: true, updatedAtMs: 0 },
        nowMs,
      ),
    ).toBe(false);
    expect(
      isEligibleForAutoConfirmation(
        { status: 'accepted', updatedAtMs: 0 },
        nowMs,
      ),
    ).toBe(false);
  });
});
