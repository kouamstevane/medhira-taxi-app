/**
 * authApi — Cloud Functions onCall pour la vérification email OTP.
 *
 * Migré depuis `src/app/api/auth/*` (Next.js routes) pour fonctionner
 * dans l'application Capacitor mobile.
 */

export { authSendVerificationCode } from './sendVerificationCode.js';
export { authVerifyCode } from './verifyCode.js';
