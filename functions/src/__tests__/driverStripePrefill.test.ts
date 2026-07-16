import { buildDriverIndividualPrefill } from '../stripe/driver-prefill';

describe('buildDriverIndividualPrefill', () => {
  it('prefills Stripe individual fields from Firebase driver and private data', () => {
    expect(buildDriverIndividualPrefill({
      tokenEmail: 'bilion2ok@gmail.com',
      country: 'CA',
      driverData: {
        driverType: 'chauffeur',
        firstName: 'Ste',
        lastName: 'Jgf',
        phone: '15245369852',
        city: 'Montreal',
        zipCode: 'H2X 1Y4',
      },
      privateData: {
        dob: '2000-04-30',
        address: '123 Rue Principale',
        province: 'Quebec',
      },
    })).toEqual({
      firstName: 'Ste',
      lastName: 'Jgf',
      rawPhone: '15245369852',
      phone: '+15245369852',
      dob: { day: 30, month: 4, year: 2000 },
      individual: {
        first_name: 'Ste',
        last_name: 'Jgf',
        phone: '+15245369852',
        dob: { day: 30, month: 4, year: 2000 },
        address: {
          line1: '123 Rue Principale',
          city: 'Montreal',
          postal_code: 'H2X 1Y4',
          state: 'Quebec',
          country: 'CA',
        },
        relationship: {
          title: 'Chauffeur professionnel',
        },
        email: 'bilion2ok@gmail.com',
      },
    });
  });

  it('prefers explicit request values over Firebase values', () => {
    expect(buildDriverIndividualPrefill({
      tokenEmail: 'driver@example.com',
      country: 'CA',
      requestIndividual: {
        firstName: 'New',
        lastName: 'Name',
        phone: '+15145551234',
        dob: '1998-01-05',
      },
      driverData: {
        firstName: 'Old',
        lastName: 'Driver',
        phone: '15245369852',
      },
      privateData: {
        dob: '2000-04-30',
      },
    })).toEqual({
      firstName: 'New',
      lastName: 'Name',
      rawPhone: '+15145551234',
      phone: '+15145551234',
      dob: { day: 5, month: 1, year: 1998 },
      individual: {
        first_name: 'New',
        last_name: 'Name',
        phone: '+15145551234',
        dob: { day: 5, month: 1, year: 1998 },
        email: 'driver@example.com',
      },
    });
  });

  it('keeps email and drops invalid optional values', () => {
    expect(buildDriverIndividualPrefill({
      tokenEmail: 'driver@example.com',
      country: 'CA',
      driverData: {
        firstName: 'Ste',
        phone: 'abc',
      },
      privateData: {
        dob: '2035-01-01',
      },
    })).toEqual({
      firstName: 'Ste',
      lastName: undefined,
      rawPhone: 'abc',
      phone: undefined,
      dob: null,
      individual: {
        first_name: 'Ste',
        email: 'driver@example.com',
      },
    });
  });
});
