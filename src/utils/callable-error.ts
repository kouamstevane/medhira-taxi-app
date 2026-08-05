type CallableErrorLike = {
  code?: unknown;
  message?: unknown;
};

const FALLBACK_MESSAGE = 'Une erreur est survenue. Réessayez dans un instant.';

export function getUserFacingCallableError(error: unknown): string {
  const candidate = error as CallableErrorLike | null;
  const code = typeof candidate?.code === 'string' ? candidate.code : '';
  const message = typeof candidate?.message === 'string' ? candidate.message.trim() : '';

  if (code === 'functions/permission-denied' || code === 'permission-denied') {
    return 'Vous n’êtes pas autorisé à effectuer cette action.';
  }
  if (code === 'functions/unavailable' || code === 'unavailable') {
    return 'Le service est momentanément indisponible. Réessayez dans un instant.';
  }
  if (code === 'functions/unauthenticated' || code === 'unauthenticated') {
    return 'Votre session a expiré. Connectez-vous à nouveau puis réessayez.';
  }
  if (message && !/^(internal|unknown|error)$/i.test(message)) return message;
  return FALLBACK_MESSAGE;
}
