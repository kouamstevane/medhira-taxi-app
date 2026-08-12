import {
  buildParcelDriverTransfer,
  calculateParcelSettlement,
} from '../parcels/parcelSettlement.js';

describe('parcel settlement', () => {
  it('partage le prix en 70 % chauffeur et 30 % plateforme', () => {
    expect(calculateParcelSettlement(2200, 'FCFA')).toEqual({
      totalAmount: 2200,
      driverEarnings: 1540,
      platformFee: 660,
      currency: 'FCFA',
      stripeCurrency: 'xaf',
      totalAmountMinor: 2200,
      driverEarningsMinor: 1540,
      platformFeeMinor: 660,
    });
  });

  it('prépare un transfert Stripe XAF en unités entières', () => {
    const settlement = calculateParcelSettlement(2200, 'FCFA');

    expect(buildParcelDriverTransfer('parcel-1', 'driver-1', 'acct_driver', settlement)).toEqual({
      amount: 1540,
      currency: 'xaf',
      destination: 'acct_driver',
      transfer_group: 'parcel-1',
      description: 'Part chauffeur colis #parcel-1',
      metadata: {
        purpose: 'parcel_driver_earning',
        parcelId: 'parcel-1',
        driverId: 'driver-1',
        settlementVersion: 'parcel_split_v1',
      },
    });
  });

  it('convertit les devises décimales en unités Stripe', () => {
    expect(calculateParcelSettlement(17.5, 'CAD')).toMatchObject({
      driverEarnings: 12.25,
      platformFee: 5.25,
      driverEarningsMinor: 1225,
      platformFeeMinor: 525,
    });
  });
});
