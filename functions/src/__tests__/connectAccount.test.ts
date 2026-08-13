import {
  buildConnectAccountParams,
  buildBusinessProfile,
} from '../stripe/connect-account.js';

describe('Connect account builders', () => {
  it('builds a restaurant account with its business information prefilled', () => {
    const params = buildConnectAccountParams({
      role: 'restaurant',
      country: 'CA',
      email: 'owner@example.com',
      metadata: { accountType: 'restaurant', restaurantId: 'rest-1' },
      businessProfile: buildBusinessProfile({
        role: 'restaurant',
        country: 'CA',
        name: 'Restaurant Chez Nous',
        productDescription: 'Restaurant familial et traiteur.',
        supportEmail: 'contact@cheznous.ca',
        supportPhone: '514 555 0101',
      }),
    });

    expect(params).toEqual(expect.objectContaining({
      type: 'express',
      country: 'CA',
      email: 'owner@example.com',
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      business_profile: expect.objectContaining({
        name: 'Restaurant Chez Nous',
        product_description: 'Restaurant familial et traiteur.',
        support_email: 'contact@cheznous.ca',
        support_phone: '+15145550101',
      }),
    }));
  });

  it('keeps driver accounts on the platform-controlled configuration', () => {
    const params = buildConnectAccountParams({
      role: 'driver',
      country: 'CA',
      email: 'driver@example.com',
      individual: {
        email: 'driver@example.com',
        first_name: 'Jean',
      },
      businessProfile: buildBusinessProfile({ role: 'driver', country: 'CA' }),
      metadata: { accountType: 'driver', driverId: 'driver-1' },
    });

    expect(params).toEqual(expect.objectContaining({
      country: 'CA',
      business_type: 'individual',
      individual: {
        email: 'driver@example.com',
        first_name: 'Jean',
      },
      controller: {
        stripe_dashboard: { type: 'none' },
        fees: { payer: 'application' },
        losses: { payments: 'application' },
        requirement_collection: 'application',
      },
      capabilities: { transfers: { requested: true } },
    }));
    expect(params).not.toHaveProperty('type');
  });
});
