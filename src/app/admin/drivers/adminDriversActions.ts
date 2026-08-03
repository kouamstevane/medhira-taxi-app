export interface AdminDriverActionPayload {
  action: string;
  driverId: string;
  reason?: string;
}

export function buildAdminDriverActionPayload(
  action: string,
  driverId: string,
  reason?: string,
): AdminDriverActionPayload {
  const payload: AdminDriverActionPayload = { action, driverId };

  if (reason !== undefined) {
    payload.reason = reason;
  }

  return payload;
}
