import {
  buildDriverInvitationDeepLink,
  getDriverInvitationPathFromUrl,
} from './driver-invitation-links';

describe('driver invitation deep links', () => {
  it('builds a native app link with the invitation id', () => {
    expect(buildDriverInvitationDeepLink('invite/123')).toBe(
      'medjira://auth/driver-invitation?invitationId=invite%2F123',
    );
  });

  it('turns a native app URL into the in-app route', () => {
    expect(getDriverInvitationPathFromUrl(
      'medjira://auth/driver-invitation?invitationId=invite-123',
    )).toBe('/auth/driver-invitation?invitationId=invite-123');
  });

  it('turns the HTTPS email app link into the in-app route', () => {
    expect(getDriverInvitationPathFromUrl(
      'https://medjira-service.web.app/auth/driver-invitation?invitationId=invite-123',
    )).toBe('/auth/driver-invitation?invitationId=invite-123');
  });

  it('ignores unrelated app URLs', () => {
    expect(getDriverInvitationPathFromUrl('medjira://stripe-return?onboarding=success')).toBeNull();
  });
});
