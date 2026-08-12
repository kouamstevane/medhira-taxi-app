import { DRIVER_SHARE_RATE } from '../config/stripe.js';

const SETTLEMENT_VERSION = 'parcel_split_v1';
const ZERO_DECIMAL_CURRENCIES = new Set([
  'bif',
  'clp',
  'gnf',
  'mga',
  'pyg',
  'rwf',
  'ugx',
  'vnd',
  'vuv',
  'xaf',
  'xof',
  'xpf',
]);

export interface ParcelSettlement {
  totalAmount: number;
  driverEarnings: number;
  platformFee: number;
  currency: string;
  stripeCurrency: string;
  totalAmountMinor: number;
  driverEarningsMinor: number;
  platformFeeMinor: number;
}

export interface ParcelDriverTransfer {
  amount: number;
  currency: string;
  destination: string;
  transfer_group: string;
  description: string;
  metadata: {
    purpose: 'parcel_driver_earning';
    parcelId: string;
    driverId: string;
    settlementVersion: string;
  };
}

function normalizeStripeCurrency(currency: string): string {
  const normalized = currency.trim().toLowerCase();
  if (normalized === 'fcfa') return 'xaf';
  if (normalized === 'cad' || normalized === 'eur' || normalized === 'xaf') return normalized;
  throw new Error(`Devise de colis non supportée: ${currency}`);
}

function toMinorAmount(amount: number, stripeCurrency: string): number {
  return ZERO_DECIMAL_CURRENCIES.has(stripeCurrency)
    ? Math.round(amount)
    : Math.round(amount * 100);
}

export function calculateParcelSettlement(price: number, currency: string): ParcelSettlement {
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error('Montant de colis invalide.');
  }

  const stripeCurrency = normalizeStripeCurrency(currency);
  const driverEarnings = Math.round(price * DRIVER_SHARE_RATE * 100) / 100;
  const platformFee = Math.round((price - driverEarnings) * 100) / 100;

  return {
    totalAmount: price,
    driverEarnings,
    platformFee,
    currency,
    stripeCurrency,
    totalAmountMinor: toMinorAmount(price, stripeCurrency),
    driverEarningsMinor: toMinorAmount(driverEarnings, stripeCurrency),
    platformFeeMinor: toMinorAmount(platformFee, stripeCurrency),
  };
}

export function buildParcelDriverTransfer(
  parcelId: string,
  driverId: string,
  destination: string,
  settlement: ParcelSettlement,
): ParcelDriverTransfer {
  return {
    amount: settlement.driverEarningsMinor,
    currency: settlement.stripeCurrency,
    destination,
    transfer_group: parcelId,
    description: `Part chauffeur colis #${parcelId}`,
    metadata: {
      purpose: 'parcel_driver_earning',
      parcelId,
      driverId,
      settlementVersion: SETTLEMENT_VERSION,
    },
  };
}

export { SETTLEMENT_VERSION, normalizeStripeCurrency, toMinorAmount };
