import { getStripeReturnPathFromUrl } from './stripe-return-links';

describe('Stripe return deep links', () => {
  it('turns a native restaurant return URL into the payments route', () => {
    expect(getStripeReturnPathFromUrl(
      'medjira://stripe-return?role=restaurant&status=success',
    )).toBe('/restaurant/onboarding/payments?onboarding=success');
  });

  it('turns a native driver return URL into the payments route', () => {
    expect(getStripeReturnPathFromUrl(
      'medjira://stripe-return?role=driver&status=refresh',
    )).toBe('/driver/payments/setup?onboarding=refresh');
  });

  it('ignores unrelated URLs and invalid statuses', () => {
    expect(getStripeReturnPathFromUrl('medjira://auth/driver-invitation?invitationId=invite-123')).toBeNull();
    expect(getStripeReturnPathFromUrl('medjira://stripe-return?role=restaurant&status=unknown')).toBeNull();
  });
});
