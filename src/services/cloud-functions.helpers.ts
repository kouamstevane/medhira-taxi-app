export interface MappedError {
  message: string;
  code: string;
}

export function mapHttpsError(error: unknown): MappedError {
  const err = error as { code?: string; message?: string; details?: unknown };

  if (!err.code) {
    return { message: 'Erreur inattendue. Veuillez réessayer.', code: 'unknown' };
  }

  switch (err.code) {
    case 'unauthenticated':
    case 'permission-denied':
      return { message: 'Session expirée. Reconnectez-vous.', code: err.code };
    case 'invalid-argument':
      return { message: 'Données invalides : vérifiez les champs marqués.', code: err.code };
    case 'failed-precondition':
      return { message: err.message || 'Précondition non remplie.', code: err.code };
    case 'already-exists':
      return { message: 'Vous avez déjà soumis votre dossier.', code: err.code };
    case 'resource-exhausted':
      return { message: 'Trop de tentatives. Réessayez dans quelques minutes.', code: err.code };
    case 'not-found':
      return { message: 'Élément introuvable.', code: err.code };
    case 'internal':
      return { message: 'Erreur technique. Réessayez ou contactez le support.', code: err.code };
    default:
      return { message: err.message || 'Erreur inconnue.', code: err.code };
  }
}
