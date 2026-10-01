export type DriverApplicationValidationMessage = {
  type: 'error';
  text: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function getDriverApplicationSuccessMessage(t?: (key: string) => string): string {
  if (t) return t('auth.driverApplicationSuccess');
  return 'Votre candidature a bien été enregistrée. Notre équipe va l’étudier et vous contactera par e-mail si votre profil est retenu.';
}

export function validateDriverApplicationForm(email: string, cv: File | null, t?: (key: string) => string): DriverApplicationValidationMessage | null {
  if (!email.trim() && !cv) {
    return { type: 'error', text: t ? t('auth.emailAndCvRequired') : 'Renseignez votre adresse e-mail et joignez votre CV.' };
  }
  if (!email.trim()) {
    return { type: 'error', text: t ? t('auth.emailRequiredPrompt') : 'Renseignez votre adresse e-mail.' };
  }
  if (!EMAIL_PATTERN.test(email.trim())) {
    return { type: 'error', text: t ? t('auth.validEmailRequired') : 'Renseignez une adresse e-mail valide.' };
  }
  if (!cv) {
    return { type: 'error', text: t ? t('auth.cvRequired') : 'Joignez votre CV au format PDF ou DOCX.' };
  }
  return null;
}

export function getDriverApplicationErrorMessage(error: unknown, t?: (key: string) => string): string {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : '';

  if (code === 'auth/admin-restricted-operation' || code === 'auth/operation-not-allowed') {
    return t ? t('auth.driverApplicationServiceUnavailable') : 'Le service de candidature est temporairement indisponible. Activez la connexion anonyme dans Firebase, puis réessayez.';
  }

  if (error instanceof Error && error.message) return error.message;
  return t ? t('auth.driverApplicationSubmitError') : 'Impossible d’envoyer votre candidature. Réessayez ou utilisez l’envoi par e-mail.';
}
