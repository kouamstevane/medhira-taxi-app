import { buildVerifySmsRequest } from '../phoneAuth';

describe('Twilio Verify request', () => {
  it('does not use the unsupported custom friendly name override', () => {
    expect(buildVerifySmsRequest('+237682821031')).toEqual({
      to: '+237682821031',
      channel: 'sms',
      locale: 'en',
    });
  });
});
