const DRIVER_INVITATION_ROUTE = '/auth/driver-invitation';

export function buildDriverInvitationDeepLink(invitationId: string): string {
  const params = new URLSearchParams({ invitationId });
  return `medjira://auth/driver-invitation?${params.toString()}`;
}

export function getDriverInvitationPathFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const isNativeDeepLink = parsed.protocol === 'medjira:'
      && parsed.hostname === 'auth'
      && parsed.pathname === '/driver-invitation';
    const isHttpsAppLink = parsed.protocol === 'https:'
      && parsed.pathname === DRIVER_INVITATION_ROUTE;
    if (!isNativeDeepLink && !isHttpsAppLink) {
      return null;
    }

    const invitationId = parsed.searchParams.get('invitationId');
    if (!invitationId) return null;

    return `${DRIVER_INVITATION_ROUTE}?${new URLSearchParams({ invitationId }).toString()}`;
  } catch {
    return null;
  }
}
