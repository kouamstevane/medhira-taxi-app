export const DEFAULT_DRIVER_REJECTION_REASON =
  'Documents incomplets ou non conformes aux critères de la plateforme.';

export function getDriverRejectionReason(reason?: string): string {
  return reason?.trim() || DEFAULT_DRIVER_REJECTION_REASON;
}
