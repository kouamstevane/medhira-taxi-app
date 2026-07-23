import { buildDriverApplicationPublicData } from '../driverRegistrationPayload';

describe('driver registration payload', () => {
  it('omits private and empty optional fields from the public driver payload', () => {
    const payload = buildDriverApplicationPublicData({
      userId: 'driver-123',
      email: 'driver@test.com',
      driverType: 'chauffeur',
      vehicleType: 'voiture',
      defaultCityId: 'edmonton',
      step2Data: {
        firstName: 'Olive',
        lastName: 'Manick',
        phone: '+237682821031',
        city: 'Douala',
        zipCode: '',
      },
      step3Data: {
        productionYear: '2016',
        hasFourDoors: true,
      },
    });

    expect(payload).toEqual(expect.objectContaining({
      uid: 'driver-123',
      firstName: 'Olive',
      lastName: 'Manick',
      email: 'driver@test.com',
      phone: '+237682821031',
      driverType: 'chauffeur',
      vehicleType: 'voiture',
      cityId: 'edmonton',
      car: { year: '2016' },
    }));
    expect(payload).not.toHaveProperty('licenseNumber');
    expect(payload).not.toHaveProperty('zipCode');
  });
});
