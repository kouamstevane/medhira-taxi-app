import { buildDriverInvitationUrl } from '../email-service.js';

describe('driver invitation email link', () => {
  it('uses the canonical app host when no deployment override is configured', () => {
    expect(buildDriverInvitationUrl('invite-123')).toBe(
      'https://medjira-service.web.app/auth/driver-invitation?invitationId=invite-123',
    );
  });

  it('preserves an explicitly configured app base URL', () => {
    expect(buildDriverInvitationUrl('invite/123', 'https://app.example.com/')).toBe(
      'https://app.example.com/auth/driver-invitation?invitationId=invite%2F123',
    );
  });
});
