import { Resend } from 'resend';
import {
  getApprovalTemplate,
  getRejectionTemplate,
  getSuspensionTemplate,
  getDeactivationTemplate,
  getReactivationTemplate,
  getVerificationCodeTemplate,
} from './email-templates';

function getResendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY manquant dans les variables d\'environnement');
  }
  return new Resend(apiKey);
}

/**
 * Service centralisé pour l'envoi d'emails via Resend
 */
export async function sendEmail({
  to,
  subject,
  html,
  fromName = 'Medjira',
  tags,
}: {
  to: string;
  subject: string;
  html: string;
  fromName?: string;
  tags?: Array<{ name: string; value: string }>;
}): Promise<{ messageId?: string }> {
  const resend = getResendClient();
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'medjira@medjira.com';

  const result = await resend.emails.send({
    from: `${fromName} <${fromEmail}>`,
    to,
    subject,
    html,
    tags,
  });

  if (result.error) {
    throw new Error(`Erreur Resend: ${result.error.message}`);
  }

  return { messageId: result.data?.id };
}

/**
 * Envoie un email spécifique au statut d'un chauffeur
 */
export async function sendDriverStatusEmail({
  to,
  driverName,
  type,
  reason
}: {
  to: string;
  driverName: string;
  type: 'approval' | 'rejection' | 'suspension' | 'deactivation' | 'reactivation';
  reason?: string;
}) {
  let subject = '';
  let html = '';

  switch (type) {
    case 'approval':
      subject = 'Votre compte chauffeur Medjira a été approuvé !';
      html = getApprovalTemplate(driverName);
      break;
    case 'rejection':
      subject = 'Décision concernant votre demande d\'inscription Medjira';
      html = getRejectionTemplate(driverName, reason);
      break;
    case 'suspension':
      subject = 'Votre compte chauffeur Medjira a été suspendu';
      html = getSuspensionTemplate(driverName, reason);
      break;
    case 'deactivation':
      subject = 'Votre compte chauffeur Medjira a été désactivé';
      html = getDeactivationTemplate(driverName, reason);
      break;
    case 'reactivation':
      subject = 'Votre compte chauffeur Medjira a été réactivé';
      html = getReactivationTemplate(driverName);
      break;
  }

  return await sendEmail({ to, subject, html });
}

/**
 * Envoie un email de code de vérification
 */
export async function sendVerificationCodeEmail({
  to,
  code,
  uid,
}: {
  to: string;
  code: string;
  uid: string;
}): Promise<{ messageId?: string }> {
  return sendEmail({
    to,
    subject: 'Votre code de vérification Medjira',
    html: getVerificationCodeTemplate(code),
    fromName: 'Medjira',
    tags: [
      { name: 'uid', value: uid },
      { name: 'type', value: 'verification_code' },
    ],
  });
}
