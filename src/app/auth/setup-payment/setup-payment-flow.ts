import type { User } from 'firebase/auth';
import { translate } from '@/locales';

export interface AuthStateReader {
  currentUser: User | null;
  authStateReady(): Promise<void>;
}

export async function getAuthenticatedUser(auth: AuthStateReader): Promise<User | null> {
  await auth.authStateReady();
  return auth.currentUser;
}

export function getStripeSetupReturn(search: string): {
  clientSecret: string | null;
  status: string | null;
} | null {
  const params = new URLSearchParams(search);
  const clientSecret = params.get('setup_intent_client_secret');
  const status = params.get('redirect_status');

  if (!clientSecret && !status) return null;

  return { clientSecret, status };
}

export function getStripeSetupReturnError(status: string | null): string | null {
  if (!status || status === 'succeeded') return null;

  if (status === 'failed') {
    return translate('screens.setupPayment.setupFailed');
  }

  return translate('screens.setupPayment.setupIncomplete');
}
