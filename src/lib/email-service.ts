import nodemailer from 'nodemailer';
import { 
  getApprovalTemplate, 
  getRejectionTemplate, 
  getSuspensionTemplate, 
  getDeactivationTemplate, 
  getReactivationTemplate 
} from './email-templates';

/**
 * Service centralisé pour l'envoi d'emails via Nodemailer
 */
export async function sendEmail({
  to,
  subject,
  html,
  fromName = 'Medjira'
}: {
  to: string;
  subject: string;
  html: string;
  fromName?: string;
}) {
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = process.env.SMTP_PORT;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpFrom = process.env.SMTP_FROM;

  if (!smtpHost || !smtpPort || !smtpUser || !smtpPass) {
    console.error('❌ Configuration SMTP manquante:', { 
      host: !!smtpHost, 
      port: !!smtpPort, 
      user: !!smtpUser, 
      pass: !!smtpPass 
    });
    throw new Error('Configuration SMTP incomplete dans les variables d\'environnement');
  }

  const port = parseInt(smtpPort, 10);
  const isSecure = port === 465;

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: port,
    secure: isSecure,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
    // TLS options pour les ports non-465 (STARTTLS)
    ...(!isSecure && {
      requireTLS: true,
      tls: {
        // En prod, il faudrait idéalement laisser rejectUnauthorized: true
        // Mais pour la compatibilité avec certains serveurs on garde flexible
        rejectUnauthorized: process.env.NODE_ENV === 'production' ? true : false,
      },
    }),
  });

  const from = smtpFrom || `${fromName} <${smtpUser}>`;

  const mailOptions = {
    from,
    to,
    subject,
    html,
  };

  return await transporter.sendMail(mailOptions);
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
      subject = '⚠️ Votre compte chauffeur Medjira a été suspendu';
      html = getSuspensionTemplate(driverName, reason);
      break;
    case 'deactivation':
      subject = '🚫 Votre compte chauffeur Medjira a été désactivé';
      html = getDeactivationTemplate(driverName, reason);
      break;
    case 'reactivation':
      subject = '✅ Votre compte chauffeur Medjira a été réactivé';
      html = getReactivationTemplate(driverName);
      break;
  }

  return await sendEmail({ to, subject, html });
}
