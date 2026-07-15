import {
  getDriverAvailabilityCardState,
  getDriverDashboardNotificationState,
  getDriverDashboardQuickActions,
} from '../dashboard-ui';

describe('driver dashboard UI helpers', () => {
  it('shows the notification dot only when notifications are unread', () => {
    expect(getDriverDashboardNotificationState(0)).toEqual({
      ariaLabel: 'Notifications',
      showUnreadDot: false,
    });

    expect(getDriverDashboardNotificationState(2)).toEqual({
      ariaLabel: 'Notifications (2 non lues)',
      showUnreadDot: true,
    });
  });

  it('opens gains and history on the matching activity tabs', () => {
    const actions = getDriverDashboardQuickActions(false);

    expect(actions).toEqual([
      { icon: 'payments', label: 'Mes gains', route: '/driver/activite?tab=gains' },
      { icon: 'history', label: 'Historique', route: '/driver/activite?tab=historique' },
      { icon: 'description', label: 'Documents', route: '/driver/documents', badge: false },
      { icon: 'person', label: 'Mon profil', route: '/driver/profile' },
    ]);
  });

  it('uses compact operational status copy', () => {
    expect(getDriverAvailabilityCardState({ isAvailable: true, isUpdating: false, isApproved: true, hasLocation: true })).toEqual({
      statusLabel: 'Disponible',
      statusDetail: 'En attente',
      description: 'Visible par les clients',
      actionLabel: 'Passer hors ligne',
      actionAriaLabel: 'Passer hors ligne',
    });

    expect(getDriverAvailabilityCardState({ isAvailable: false, isUpdating: false, isApproved: true, hasLocation: true })).toEqual({
      statusLabel: 'Hors ligne',
      statusDetail: 'Inactif',
      description: 'Activez pour recevoir des demandes',
      actionLabel: 'Passer en ligne',
      actionAriaLabel: 'Passer en ligne',
    });
  });

  it('shows a pending state while availability is updating', () => {
    expect(getDriverAvailabilityCardState({ isAvailable: true, isUpdating: true, isApproved: true, hasLocation: true })).toEqual({
      statusLabel: 'Disponible',
      statusDetail: 'Mise à jour',
      description: 'Changement en cours...',
      actionLabel: '...',
      actionAriaLabel: 'Disponibilité en cours de mise à jour',
    });
  });

  it('does not claim client visibility when the driver is not approved or has no location', () => {
    expect(getDriverAvailabilityCardState({ isAvailable: true, isUpdating: false, isApproved: false, hasLocation: false })).toEqual({
      statusLabel: 'Disponible',
      statusDetail: 'Non visible',
      description: 'Compte en attente d’approbation',
      actionLabel: 'Passer hors ligne',
      actionAriaLabel: 'Passer hors ligne',
    });

    expect(getDriverAvailabilityCardState({ isAvailable: true, isUpdating: false, isApproved: true, hasLocation: false })).toEqual({
      statusLabel: 'Disponible',
      statusDetail: 'Non visible',
      description: 'Position introuvable',
      actionLabel: 'Passer hors ligne',
      actionAriaLabel: 'Passer hors ligne',
    });
  });
});
