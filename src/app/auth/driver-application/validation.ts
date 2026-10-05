import { translate } from '@/locales';

export type DriverApplicationValidationMessage = {
  type: 'error';
  text: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function getDriverApplicationSuccessMessage(t: (key: string) => string = translate): string {
  return t('auth.driverApplicationSuccess');
}

export function validateDriverApplicationForm(email: string, cv: File | null, t: (key: string) => string = translate): DriverApplicationValidationMessage | null {
  if (!email.trim() && !cv) {
    return { type: 'error', text: t('auth.emailAndCvRequired') };
  }
  if (!email.trim()) {
    return { type: 'error', text: t('auth.emailRequiredPrompt') };
  }
  if (!EMAIL_PATTERN.test(email.trim())) {
    return { type: 'error', text: t('auth.validEmailRequired') };
  }
  if (!cv) {
    return { type: 'error', text: t('auth.cvRequired') };
  }
  return null;
}

export function getDriverApplicationErrorMessage(error: unknown, t: (key: string) => string = translate): string {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : '';

  if (code === 'auth/admin-restricted-operation' || code === 'auth/operation-not-allowed') {
    return t('auth.driverApplicationServiceUnavailable');
  }

  if (error instanceof Error && error.message) return error.message;
  return t('auth.driverApplicationSubmitError');
}
