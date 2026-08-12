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

export function getHistoryTypePresentation(type?: string): HistoryTypePresentation {
  if (type === 'Taxi') {
    return { label: 'Course taxi', icon: 'directions_car' };
  }

  if (type === 'Livraison') {
    return { label: 'Livraison de colis', icon: 'delivery_dining' };
  }

  return { label: 'Commande', icon: 'receipt_long' };
}

export function getHistoryStatusPresentation(
  type: string | undefined,
  status: string,
): HistoryStatusPresentation {
  const isParcel = type === 'Livraison';
  const descriptions: Record<string, string> = {
    pending: isParcel
      ? 'Nous recherchons un chauffeur pour votre livraison.'
      : 'Nous recherchons un chauffeur pour votre course.',
    accepted: isParcel
      ? 'Un chauffeur a accepté votre livraison.'
      : 'Un chauffeur a accepté votre course.',
    in_progress: isParcel
      ? 'Votre chauffeur effectue actuellement la livraison.'
      : 'Votre course est actuellement en cours.',
    in_transit: 'Votre colis est en route vers sa destination.',
    delivered: 'Votre colis a été remis au destinataire.',
    completed: isParcel ? 'Votre livraison est terminée.' : 'Votre course est terminée.',
    cancelled: isParcel ? 'Cette livraison a été annulée.' : 'Cette course a été annulée.',
    failed: isParcel ? 'Cette livraison n’a pas pu être réalisée.' : 'Cette course n’a pas pu être réalisée.',
  };

  const labels: Record<string, string> = {
    pending: 'En attente d’un chauffeur',
    accepted: isParcel ? 'Chauffeur trouvé' : 'Course acceptée',
    in_progress: 'En cours',
    in_transit: 'En livraison',
    delivered: 'Livré',
    completed: isParcel ? 'Livraison terminée' : 'Course terminée',
    cancelled: 'Annulée',
    failed: 'Échec',
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
    label: labels[status] || 'Statut inconnu',
    description: descriptions[status] || 'Les informations de cette commande sont en cours de mise à jour.',
    tone: tones[status] || 'neutral',
  };
}

export function getHistoryAction(type: string | undefined, status: string): HistoryAction | null {
  if (type === 'Livraison') {
    if (['pending', 'accepted', 'in_transit', 'in_progress'].includes(status)) {
      return { label: 'Suivre la livraison', icon: 'my_location' };
    }

    if (['delivered', 'completed'].includes(status)) {
      return { label: 'Voir le détail', icon: 'receipt_long' };
    }

    return null;
  }

  if (status === 'completed') {
    return { label: 'Télécharger la facture PDF', icon: 'download' };
  }

  return null;
}
