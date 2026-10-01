interface DriverSubmissionErrorLike {
  code?: string;
  message?: string;
}

export function getDriverSubmissionErrorMessage(
  error: DriverSubmissionErrorLike,
  t?: (key: string, params?: Record<string, string | number>) => string
): string {
  if (error.code === 'functions/resource-exhausted') {
    return t ? t('driver.submissionRateLimited') : 'Trop de tentatives de soumission. Veuillez réessayer dans 10 minutes.';
  }

  if (error.code === 'permission-denied' || error.code === 'functions/permission-denied') {
    return t ? t('driver.sessionExpiredResumeRegistration') : 'Session expirée. Veuillez vous reconnecter puis reprendre votre inscription.';
  }

  if (error.code === 'storage/unauthorized') {
    return t ? t('driver.fileUploadErrorRetry') : "Erreur lors de l'upload des fichiers. Veuillez réessayer.";
  }

  if (error.message) {
    return `${t ? t('common.error') : 'Erreur'} : ${error.message}`;
  }

  return t
    ? t('driver.submissionFailedRetryCleanup')
    : "Erreur lors de la soumission. Vos fichiers ont été supprimés. Veuillez réessayer - si l'erreur persiste, reconnectez-vous pour reprendre votre dossier.";
}
