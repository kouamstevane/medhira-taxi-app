import { translate } from '@/locales';

export interface MappedError {
  message: string;
  code: string;
}

export function mapHttpsError(error: unknown): MappedError {
  const err = error as { code?: string; message?: string; details?: unknown };

  if (!err.code) {
    return { message: translate('serviceMessages.cloudFunctions.unexpected'), code: 'unknown' };
  }

  switch (err.code) {
    case 'unauthenticated':
    case 'permission-denied':
      return { message: translate('serviceMessages.cloudFunctions.sessionExpired'), code: err.code };
    case 'invalid-argument':
      return { message: translate('serviceMessages.cloudFunctions.invalidData'), code: err.code };
    case 'failed-precondition':
      return { message: err.message || translate('serviceMessages.cloudFunctions.preconditionFailed'), code: err.code };
    case 'already-exists':
      return { message: translate('serviceMessages.cloudFunctions.alreadySubmitted'), code: err.code };
    case 'resource-exhausted':
      return { message: translate('serviceMessages.cloudFunctions.tooManyAttempts'), code: err.code };
    case 'not-found':
      return { message: translate('serviceMessages.cloudFunctions.notFound'), code: err.code };
    case 'internal':
      return { message: translate('serviceMessages.cloudFunctions.technical'), code: err.code };
    case 'auth/unauthorized-domain':
      return { message: translate('serviceMessages.cloudFunctions.domainUnavailable'), code: err.code };
    default:
      return { message: err.message || translate('serviceMessages.cloudFunctions.unknown'), code: err.code };
  }
}
