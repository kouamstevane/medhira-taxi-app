import type { DeepString } from '../types';
import type { notifications as NotificationsFr } from '../fr/notifications';

export const notifications: DeepString<typeof NotificationsFr> = {
  title: 'Notifications',
  noNotifications: 'No notifications',
  noNotificationsDesc: 'You do not have any new notifications at this time.',
  markAllAsRead: 'Mark all as read',
  clearAll: 'Clear all',
  back: 'Back',
  networkErrorTitle: 'Oops!',
  networkErrorMessage: 'Unable to load your notifications. Please check your internet connection and try again.',

  // System driver notifications
  sysPendingTitle: 'Application under review',
  sysPendingBody: 'Your data is in read-only mode until approved by our onboarding team.',
  sysEmailVerifiedTitle: 'Email address verified',
  sysEmailVerifiedBody: 'Your email address is verified. Your application is being reviewed by our team. You will receive a confirmation once approved.',
  sysStripeDisabledTitle: 'Payout account disabled',
  sysStripeDisabledBody: 'Contact support to restore your bank payouts.',
  sysStripeRestrictedTitle: 'Payout account restricted',
  sysStripeRestrictedBody: '{count} piece(s) of info required to unlock your payouts.',
  sysStripeRestrictedFallback: 'Your payouts are blocked. Please check your Stripe account.',
  sysStripeNotCreatedTitle: 'Payment setup required',
  sysStripeNotCreatedBody: 'You will not be able to receive payouts until your Stripe account is configured.',
  sysStripePendingTitle: 'Payment setup in progress',
  sysStripePendingBody: '{count} item(s) requested by Stripe.',
  sysStripePendingFallback: 'Stripe verification in progress.',
  sysAvailableTitle: 'Available — Waiting for rides',
  sysAvailableBody: 'Your location is visible to passengers. Stay close to active areas.',

  // Taxi
  driverAssignedTitle: 'Driver found!',
  driverAssignedBody: '{{driver}} is on the way in a {{vehicle}}.',
  driverArrivedTitle: 'Your driver has arrived!',
  driverArrivedBody: '{{driver}} is waiting at the pickup spot.',
  tripStartedTitle: 'Trip started',
  tripStartedBody: 'Enjoy your trip to {{destination}}!',
  tripCompletedTitle: 'Trip completed',
  tripCompletedBody: 'Thank you for riding with Medjira. Don’t forget to rate your driver.',

  // Food
  foodPreparingTitle: 'Order is being prepared',
  foodPreparingBody: 'The restaurant is preparing your food.',
  foodCourierHeadingTitle: 'Courier on the way',
  foodCourierHeadingBody: 'Your courier is heading towards your delivery address.',
  foodDeliveredTitle: 'Order delivered!',
  foodDeliveredBody: 'Enjoy your meal!',

  // Parcel
  parcelPickedUpTitle: 'Package picked up',
  parcelPickedUpBody: 'The courier has picked up your package.',
  parcelDeliveredTitle: 'Package delivered',
  parcelDeliveredBody: 'Your package has been safely delivered to the recipient.',

  // Wallet
  walletCreditedTitle: 'Top-up successful',
  walletCreditedBody: '{{amount}} has been credited to your Medjira wallet.',
  payoutProcessedTitle: 'Payout processed',
  payoutProcessedBody: 'A payout of {{amount}} has been sent to your bank account.',
};
