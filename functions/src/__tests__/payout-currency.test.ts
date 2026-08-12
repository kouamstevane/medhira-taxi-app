import { resolvePayoutCurrency } from '../stripe/payoutCurrency.js';

describe('payout currency', () => {
  it('utilise XAF pour les gains FCFA', () => {
    expect(resolvePayoutCurrency('FCFA')).toBe('xaf');
  });

  it('conserve les devises Stripe ISO', () => {
    expect(resolvePayoutCurrency('cad')).toBe('cad');
    expect(resolvePayoutCurrency('EUR')).toBe('eur');
  });
});
