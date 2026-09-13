export type HistoryTone = 'warning' | 'info' | 'active' | 'success' | 'danger' | 'neutral';

export interface HistoryTypePresentation {
  label: string;
  icon: string;
}

export interface HistoryStatusPresentation {
  label: string;
  description: string;
  tone: HistoryTone;
}

export interface HistoryAction {
  label: string;
  icon: string;
}

type TranslateFn = (key: string) => string;

export function getHistoryTypePresentation(type?: string, t?: TranslateFn): HistoryTypePresentation {
  if (type === 'Taxi') {
    return { label: t ? t('history.types.taxi') : 'Course taxi', icon: 'directions_car' };
  }

  if (type === 'Livraison') {
    return { label: t ? t('history.types.parcel') : 'Livraison de colis', icon: 'delivery_dining' };
  }

  return { label: t ? t('history.types.order') : 'Commande', icon: 'receipt_long' };
}

export function getHistoryStatusPresentation(
  type: string | undefined,
  status: string,
  t?: TranslateFn,
): HistoryStatusPresentation {
  const isParcel = type === 'Livraison';

  const descriptions: Record<string, string> = {
    pending: isParcel
      ? (t ? t('history.statusDescriptions.pendingParcel') : 'Nous recherchons un chauffeur pour votre livraison.')
      : (t ? t('history.statusDescriptions.pendingTaxi') : 'Nous recherchons un chauffeur pour votre course.'),
    accepted: isParcel
      ? (t ? t('history.statusDescriptions.acceptedParcel') : 'Un chauffeur a accepté votre livraison.')
      : (t ? t('history.statusDescriptions.acceptedTaxi') : 'Un chauffeur a accepté votre course.'),
    in_progress: isParcel
      ? (t ? t('history.statusDescriptions.inProgressParcel') : 'Votre chauffeur effectue actuellement la livraison.')
      : (t ? t('history.statusDescriptions.inProgressTaxi') : 'Votre course est actuellement en cours.'),
    in_transit: t ? t('history.statusDescriptions.inTransit') : 'Votre colis est en route vers sa destination.',
    delivered: t ? t('history.statusDescriptions.delivered') : 'Votre colis a été remis au destinataire.',
    completed: isParcel
      ? (t ? t('history.statusDescriptions.completedParcel') : 'Votre livraison est terminée.')
      : (t ? t('history.statusDescriptions.completedTaxi') : 'Votre course est terminée.'),
    cancelled: isParcel
      ? (t ? t('history.statusDescriptions.cancelledParcel') : 'Cette livraison a été annulée.')
      : (t ? t('history.statusDescriptions.cancelledTaxi') : 'Cette course a été annulée.'),
    failed: isParcel
      ? (t ? t('history.statusDescriptions.failedParcel') : 'Cette livraison n’a pas pu être réalisée.')
      : (t ? t('history.statusDescriptions.failedTaxi') : 'Cette course n’a pas pu être réalisée.'),
  };

  const labels: Record<string, string> = {
    pending: t ? t('history.statuses.pending') : 'En attente d’un chauffeur',
    accepted: isParcel
      ? (t ? t('history.statuses.acceptedParcel') : 'Chauffeur trouvé')
      : (t ? t('history.statuses.acceptedTaxi') : 'Course acceptée'),
    in_progress: t ? t('history.statuses.inProgress') : 'En cours',
    in_transit: t ? t('history.statuses.inTransit') : 'En livraison',
    delivered: t ? t('history.statuses.delivered') : 'Livré',
    completed: isParcel
      ? (t ? t('history.statuses.completedParcel') : 'Livraison terminée')
      : (t ? t('history.statuses.completedTaxi') : 'Course terminée'),
    cancelled: t ? t('history.statuses.cancelled') : 'Annulée',
    failed: t ? t('history.statuses.failed') : 'Échec',
  };

  const tones: Record<string, HistoryTone> = {
    pending: 'warning',
    accepted: 'info',
    in_progress: 'active',
    in_transit: 'active',
    delivered: 'success',
    completed: 'success',
    cancelled: 'danger',
    failed: 'danger',
  };

  return {
    label: labels[status] || (t ? t('history.statuses.unknown') : 'Statut inconnu'),
    description: descriptions[status] || (t ? t('history.statusDescriptions.default') : 'Les informations de cette commande sont en cours de mise à jour.'),
    tone: tones[status] || 'neutral',
  };
}

export function getHistoryAction(type: string | undefined, status: string, t?: TranslateFn): HistoryAction | null {
  if (type === 'Livraison') {
    if (['pending', 'accepted', 'in_transit', 'in_progress'].includes(status)) {
      return { label: t ? t('history.actions.trackDelivery') : 'Suivre la livraison', icon: 'my_location' };
    }

    if (['delivered', 'completed'].includes(status)) {
      return { label: t ? t('history.actions.viewDetails') : 'Voir le détail', icon: 'receipt_long' };
    }

    return null;
  }

  if (status === 'completed') {
    return { label: t ? t('history.actions.downloadInvoice') : 'Télécharger la facture PDF', icon: 'download' };
  }

  return null;
}
