export type DriverApplicationValidationMessage = {
  type: 'error';
  text: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateDriverApplicationForm(email: string, cv: File | null): DriverApplicationValidationMessage | null {
  if (!email.trim() && !cv) {
    return { type: 'error', text: 'Renseignez votre adresse e-mail et joignez votre CV.' };
  }
  if (!email.trim()) {
    return { type: 'error', text: 'Renseignez votre adresse e-mail.' };
  }
  if (!EMAIL_PATTERN.test(email.trim())) {
    return { type: 'error', text: 'Renseignez une adresse e-mail valide.' };
  }
  if (!cv) {
    return { type: 'error', text: 'Joignez votre CV au format PDF ou DOCX.' };
  }
  return null;
}

export function getDriverApplicationErrorMessage(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : '';

  if (code === 'auth/admin-restricted-operation' || code === 'auth/operation-not-allowed') {
    return 'Le service de candidature est temporairement indisponible. Activez la connexion anonyme dans Firebase, puis réessayez.';
  }

  if (error instanceof Error && error.message) return error.message;
  return 'Impossible d’envoyer votre candidature. Réessayez ou utilisez l’envoi par e-mail.';
}
