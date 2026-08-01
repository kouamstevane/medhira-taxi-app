const resendSend = jest.fn();

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: resendSend },
  })),
}));

import { sendDriverApplicationNotification } from '../../email-service';

describe('driver application notification email', () => {
  beforeEach(() => {
    resendSend.mockResolvedValue({ data: { id: 'email-123' }, error: null });
  });

  test('contains only the candidate email and CV attachment when optional data is absent', async () => {
    await sendDriverApplicationNotification({
      to: 'medjiraservices@gmail.com',
      applicationId: 'application-456',
      email: 'jean@example.com',
      fileName: 'cv-jean.pdf',
      cvBuffer: Buffer.from('cv'),
      apiKey: 're_test_key',
    });

    const payload = resendSend.mock.calls[0][0];
    expect(payload.subject).toBe('Nouvelle candidature Chauffeur / Livreur');
    expect(payload.text).toContain('Email : jean@example.com');
    expect(payload.text).not.toContain('undefined');
    expect(payload.text).not.toContain('À relever');
    expect(payload.text).not.toContain('Référence');
    expect(payload.text).not.toContain('pending_review');
    expect(payload.html).not.toContain('undefined');
    expect(payload.html).not.toContain('Référence');
    expect(payload.attachments).toHaveLength(1);
  });
});
