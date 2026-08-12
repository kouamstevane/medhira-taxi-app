import { normalizeStripeCurrency } from '../parcels/parcelSettlement.js';

const DEFAULT_PAYOUT_CURRENCY = 'cad';

export function resolvePayoutCurrency(currency: unknown): string {
  if (typeof currency !== 'string' || currency.trim().length === 0) {
    return DEFAULT_PAYOUT_CURRENCY;
  }

  try {
    return normalizeStripeCurrency(currency);
  } catch {
    return DEFAULT_PAYOUT_CURRENCY;
  }
}
