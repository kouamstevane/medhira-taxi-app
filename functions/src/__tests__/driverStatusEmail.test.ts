const resendSend = jest.fn();

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: resendSend },
  })),
}));

import { sendDriverStatusEmail } from '../email-service.js';

describe('driver status email links', () => {
  beforeEach(() => {
    resendSend.mockResolvedValue({ data: { id: 'email-123' }, error: null });
  });

  afterEach(() => {
    resendSend.mockClear();
  });

  it.each(['approval', 'reactivation'] as const)(
    'uses the verified app link host for %s emails',
    async (type) => {
      await sendDriverStatusEmail({
        to: 'driver@example.com',
        driverName: 'Billion Mani',
        type,
        apiKey: 're_test_key',
      });

      const payload = resendSend.mock.calls[0][0];
      expect(payload.html).toContain('https://medjira-service.web.app/driver/login');
      expect(payload.html).not.toContain('https://medjira.com/driver/login');
    },
  );
});
