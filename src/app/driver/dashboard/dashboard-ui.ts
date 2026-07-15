export interface DriverDashboardQuickAction {
  icon: string;
  label: string;
  route: string;
  badge?: boolean;
}

export function getDriverDashboardNotificationState(unreadCount: number) {
  return {
    ariaLabel: unreadCount > 0 ? `Notifications (${unreadCount} non lues)` : 'Notifications',
    showUnreadDot: unreadCount > 0,
  };
}

export function getDriverDashboardQuickActions(hasDocumentIssue: boolean): DriverDashboardQuickAction[] {
  return [
    { icon: 'payments', label: 'Mes gains', route: '/driver/activite?tab=gains' },
    { icon: 'history', label: 'Historique', route: '/driver/activite?tab=historique' },
    { icon: 'description', label: 'Documents', route: '/driver/documents', badge: hasDocumentIssue },
    { icon: 'person', label: 'Mon profil', route: '/driver/profile' },
  ];
}

interface DriverAvailabilityCardOptions {
  isAvailable: boolean;
  isUpdating?: boolean;
  isApproved: boolean;
  hasLocation: boolean;
}

export function getDriverAvailabilityCardState({
  isAvailable,
  isUpdating = false,
  isApproved,
  hasLocation,
}: DriverAvailabilityCardOptions) {
  if (isUpdating) {
    return {
      statusLabel: isAvailable ? 'Disponible' : 'Hors ligne',
      statusDetail: 'Mise à jour',
      description: 'Changement en cours...',
      actionLabel: '...',
      actionAriaLabel: 'Disponibilité en cours de mise à jour',
    };
  }

  if (isAvailable && !isApproved) {
    return {
      statusLabel: 'Disponible',
      statusDetail: 'Non visible',
      description: 'Compte en attente d’approbation',
      actionLabel: 'Passer hors ligne',
      actionAriaLabel: 'Passer hors ligne',
    };
  }

  if (isAvailable && !hasLocation) {
    return {
      statusLabel: 'Disponible',
      statusDetail: 'Non visible',
      description: 'Position introuvable',
      actionLabel: 'Passer hors ligne',
      actionAriaLabel: 'Passer hors ligne',
    };
  }

  return isAvailable
    ? {
        statusLabel: 'Disponible',
        statusDetail: 'En attente',
        description: 'Visible par les clients',
        actionLabel: 'Passer hors ligne',
        actionAriaLabel: 'Passer hors ligne',
      }
    : {
        statusLabel: 'Hors ligne',
        statusDetail: 'Inactif',
        description: 'Activez pour recevoir des demandes',
        actionLabel: 'Passer en ligne',
        actionAriaLabel: 'Passer en ligne',
      };
}
