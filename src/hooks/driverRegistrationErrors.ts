interface DriverSubmissionErrorLike {
  code?: string;
  message?: string;
}

export function getDriverSubmissionErrorMessage(error: DriverSubmissionErrorLike): string {
  if (error.code === 'functions/resource-exhausted') {
    return 'Trop de tentatives de soumission. Veuillez réessayer dans 10 minutes.';
  }

  if (error.code === 'permission-denied') {
    return 'Session expirée. Veuillez vous reconnecter puis reprendre votre inscription.';
  }

  if (error.code === 'storage/unauthorized') {
    return "Erreur lors de l'upload des fichiers. Veuillez réessayer.";
  }

  if (error.message) {
    return `Erreur : ${error.message}`;
  }

  return "Erreur lors de la soumission. Vos fichiers ont été supprimés. Veuillez réessayer - si l'erreur persiste, reconnectez-vous pour reprendre votre dossier.";
}
