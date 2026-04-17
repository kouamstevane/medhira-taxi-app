import { Resend } from 'resend';

interface SendVerificationCodeParams {
  to: string;
  code: string;
  uid: string;
  /** Clé API Resend injectée via Firebase Secret Manager */
  apiKey?: string;
}

interface SendEmailResult {
  messageId?: string;
}

function getVerificationCodeTemplate(code: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; background-color: #1a1a2e; font-family: 'Inter', Arial, sans-serif; }
    .wrapper { background-color: #1a1a2e; padding: 40px 20px; }
    .container { max-width: 480px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; }
    .header { background-color: #f29200; padding: 32px 24px; text-align: center; }
    .header h1 { margin: 0; color: #ffffff; font-size: 22px; font-weight: 700; letter-spacing: -0.3px; }
    .header p { margin: 6px 0 0 0; color: rgba(255,255,255,0.85); font-size: 14px; }
    .body { padding: 36px 32px; }
    .body p { color: #374151; font-size: 15px; line-height: 1.6; margin: 0 0 16px 0; }
    .code-box { background-color: #f8f9fa; border: 2px solid #f29200; border-radius: 8px; padding: 28px 24px; text-align: center; margin: 28px 0; }
    .code { font-size: 48px; font-weight: 700; letter-spacing: 12px; color: #1a1a2e; line-height: 1; display: block; }
    .expiry { margin-top: 14px; font-size: 13px; color: #6b7280; }
    .security-note { background-color: #fff7ed; border-left: 3px solid #f29200; padding: 12px 16px; border-radius: 0 6px 6px 0; margin: 20px 0; }
    .security-note p { margin: 0; color: #92400e; font-size: 13px; }
    .footer { background-color: #1a1a2e; padding: 24px; text-align: center; }
    .footer p { margin: 0; color: rgba(255,255,255,0.5); font-size: 12px; line-height: 1.6; }
    .footer a { color: #f29200; text-decoration: none; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <h1>Vérification de votre email</h1>
        <p>Plateforme de transport Medjira</p>
      </div>
      <div class="body">
        <p>Bonjour,</p>
        <p>Pour finaliser votre inscription en tant que chauffeur Medjira, veuillez saisir le code de vérification ci-dessous dans l'application :</p>
        <div class="code-box">
          <span class="code">${code}</span>
          <p class="expiry">⚠️ Ce code expire dans <strong>15 minutes</strong>.</p>
        </div>
        <div class="security-note">
          <p>🔒 <strong>Ne partagez jamais ce code.</strong> L'équipe Medjira ne vous demandera jamais votre code de vérification.</p>
        </div>
        <p>Si vous n'avez pas demandé ce code, ignorez simplement cet email. Votre compte restera sécurisé.</p>
        <p>Cordialement,<br><strong>L'équipe Medjira</strong></p>
      </div>
      <div class="footer">
        <p>&copy; ${new Date().getFullYear()} Medjira. Tous droits réservés.<br>
        <a href="https://medjira.com">medjira.com</a></p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Service d'envoi d'emails pour les Cloud Functions.
 *
 * Accepte la clé API Resend soit via le paramètre `apiKey` (injecté par
 * Firebase Secret Manager via `defineSecret`), soit via `process.env`.
 */
export async function sendVerificationCodeEmail(
  params: SendVerificationCodeParams,
): Promise<SendEmailResult> {
  const { to, code, uid, apiKey } = params;

  const resolvedApiKey = apiKey || process.env.RESEND_API_KEY;
  if (!resolvedApiKey) {
    throw new Error('RESEND_API_KEY manquant. Configurez-le via Firebase Secret Manager : firebase functions:secrets:set RESEND_API_KEY');
  }

  const resend = new Resend(resolvedApiKey);
  const fromEmail = process.env.RESEND_FROM_EMAIL || process.env.FROM_EMAIL || 'medjira@medjira.com';

  const result = await resend.emails.send({
    from: `Medjira <${fromEmail}>`,
    to,
    subject: 'Votre code de vérification Medjira',
    html: getVerificationCodeTemplate(code),
    tags: [
      { name: 'uid', value: uid },
      { name: 'type', value: 'verification_code' },
    ],
  });

  if (result.error) {
    throw new Error(`Erreur Resend: ${result.error.message}`);
  }

  return { messageId: result.data?.id };
}
