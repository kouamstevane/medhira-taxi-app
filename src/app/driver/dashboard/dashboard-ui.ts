import { translate } from '@/locales';

export interface DriverDashboardQuickAction {
  icon: string;
  label: string;
  route: string;
  badge?: boolean;
}

export type DashboardTranslationFn = (key: string, params?: Record<string, string | number>) => string;

export function getDriverDashboardNotificationState(unreadCount: number, t: DashboardTranslationFn = translate) {
  return {
    ariaLabel: unreadCount > 0
      ? t('systemMessages.driverDashboard.notificationsUnread', { count: unreadCount })
      : t('systemMessages.driverDashboard.notifications'),
    showUnreadDot: unreadCount > 0,
  };
}

export function getDriverDashboardQuickActions(hasDocumentIssue: boolean, t: DashboardTranslationFn = translate): DriverDashboardQuickAction[] {
  return [
    { icon: 'payments', label: t('systemMessages.driverDashboard.quickEarnings'), route: '/driver/activite?tab=gains' },
    { icon: 'history', label: t('systemMessages.driverDashboard.quickHistory'), route: '/driver/activite?tab=historique' },
    { icon: 'description', label: t('systemMessages.driverDashboard.quickDocuments'), route: '/driver/documents', badge: hasDocumentIssue },
    { icon: 'person', label: t('systemMessages.driverDashboard.quickProfile'), route: '/driver/profile' },
  ];
}

interface DriverRideWorkAccessInput {
  status?: string | null;
  stripeAccountStatus?: string | null;
  stripePayoutsEnabled?: boolean | null;
}

export function isDriverApprovedOrActive(status?: string | null): boolean {
  return status === 'approved' || status === 'active';
}

export function canDriverAccessRideWork({
  status,
  stripeAccountStatus,
  stripePayoutsEnabled,
}: DriverRideWorkAccessInput): boolean {
  return (
    isDriverApprovedOrActive(status) &&
    stripeAccountStatus === 'active' &&
    stripePayoutsEnabled === true
  );
}

interface DriverAvailabilityCardOptions {
  isAvailable: boolean;
  isUpdating?: boolean;
  isApproved: boolean;
  hasLocation: boolean;
  t?: DashboardTranslationFn;
}

type DriverAvailabilityIndicatorTone = 'online' | 'warning' | 'offline';

export function getDriverAvailabilityCardState({
  isAvailable,
  isUpdating = false,
  isApproved,
  hasLocation,
  t = translate,
}: DriverAvailabilityCardOptions) {
  const tr = (key: string) => t(`systemMessages.availabilityCard.${key}`);

  if (isUpdating) {
    return {
      statusLabel: isAvailable ? tr('available') : tr('offline'),
      statusDetail: tr('updating'),
      description: tr('changeInProgress'),
      actionLabel: '...',
      actionAriaLabel: tr('updatingAria'),
      indicatorTone: (isAvailable ? 'online' : 'offline') satisfies DriverAvailabilityIndicatorTone,
    };
  }

  if (!isApproved) {
    return {
      statusLabel: tr('pending'),
      statusDetail: tr('underReview'),
      description: tr('pendingApproval'),
      actionLabel: tr('unavailable'),
      actionAriaLabel: tr('pendingApproval'),
      indicatorTone: 'offline' satisfies DriverAvailabilityIndicatorTone,
    };
  }

  if (isAvailable && !hasLocation) {
    return {
      statusLabel: tr('available'),
      statusDetail: tr('notVisible'),
      description: tr('locationNotFound'),
      actionLabel: tr('goOffline'),
      actionAriaLabel: tr('goOffline'),
      indicatorTone: 'warning' satisfies DriverAvailabilityIndicatorTone,
    };
  }

  return isAvailable
    ? {
        statusLabel: tr('available'),
        statusDetail: tr('pending'),
        description: tr('visibleToClients'),
        actionLabel: tr('goOffline'),
        actionAriaLabel: tr('goOffline'),
        indicatorTone: 'online' satisfies DriverAvailabilityIndicatorTone,
      }
    : {
        statusLabel: tr('offline'),
        statusDetail: tr('inactive'),
        description: tr('enableToReceiveRequests'),
        actionLabel: tr('goOnline'),
        actionAriaLabel: tr('goOnline'),
        indicatorTone: 'offline' satisfies DriverAvailabilityIndicatorTone,
      };
}
