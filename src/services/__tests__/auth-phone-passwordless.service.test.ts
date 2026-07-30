const mockCallable = jest.fn();

jest.mock('@/config/firebase', () => ({
  auth: { name: 'mock-auth' },
  functions: { region: 'europe-west1' },
}));

jest.mock('firebase/functions', () => ({
  httpsCallable: jest.fn(() => mockCallable),
}));

jest.mock('firebase/auth', () => ({
  signInWithCustomToken: jest.fn(),
}));

import { signInWithCustomToken } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import {
  startTwilioPhoneVerification,
  verifyTwilioPhoneCodeAndSignIn,
} from '@/services/auth.service';
import { auth, functions } from '@/config/firebase';

describe('Twilio phone passwordless auth service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('starts a Twilio phone verification through a Cloud Function', async () => {
    mockCallable.mockResolvedValue({
      data: {
        success: true,
        phoneNumber: '+15550123456',
        maskedPhone: '+1******3456',
        resendAfterSec: 60,
      },
    });

    const result = await startTwilioPhoneVerification('+15550123456');

    expect(httpsCallable).toHaveBeenCalledWith(functions, 'authStartPhoneVerification');
    expect(mockCallable).toHaveBeenCalledWith({ phoneNumber: '+15550123456' });
    expect(result.maskedPhone).toBe('+1******3456');
  });

  it('verifies a Twilio code and signs in with the returned Firebase custom token', async () => {
    const user = { uid: 'client_phone_123', phoneNumber: '+237682821031' };
    mockCallable.mockResolvedValue({
      data: {
        success: true,
        uid: 'client_phone_123',
        customToken: 'firebase-custom-token',
        isNewUser: true,
      },
    });
    (signInWithCustomToken as jest.Mock).mockResolvedValue({ user });

    const result = await verifyTwilioPhoneCodeAndSignIn({
      phoneNumber: '+237682821031',
      code: '123456',
      profile: {
        firstName: 'Jean',
        lastName: 'Dupont',
        country: 'CM',
      },
    });

    expect(httpsCallable).toHaveBeenCalledWith(functions, 'authVerifyPhoneCode');
    expect(mockCallable).toHaveBeenCalledWith({
      phoneNumber: '+237682821031',
      code: '123456',
      profile: {
        firstName: 'Jean',
        lastName: 'Dupont',
        country: 'CM',
      },
    });
    expect(signInWithCustomToken).toHaveBeenCalledWith(auth, 'firebase-custom-token');
    expect(result).toEqual({
      uid: 'client_phone_123',
      isNewUser: true,
      user,
    });
  });
});
