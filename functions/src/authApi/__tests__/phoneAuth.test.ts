import { HttpsError } from 'firebase-functions/v2/https';
import {
  handleStartPhoneVerification,
  handleVerifyPhoneCode,
} from '../phoneAuthCore';

function makeDeps() {
  return {
    createVerification: jest.fn<Promise<void>, [string]>(),
    checkVerification: jest.fn<Promise<'approved' | 'pending' | 'canceled'>, [string, string]>(),
    enforceRateLimit: jest.fn<Promise<void>, [unknown]>(),
    findPhoneIdentity: jest.fn<Promise<{ uid: string } | null>, [string]>(),
    createPhoneIdentity: jest.fn<Promise<{ uid: string }>, [string]>(),
    upsertClientUser: jest.fn<Promise<void>, [unknown]>(),
    createCustomToken: jest.fn<Promise<string>, [string, Record<string, unknown>]>(),
    now: jest.fn(() => new Date('2026-07-30T12:00:00.000Z')),
  };
}

describe('Twilio phone auth core', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('starts a Twilio verification for a normalized E.164 phone number', async () => {
    const deps = makeDeps();

    const result = await handleStartPhoneVerification(
      { phoneNumber: '+1 555 012 3456' },
      { ip: '203.0.113.10' },
      deps,
    );

    expect(result).toEqual({
      success: true,
      phoneNumber: '+15550123456',
      maskedPhone: '+1******3456',
      resendAfterSec: 60,
    });
    expect(deps.enforceRateLimit).toHaveBeenCalledTimes(2);
    expect(deps.createVerification).toHaveBeenCalledWith('+15550123456');
  });

  it('rejects unsupported phone formats before calling Twilio', async () => {
    const deps = makeDeps();

    await expect(
      handleStartPhoneVerification(
        { phoneNumber: '5550123456' },
        { ip: '203.0.113.10' },
        deps,
      ),
    ).rejects.toMatchObject({
      code: 'invalid-argument',
      message: 'Numéro de téléphone invalide.',
    });

    expect(deps.createVerification).not.toHaveBeenCalled();
  });

  it('verifies a Twilio code, creates a new client identity, and returns a custom token', async () => {
    const deps = makeDeps();
    deps.checkVerification.mockResolvedValue('approved');
    deps.findPhoneIdentity.mockResolvedValue(null);
    deps.createPhoneIdentity.mockResolvedValue({ uid: 'client_phone_123' });
    deps.createCustomToken.mockResolvedValue('firebase-custom-token');

    const result = await handleVerifyPhoneCode(
      {
        phoneNumber: '+237682821031',
        code: '123456',
        profile: {
          firstName: 'Jean',
          lastName: 'Dupont',
          country: 'CM',
        },
      },
      { ip: '203.0.113.10' },
      deps,
    );

    expect(result).toEqual({
      success: true,
      uid: 'client_phone_123',
      customToken: 'firebase-custom-token',
      isNewUser: true,
    });
    expect(deps.upsertClientUser).toHaveBeenCalledWith({
      uid: 'client_phone_123',
      phoneNumber: '+237682821031',
      profile: {
        firstName: 'Jean',
        lastName: 'Dupont',
        country: 'CM',
      },
      phoneVerifiedAt: new Date('2026-07-30T12:00:00.000Z'),
    });
    expect(deps.createCustomToken).toHaveBeenCalledWith('client_phone_123', {
      phone_verified: true,
      sign_in_provider: 'twilio_phone',
    });
  });

  it('accepts profile details with a single name', async () => {
    const deps = makeDeps();
    deps.checkVerification.mockResolvedValue('approved');
    deps.findPhoneIdentity.mockResolvedValue(null);
    deps.createPhoneIdentity.mockResolvedValue({ uid: 'client_phone_123' });
    deps.createCustomToken.mockResolvedValue('firebase-custom-token');

    await handleVerifyPhoneCode(
      {
        phoneNumber: '+237682821031',
        code: '123456',
        profile: {
          firstName: 'kameni',
          lastName: '',
          country: 'CM',
        },
      },
      { ip: '203.0.113.10' },
      deps,
    );

    expect(deps.upsertClientUser).toHaveBeenCalledWith({
      uid: 'client_phone_123',
      phoneNumber: '+237682821031',
      profile: {
        firstName: 'kameni',
        lastName: '',
        country: 'CM',
      },
      phoneVerifiedAt: new Date('2026-07-30T12:00:00.000Z'),
    });
  });

  it('verifies a Twilio code and creates a new phone identity without requiring profile details', async () => {
    const deps = makeDeps();
    deps.checkVerification.mockResolvedValue('approved');
    deps.findPhoneIdentity.mockResolvedValue(null);
    deps.createPhoneIdentity.mockResolvedValue({ uid: 'client_phone_123' });
    deps.createCustomToken.mockResolvedValue('firebase-custom-token');

    const result = await handleVerifyPhoneCode(
      {
        phoneNumber: '+237682821031',
        code: '123456',
      },
      { ip: '203.0.113.10' },
      deps,
    );

    expect(result).toEqual({
      success: true,
      uid: 'client_phone_123',
      customToken: 'firebase-custom-token',
      isNewUser: true,
    });
    expect(deps.createPhoneIdentity).toHaveBeenCalledWith('+237682821031');
    expect(deps.upsertClientUser).toHaveBeenCalledWith({
      uid: 'client_phone_123',
      phoneNumber: '+237682821031',
      profile: undefined,
      phoneVerifiedAt: new Date('2026-07-30T12:00:00.000Z'),
    });
  });

  it('verifies an existing phone identity without requiring profile details', async () => {
    const deps = makeDeps();
    deps.checkVerification.mockResolvedValue('approved');
    deps.findPhoneIdentity.mockResolvedValue({ uid: 'client_phone_123' });
    deps.createCustomToken.mockResolvedValue('firebase-custom-token');

    const result = await handleVerifyPhoneCode(
      {
        phoneNumber: '+237682821031',
        code: '123456',
      },
      { ip: '203.0.113.10' },
      deps,
    );

    expect(result).toEqual({
      success: true,
      uid: 'client_phone_123',
      customToken: 'firebase-custom-token',
      isNewUser: false,
    });
    expect(deps.createPhoneIdentity).not.toHaveBeenCalled();
    expect(deps.upsertClientUser).toHaveBeenCalledWith({
      uid: 'client_phone_123',
      phoneNumber: '+237682821031',
      profile: undefined,
      phoneVerifiedAt: new Date('2026-07-30T12:00:00.000Z'),
    });
  });

  it('rejects an incorrect Twilio code without creating a session', async () => {
    const deps = makeDeps();
    deps.checkVerification.mockResolvedValue('pending');

    await expect(
      handleVerifyPhoneCode(
        {
          phoneNumber: '+237682821031',
          code: '000000',
          profile: {
            firstName: 'Jean',
            lastName: 'Dupont',
          },
        },
        { ip: '203.0.113.10' },
        deps,
      ),
    ).rejects.toBeInstanceOf(HttpsError);

    expect(deps.findPhoneIdentity).not.toHaveBeenCalled();
    expect(deps.createCustomToken).not.toHaveBeenCalled();
  });
});
