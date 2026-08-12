const RECEIPT_CONFIRMATION_DELAY_MS = 24 * 60 * 60 * 1000;

export interface AutoConfirmationCandidate {
  status?: string;
  driverPaidOut?: boolean;
  deliveredAtMs?: number;
  updatedAtMs?: number;
}

export function isEligibleForAutoConfirmation(
  parcel: AutoConfirmationCandidate,
  nowMs: number,
): boolean {
  if (parcel.status !== 'delivered' || parcel.driverPaidOut === true) return false;

  const deliveredAtMs = parcel.deliveredAtMs ?? parcel.updatedAtMs;
  return (
    typeof deliveredAtMs === 'number' &&
    Number.isFinite(deliveredAtMs) &&
    deliveredAtMs > 0 &&
    nowMs - deliveredAtMs >= RECEIPT_CONFIRMATION_DELAY_MS
  );
}
