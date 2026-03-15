/**
 * Cloud Functions pour l'envoi d'emails de vérification via Resend
 * 
 * Ce module fournit deux endpoints:
 * - sendVerificationEmail: Callable function (appelée depuis le client Firebase)
 * - sendVerificationEmailHttp: HTTP function (appelée via HTTP REST)
 * 
 * Avantages par rapport à Firebase Auth:
 * - Meilleure délivrabilité avec SPF/DKIM configuré
 * - Templates React modernes et personnalisables
 * - Tracking et monitoring intégrés
 * - Indépendance de Firebase Auth
 * 
 * @module emails/send-verification-email
 */

import { onCall, HttpsError, onRequest } from 'firebase-functions/v2/https';
import { defineSecret, defineString, defineBoolean } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import { Resend } from 'resend';
import { render } from '@react-email/render';
import * as React from 'react';
import { z } from 'zod';

// ============================================================================
// PARAMÈTRES FIREBASE FUNCTIONS (lus depuis functions/.env)
// ============================================================================

/** Clé API Resend (sensible) — configurée via : firebase functions:secrets:set RESEND_API_KEY */
const resendApiKey = defineSecret('RESEND_API_KEY');

/** Email expéditeur */
const fromEmail = defineString('FROM_EMAIL', {
  default: 'noreply@medjira-service.firebaseapp.com',
  description: 'Email expéditeur pour Resend'
});

/** Nom expéditeur */
const fromName = defineString('FROM_NAME', {
  default: 'Medjira Service',
  description: 'Nom expéditeur pour Resend'
});

/** Email de réponse */
const replyTo = defineString('REPLY_TO', {
  default: 'noreply@medjira-service.firebaseapp.com',
  description: 'Email de réponse pour Resend'
});

/** URL de l'application */
const appUrl = defineString('APP_URL', {
  default: 'https://medjira-service.firebaseapp.com',
  description: 'URL de l\'application'
});

/** Activer le logging des emails */
const shouldLogEmails = defineBoolean('SHOULD_LOG_EMAILS', {
  default: false,
  description: 'Activer le logging des emails'
});

/** Taux d\'échantillonnage pour le logging */
const logSamplingRate = defineString('LOG_SAMPLING_RATE', {
  default: '0.5',
  description: 'Taux d\'échantillonnage pour le logging (0.0 à 1.0)'
});

/** Région des fonctions Firebase (configurable) */
const functionsRegion = defineString('FUNCTIONS_REGION', {
  default: 'europe-west1',
  description: 'Région de déploiement des fonctions Firebase (ex: europe-west1, us-central1)'
});

/** URL du logo pour les emails */
const logoUrl = defineString('LOGO_URL', {
  default: '',
  description: 'URL du logo à afficher dans les emails (doit être une URL publique)'
});

/**
 * Obtenir le taux d\'échantillonnage comme nombre
 */
function getLogSamplingRate(): number {
  const rate = logSamplingRate.value();
  return parseFloat(rate) || 0.5;
}

/**
 * Obtenir l\'environnement actuel
 */
function getEnvironment(): string {
  const nodeEnv = process.env.NODE_ENV;
  if (nodeEnv === 'production') return 'production';
  if (nodeEnv === 'development') return 'development';
  if (nodeEnv === 'test') return 'test';
  
  const projectId = process.env.GCLOUD_PROJECT || process.env.FIREBASE_CONFIG;
  if (projectId) {
    if (projectId.includes('prod') || projectId.includes('medjira-service')) {
      return 'production';
    }
    if (projectId.includes('dev') || projectId.includes('staging')) {
      return 'development';
    }
  }
  
  return 'development';
}

// Initialiser Firebase Admin (si pas déjà initialisé)
if (!admin.apps.length) {
  admin.initializeApp();
}

// ============================================================================
// RATE LIMITING
// ============================================================================

/**
 * Rate Limiter pour les envois d'emails
 * Empêche les abus et les coûts excessifs
 */
class EmailRateLimiter {
  private maxEmailsPerHour: number;
  private db: admin.firestore.Firestore;

