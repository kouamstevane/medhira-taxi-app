import { translate } from '@/locales';

type CallableErrorLike = {
  code?: unknown;
  message?: unknown;
};

export function getUserFacingCallableError(error: unknown, t?: (key: string) => string): string {
  const candidate = error as CallableErrorLike | null;
  const code = typeof candidate?.code === 'string' ? candidate.code : '';
  const message = typeof candidate?.message === 'string' ? candidate.message.trim() : '';

  if (code === 'functions/permission-denied' || code === 'permission-denied') {
    return t ? t('errors.unauthorized') : translate('systemMessages.callable.permissionDenied');
  }
  if (code === 'functions/unavailable' || code === 'unavailable') {
    return t ? t('errors.serverError') : translate('systemMessages.callable.unavailable');
  }
  if (code === 'functions/unauthenticated' || code === 'unauthenticated') {
    return t ? t('errors.unauthorized') : translate('systemMessages.callable.sessionExpired');
  }
  if (message && !/^(internal|unknown|error)$/i.test(message)) return message;
  return t ? t('errors.generic') : translate('systemMessages.callable.fallback');
}
