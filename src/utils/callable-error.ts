type CallableErrorLike = {
  code?: unknown;
  message?: unknown;
};

const FALLBACK_MESSAGE = 'Une erreur est survenue. Réessayez dans un instant.';

export function getUserFacingCallableError(error: unknown, t?: (key: string) => string): string {
  const candidate = error as CallableErrorLike | null;
  const code = typeof candidate?.code === 'string' ? candidate.code : '';
  const message = typeof candidate?.message === 'string' ? candidate.message.trim() : '';

  if (code === 'functions/permission-denied' || code === 'permission-denied') {
    return t ? t('errors.unauthorized') : 'Vous n’êtes pas autorisé à effectuer cette action.';
  }
  if (code === 'functions/unavailable' || code === 'unavailable') {
    return t ? t('errors.serverError') : 'Le service est momentanément indisponible. Réessayez dans un instant.';
  }
  if (code === 'functions/unauthenticated' || code === 'unauthenticated') {
    return t ? t('errors.unauthorized') : 'Votre session a expiré. Connectez-vous à nouveau puis réessayez.';
  }
  if (message && !/^(internal|unknown|error)$/i.test(message)) return message;
  return t ? t('errors.generic') : FALLBACK_MESSAGE;
}