  constructor(maxEmailsPerHour: number = 10) {
    this.maxEmailsPerHour = maxEmailsPerHour;
    this.db = admin.firestore();
  }

  /**
   * Vérifie si l'utilisateur a dépassé la limite d'emails
   * Utilise une transaction Firestore pour garantir l'atomicité
   */
  async checkLimit(identifier: string): Promise<{ allowed: boolean; retryAfter?: number }> {
    const docRef = this.db.collection('email_rate_limits').doc(identifier);
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    
    try {
      const result = await this.db.runTransaction(async (transaction) => {
        const doc = await transaction.get(docRef);
        
        if (!doc.exists) {
          transaction.set(docRef, {
            count: 1,
            windowStart: now,
            lastReset: now,
            identifier,
          });
          return { allowed: true };
        }
        
        const data = doc.data();
        
        if (!data) {
          transaction.set(docRef, {
            count: 1,
            windowStart: now,
            lastReset: now,
            identifier,
          });
          return { allowed: true };
        }
        
        // Réinitialiser si la fenêtre est expirée
        if (data.windowStart < oneHourAgo) {
          transaction.update(docRef, {
            count: 1,
            windowStart: now,
            lastReset: now,
          });
          return { allowed: true };
        }
        
        // Vérifier si la limite est atteinte
        if (data.count >= this.maxEmailsPerHour) {
          const timeUntilReset = data.windowStart + (60 * 60 * 1000) - now;
          const retryAfter = Math.ceil(timeUntilReset / 1000);
          
          console.warn(`[EmailRateLimiter] Limite atteinte pour ${identifier}. Réessayez dans ${retryAfter}s`);
          
          return { allowed: false, retryAfter };
        }
        
        transaction.update(docRef, {
          count: admin.firestore.FieldValue.increment(1),
        });
        
        return { allowed: true };
      });
      
      return result;
    } catch (error) {
      console.error('[EmailRateLimiter] Erreur de transaction:', error);
      return { allowed: false, retryAfter: 60 };
    }
  }

  async reset(identifier: string): Promise<void> {
    const docRef = this.db.collection('email_rate_limits').doc(identifier);
    await docRef.delete();
    console.log(`[EmailRateLimiter] Compteur réinitialisé pour ${identifier}`);
  }
}

// ============================================================================
// SCHÉMAS DE VALIDATION
// ============================================================================

const SendVerificationEmailSchema = z.object({
  email: z.string().email('Email invalide'),
  displayName: z.string().optional(),
});

// ============================================================================
// TEMPLATES EMAIL (react-email)
// ============================================================================

interface VerificationEmailProps {
  displayName?: string;
  verificationUrl: string;
  appName: string;
  supportEmail: string;
  logoUrl?: string;
}

const VerificationEmail = ({
  displayName = 'Cher utilisateur',
  verificationUrl,
  appName = 'Medjira Service',
  supportEmail = 'noreply@medjira-service.firebaseapp.com',
  logoUrl,
}: VerificationEmailProps) => {
  const headerChildren = [
    logoUrl && React.createElement('img', {
      key: 'logo',
      src: logoUrl,
      alt: appName,
      style: { maxWidth: '150px', height: 'auto', display: 'block', margin: '0 auto 20px auto' },
    }),
    React.createElement('h1', { key: 'h1', style: { color: '#333', textAlign: 'center' } }, 'Vérifiez votre adresse email'),
  ].filter(Boolean);

  return React.createElement(
    'div',
    { style: { fontFamily: 'Arial, sans-serif', maxWidth: '600px', margin: '0 auto', padding: '20px' } },
    [
      ...headerChildren,
      React.createElement('p', { key: 'greeting', style: { fontSize: '16px', lineHeight: '1.5' } }, `Bonjour ${displayName},`),
      React.createElement('p', { key: 'intro', style: { fontSize: '16px', lineHeight: '1.5' } }, 'Merci de vous être inscrit sur ' + appName + '. Pour compléter votre inscription, veuillez vérifier votre adresse email en cliquant sur le bouton ci-dessous:'),
      React.createElement(
        'div',
        { key: 'button-container', style: { textAlign: 'center', margin: '30px 0' } },
        React.createElement(
          'a',
          {
            href: verificationUrl,
            style: {
              backgroundColor: '#000000',
              color: '#ffffff',
              padding: '12px 24px',
              textDecoration: 'none',
              borderRadius: '5px',
              display: 'inline-block',
              fontWeight: 'bold',
            },
          },
          'Vérifier mon email'
        )
      ),
      React.createElement('p', { key: 'warning', style: { fontSize: '14px', color: '#666', lineHeight: '1.5' } }, 'Ce lien expire dans 24 heures. Si vous n\'avez pas créé de compte, vous pouvez ignorer cet email.'),
      React.createElement('hr', { key: 'hr', style: { border: 'none', borderTop: '1px solid #eee', margin: '30px 0' } }),
      React.createElement('p', { key: 'footer', style: { fontSize: '12px', color: '#888', textAlign: 'center' } }, 'Cet email a été envoyé automatiquement. Merci de ne pas y répondre.'),
      React.createElement('p', { key: 'contact', style: { fontSize: '12px', color: '#888', textAlign: 'center' } }, 'Pour toute question, contactez-nous à ' + supportEmail),
    ]
  );
};

