import {
  getAuthenticatedUser,
  getStripeSetupReturn,
  getStripeSetupReturnError,
} from './setup-payment-flow';

describe('setup payment flow', () => {
  it('waits for Firebase to finish restoring the session before reading the user', async () => {
    let resolveReady!: () => void;
    const auth = {
      currentUser: null,
      authStateReady: jest.fn(
        () => new Promise<void>((resolve) => {
          resolveReady = resolve;
        }),
      ),
    };

    const userPromise = getAuthenticatedUser(auth);

    expect(auth.authStateReady).toHaveBeenCalledTimes(1);

    auth.currentUser = { uid: 'user-1' } as never;
    resolveReady();

    await expect(userPromise).resolves.toEqual({ uid: 'user-1' });
  });

  it('reads a successful Stripe SetupIntent return from the URL', () => {
    expect(getStripeSetupReturn(
      '?setup_intent=seti_123&setup_intent_client_secret=secret_123&redirect_status=succeeded',
    )).toEqual({
      clientSecret: 'secret_123',
      status: 'succeeded',
    });
  });

  it('returns an error for a failed Stripe SetupIntent return', () => {
    const stripeReturn = getStripeSetupReturn(
      '?setup_intent=seti_123&setup_intent_client_secret=secret_123&redirect_status=failed',
    );

    expect(getStripeSetupReturnError(stripeReturn?.status ?? null)).toBe(
      'La configuration de votre carte a échoué. Vérifiez les informations et réessayez.',
    );
  });

  it('does not return an error for a successful Stripe SetupIntent return', () => {
    expect(getStripeSetupReturnError('succeeded')).toBeNull();
  });
});
