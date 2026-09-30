/**
 * Cloud Functions Firebase - Medjira Main Entry Point
 *
 * Toutes les fonctions sont organisées en modules dédiés par domaine métier.
 * Ce fichier sert d'index central pour l'export des Cloud Functions v2.
 *
 * @module functions
 */

import { setGlobalOptions } from 'firebase-functions/v2/options';
import * as admin from 'firebase-admin';

// Définir la région par défaut pour toutes les fonctions v2
setGlobalOptions({ region: 'europe-west1' });

// Initialiser Firebase Admin (vérifier si déjà initialisé pour éviter les erreurs)
if (!admin.apps.length) {
  admin.initializeApp();
}

// ============================================================================
// Sécurité, Données Sensibles & Nettoyage Storage
// ============================================================================
export {
  validateBankDetails,
  encryptSensitiveData,
  cleanupFailedUploads,
} from './security/sensitiveData.js';
export { cleanupOrphanedFiles } from './security/storageCleanup.js';

// ============================================================================
// Chauffeurs (Inscriptions, Documents & Triggers)
// ============================================================================
export { submitDriverApplication, createDriverProfile } from './driver/submitDriverApplication.js';
export {
  createDriverApplicationUpload,
  submitDriverApplicationWithCv,
  notifyDriverApplicationOnCreate,
  adminGetDriverApplicationCv,
} from './driver/driverApplication.js';
export { onDriverRegistration, onDriverDocumentsUpdated } from './driver/driverTriggers.js';
export {
  adminCreateDriverInvitation,
  validateDriverInvitation,
  completeDriverInvitation,
} from './driver/driverInvitation.js';

// ============================================================================
// Restaurants & Menus
// ============================================================================
export { submitRestaurantApplication } from './restaurant/submitRestaurantApplication.js';
export { deleteRestaurant } from './restaurant/deleteRestaurant.js';
export { restaurantManageFoodOrderStatus } from './restaurant/manageFoodOrderStatus.js';
export {
  previewMenuFileImport,
  startMenuFileImport,
  processMenuImportWorker,
} from './restaurant/menuImportJobs.js';
export { recoverExpiredMenuImportJobs } from './restaurant/recoverExpiredMenuImportJobs.js';
export {
  testStoreConnection,
  saveStoreIntegration,
  startRestaurantStoreSync,
} from './restaurant/syncRestaurantStoreApi.js';

// ============================================================================
// Commandes de Repas & Livraison (Food Delivery)
// ============================================================================
export { createFoodOrder } from './food/createFoodOrder.js';
export {
  onFoodOrderPaymentValidated,
  onFoodOrderStatusChanged,
  onFoodOrderAccepted,
  onDeliveryStatusChanged,
  onRestaurantCancelOrder,
  onFoodOrderRefundRequired,
  retryFailedFoodOrderSettlements,
  cleanupAbandonedFoodPayments,
  onDeliveryOrderCompleted,
  onDeliveryOrderTimeout,
} from './food/foodDeliveryTriggers.js';
export {
  onDriverRatingCreated,
  onRestaurantReviewCreated,
  onDeliveryReviewCreated,
  logPinFailure,
  validateDeliveryPinAndComplete,
  validateFoodPickupCodeAndMarkPickedUp,
} from './food/foodVerificationAndReviews.js';

// ============================================================================
// Rôles & Administration
// ============================================================================
export { activateClientRole } from './roles/activateClientRole.js';
export { notifyAdminNewRestaurant } from './admin/notifyAdminNewRestaurant.js';
export { cleanupExpiredOnboardingDrafts } from './admin/cleanupExpiredOnboardingDrafts.js';
export {
  adminDeleteDriverComplete,
  adminManageCity,
  adminManageDriver,
  adminManageRestaurant,
  adminManageUser,
  adminSendEmail,
} from './admin/index.js';

// ============================================================================
// Téléphonie & VoIP (Twilio)
// ============================================================================
export {
  createCall,
  answerCall,
  endCall,
  getCallToken,
  sendSystemMessage,
} from './voip/index.js';
export { twimlWebhook } from './voip/twiml.js';

// ============================================================================
// Migration de Devise
// ============================================================================
export { migrateCurrencyToCAD, migrateCurrencyToCADHTTP } from './migrateCurrency.js';

// ============================================================================
// Paiements & Portefeuille (Stripe & Wallet)
// ============================================================================
export { createStripeConnectAccount } from './stripe/createStripeConnectAccount.js';
export {
  stripeWebhookInstant,
  stripeWebhookLight,
  createSetupIntent,
  confirmPaymentMethodSetup,
  detachPaymentMethod,
  createConnectAccount,
  createConnectOnboardLink,
  getStripeAccountStatus,
} from './stripe/index.js';
export { stripeConnectPayout } from './stripe/stripeConnectPayout.js';
export { stripePaymentIntent } from './stripe/stripePaymentIntent.js';
export { stripeWalletRecharge } from './stripe/stripeWalletRecharge.js';

export {
  walletGetBalance,
  walletEnsure,
  walletFailTransaction,
  walletPayBooking,
  walletPayFoodOrder,
  payFoodOrderWithCard,
  walletRefundTransaction,
} from './walletApi/index.js';

// ============================================================================
// Chauffeur Privé (Personal Driver)
// ============================================================================
export {
  createPersonalDriverSubscriptionPayment,
  renewPersonalDriverSubscriptionPayment,
  adminManagePersonalDriver,
  driverUpdatePersonalDriverTrip,
  chargePersonalDriverWaitTimeOverage,
  settlePersonalDriverWaitOverageOnPickup,
  clientManagePersonalDriver,
  expirePersonalDriverSubscriptions,
  checkPersonalDriverTripsDelay,
  onSpecialTripCreated,
} from './personalDriver/index.js';

// ============================================================================
// Authentification & Vérification (SMS / Email)
// ============================================================================
export {
  authSendVerificationCode,
  authStartPhoneVerification,
  authVerifyCode,
  authVerifyPhoneCode,
} from './authApi/index.js';
export { sendVerificationCode, verifyCode } from './authApi/emailVerification.js';

// ============================================================================
// Utilitaires API & Géolocalisation
// ============================================================================
export {
  bookingsComplete,
  distanceCalculate,
  reverseGeocode,
  debugLog,
} from './utilsApi/index.js';

// ============================================================================
// RGPD & Anonymisation
// ============================================================================
export {
  requestAccountDeletion,
  adminForceAccountDeletion,
} from './gdpr/deleteAccount.js';
export {
  anonymizeDriverData,
  deleteDriverOnAccountDelete,
  scheduleTripDataAnonymization,
  processAnonymizationTasks,
} from './anonymizeDriverData.js';

// ============================================================================
// Emails & Webhooks
// ============================================================================
export { resendWebhook } from './emails/resend-webhook.js';

// ============================================================================
// Notifications SMS & FCM Topics
// ============================================================================
export {
  onTaxiBookingAccepted,
  onTaxiBookingDriverArrived,
} from './bookingNotifications/index.js';
export {
  subscribeToTopic,
  unsubscribeFromTopic,
} from './notifications/topicSubscription.js';

// ============================================================================
// Livraison de Colis (Parcels)
// ============================================================================
export {
  onParcelCreated,
  onParcelPaymentValidated,
  onParcelStatusChanged,
  createParcelOrder,
  finalizeParcelCardPayment,
  confirmParcelReceipt,
  autoConfirmDeliveredParcels,
} from './parcels/index.js';
