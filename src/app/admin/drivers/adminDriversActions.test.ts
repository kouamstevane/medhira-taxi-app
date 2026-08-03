import { buildAdminDriverActionPayload } from './adminDriversActions';

describe('buildAdminDriverActionPayload', () => {
  it('omits an undefined reason so approve requests pass callable validation', () => {
    const payload = buildAdminDriverActionPayload('approve', 'ZASwGaH7fGdAwL4IrpWtujL14We2');

    expect(payload).toEqual({
      action: 'approve',
      driverId: 'ZASwGaH7fGdAwL4IrpWtujL14We2',
    });
    expect(Object.prototype.hasOwnProperty.call(payload, 'reason')).toBe(false);
  });

  it('omits a blank optional rejection reason', () => {
    expect(buildAdminDriverActionPayload('reject', 'driver-123', '   ')).toEqual({
      action: 'reject',
      driverId: 'driver-123',
    });
  });
});