// ============================================================================
// UTILITAIRES
// ============================================================================

async function generateVerificationLink(email: string): Promise<string> {
  const actionCodeSettings = {
    url: `${appUrl.value()}/driver/verify-email`,
    handleCodeInApp: true,
  };

  const link = await admin.auth().generateEmailVerificationLink(email, actionCodeSettings);
  return link;
}

async function logEmailSend(
  email: string,
  success: boolean,
  messageId?: string,
  error?: string
): Promise<void> {
  const shouldLog = shouldLogEmails.value();
  const samplingRate = getLogSamplingRate();

  if (!shouldLog || Math.random() > samplingRate) {
    return;
  }

  try {
    const db = admin.firestore();
    const logsRef = db.collection('emailLogs').doc();
    
    await logsRef.set({
      email,
      messageId,
      success,
      error,
      timestamp: admin.firestore.Timestamp.now(),
      metadata: {
        provider: 'resend',
        template: 'verification-email',
        environment: getEnvironment(),
      },
    });
  } catch (err) {
    console.error('[EmailVerification] Erreur lors du logging:', err);
  }
}

// Singleton Resend — évite de recréer l'instance à chaque appel
let resendInstance: Resend | null = null;
let cachedApiKey: string | null = null;

function getResendInstance(): Resend {
  const currentApiKey = resendApiKey.value();
  
  if (!resendInstance || cachedApiKey !== currentApiKey) {
    resendInstance = new Resend(currentApiKey);
    cachedApiKey = currentApiKey;
  }
  
  return resendInstance;
}

async function sendEmailViaResend(
  email: string,
  displayName: string | undefined
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const resend = getResendInstance();
    const verificationUrl = await generateVerificationLink(email);

    const emailElement = React.createElement(VerificationEmail, {
      displayName,
      verificationUrl,
      appName: 'Medjira Service',
      supportEmail: replyTo.value(),
      logoUrl: logoUrl.value() || undefined,
    });

    const [emailHtml, emailText] = await Promise.all([
      render(emailElement),
      render(emailElement, { plainText: true }),
    ]);

    const result = await resend.emails.send({
      from: `${fromName.value()} <${fromEmail.value()}>`,
      to: email,
      subject: 'Vérifiez votre adresse email - Medjira Service',
      html: emailHtml,
      text: emailText,
      replyTo: replyTo.value(),
    });

    if (result.error) {
      console.error('[EmailVerification] Erreur Resend API:', result.error);
      await logEmailSend(email, false, undefined, result.error.message);
      return {
        success: false,
        error: result.error.message,
      };
    }

    await logEmailSend(email, true, result.data?.id);

    return {
      success: true,
      messageId: result.data?.id,
    };
  } catch (error: any) {
    console.error('[EmailVerification] Erreur lors de l\'envoi via Resend:', error);
    await logEmailSend(email, false, undefined, error.message);

    return {
      success: false,
      error: error.message,
    };
  }
}

