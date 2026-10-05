import { translate } from '@/locales';

interface DriverSubmissionErrorLike {
  code?: string;
  message?: string;
}

export function getDriverSubmissionErrorMessage(
  error: DriverSubmissionErrorLike,
  t: (key: string, params?: Record<string, string | number>) => string = translate
): string {
  if (error.code === 'functions/resource-exhausted') {
    return t('driver.submissionRateLimited');
  }

  if (error.code === 'permission-denied' || error.code === 'functions/permission-denied') {
    return t('driver.sessionExpiredResumeRegistration');
  }

  if (error.code === 'storage/unauthorized') {
    return t('driver.fileUploadErrorRetry');
  }

  if (error.message) {
    return `${t('common.error')} : ${error.message}`;
  }

  return t('driver.submissionFailedRetryCleanup');
}