// ============================================================================
// CLOUD FUNCTIONS
// ============================================================================

/**
 * Callable Function: Envoi d'email de vérification
 * Appelée depuis le client Firebase via httpsCallable()
 */
export const sendVerificationEmail = onCall(
  {
    region: functionsRegion,
    memory: '256MiB',
    maxInstances: 10,
    cors: true,
    secrets: [resendApiKey],
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Vous devez être connecté pour effectuer cette action.');
    }

    const validationResult = SendVerificationEmailSchema.safeParse(request.data);
    if (!validationResult.success) {
      throw new HttpsError('invalid-argument', validationResult.error.issues[0].message);
    }

    const { email, displayName } = validationResult.data;

    if (request.auth.token.email !== email) {
      throw new HttpsError('permission-denied', 'Vous ne pouvez envoyer un email qu\'à votre propre adresse.');
    }

    const rateLimiter = new EmailRateLimiter(10);
    const rateLimitResult = await rateLimiter.checkLimit(request.auth.uid);
    
    if (!rateLimitResult.allowed) {
      const retryAfterMinutes = Math.ceil((rateLimitResult.retryAfter || 0) / 60);
      throw new HttpsError(
        'resource-exhausted',
        `Trop d'emails envoyés. Réessayez dans ${retryAfterMinutes} minute(s).`
      );
    }

    const result = await sendEmailViaResend(email, displayName);

    if (!result.success) {
      throw new HttpsError('internal', result.error || 'Erreur lors de l\'envoi de l\'email.');
    }

    return {
      success: true,
      messageId: result.messageId,
    };
  }
);

/**
 * HTTP Function: Envoi d'email de vérification via HTTP REST
 * Requiert un header Authorization: Bearer <firebase_id_token>
 */
export const sendVerificationEmailHttp = onRequest(
  {
    region: functionsRegion,
    memory: '256MiB',
    maxInstances: 10,
    cors: true,
    secrets: [resendApiKey],
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ 
          error: 'Unauthorized',
          message: 'Header Authorization manquant ou invalide. Format attendu: Authorization: Bearer <firebase_id_token>'
        });
        return;
      }
      
      const token = authHeader.substring(7);
      let decodedToken;
      try {
        decodedToken = await admin.auth().verifyIdToken(token);
      } catch (tokenError: any) {
        console.error('[EmailVerification] Token invalide:', tokenError);
        res.status(401).json({ 
          error: 'Unauthorized',
          message: 'Token Firebase invalide ou expiré'
        });
        return;
      }

      const validationResult = SendVerificationEmailSchema.safeParse(req.body);
      if (!validationResult.success) {
        res.status(400).json({ error: validationResult.error.issues[0].message });
        return;
      }

      const { email, displayName } = validationResult.data;
      
      if (decodedToken.email !== email) {
        console.warn('[EmailVerification] Tentative d\'envoi à une email différent:', {
          tokenEmail: decodedToken.email,
          requestedEmail: email,
          uid: decodedToken.uid
        });
        res.status(403).json({ 
          error: 'Forbidden',
          message: 'Vous ne pouvez envoyer un email qu\'à votre propre adresse'
        });
        return;
      }
      
      const rateLimiter = new EmailRateLimiter(10);
      const rateLimitResult = await rateLimiter.checkLimit(decodedToken.uid);
      
      if (!rateLimitResult.allowed) {
        const retryAfterMinutes = Math.ceil((rateLimitResult.retryAfter || 0) / 60);
        res.status(429).json({
          error: 'Too Many Requests',
          message: `Trop d'emails envoyés. Réessayez dans ${retryAfterMinutes} minute(s).`
        });
        return;
      }

      const result = await sendEmailViaResend(email, displayName);

      if (!result.success) {
        res.status(500).json({ error: result.error });
        return;
      }

      res.status(200).json({
        success: true,
        messageId: result.messageId,
      });
    } catch (error: any) {
      console.error('[EmailVerification] Erreur HTTP:', error);
      res.status(500).json({ error: error.message });
    }
  }
);