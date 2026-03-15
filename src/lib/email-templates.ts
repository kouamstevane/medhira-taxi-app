/**
 * Bibliothèque de templates d'emails pour Medjira
 */

export const getApprovalTemplate = (driverName: string) => `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <style>
      body { font-family: 'Inter', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
      .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; }
      .header { background-color: #f29200; color: white; padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0; }
      .content { padding: 30px; background-color: #ffffff; }
      .button { display: inline-block; padding: 14px 28px; background-color: #f29200; color: white !important; text-decoration: none; border-radius: 6px; margin-top: 25px; font-weight: bold; }
      .footer { padding: 20px; text-align: center; font-size: 12px; color: #888; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1 style="margin:0">🎉 Félicitations ${driverName} !</h1>
      </div>
      <div class="content">
        <p>Bonjour <strong>${driverName}</strong>,</p>
        <p>Nous avons le plaisir de vous informer que votre demande d'inscription en tant que chauffeur sur la plateforme <strong>Medjira</strong> a été <strong>approuvée</strong> !</p>
        <p>Vous faites désormais partie de l'élite des transporteurs partenaires. Vous pouvez maintenant vous connecter à votre compte et commencer à recevoir des courses.</p>
        <div style="text-align: center;">
          <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/driver/login" class="button">
            Se connecter maintenant
          </a>
        </div>
        <p style="margin-top: 30px;">Bienvenue dans l'équipe Medjira !</p>
        <p>Cordialement,<br>L'équipe Medjira</p>
      </div>
      <div class="footer">
        &copy; ${new Date().getFullYear()} Medjira. Tous droits réservés.
      </div>
    </div>
  </body>
  </html>
`;

export const getRejectionTemplate = (driverName: string, reason?: string) => `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <style>
      body { font-family: 'Inter', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
      .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; }
      .header { background-color: #dc2626; color: white; padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0; }
      .content { padding: 30px; background-color: #ffffff; }
      .reason-box { background-color: #fee2e2; border-left: 4px solid #dc2626; padding: 20px; margin: 25px 0; border-radius: 0 4px 4px 0; }
      .footer { padding: 20px; text-align: center; font-size: 12px; color: #888; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1 style="margin:0">Décision concernant votre demande</h1>
      </div>
      <div class="content">
        <p>Bonjour <strong>${driverName}</strong>,</p>
        <p>Nous avons examiné avec attention votre demande d'inscription en tant que chauffeur sur la plateforme Medjira.</p>
        <p>Malheureusement, votre demande n'a pas pu être approuvée pour le moment pour la raison suivante :</p>
        <div class="reason-box">
          <strong>Motif du refus :</strong>
          <p style="margin: 10px 0 0 0;">${reason || 'Documents incomplets ou non conformes aux critères de la plateforme.'}</p>
        </div>
        <p>Si vous souhaitez contester cette décision ou soumettre une nouvelle demande avec des documents complémentaires, n'hésitez pas à répondre à cet email ou nous contacter via notre support.</p>
        <p>Cordialement,<br>L'équipe Medjira</p>
      </div>
      <div class="footer">
        &copy; ${new Date().getFullYear()} Medjira. Tous droits réservés.
      </div>
    </div>
  </body>
  </html>
`;

export const getSuspensionTemplate = (driverName: string, reason?: string) => `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <style>
      body { font-family: 'Inter', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
      .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; }
      .header { background-color: #f97316; color: white; padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0; }
      .content { padding: 30px; background-color: #ffffff; }
      .reason-box { background-color: #fed7aa; border-left: 4px solid #f97316; padding: 20px; margin: 25px 0; border-radius: 0 4px 4px 0; }
      .warning { background-color: #fef3c7; border: 1px solid #eab308; padding: 15px; margin: 20px 0; border-radius: 4px; color: #854d0e; }
      .footer { padding: 20px; text-align: center; font-size: 12px; color: #888; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1 style="margin:0">Suspension de compte</h1>
      </div>
      <div class="content">
        <p>Bonjour <strong>${driverName}</strong>,</p>
        <p>Nous vous informons que votre compte chauffeur sur la plateforme Medjira a été <strong>suspendu temporairement</strong>.</p>
        <div class="reason-box">
          <strong>Raison de la suspension :</strong>
          <p style="margin: 10px 0 0 0;">${reason || 'Violation signalée des conditions d\'utilisation.'}</p>
        </div>
        <div class="warning">
          <strong>Action requise :</strong>
          <p style="margin: 5px 0 0 0;">Vous ne pourrez plus accepter de courses ni vous connecter à l'application pendant la durée de cette suspension.</p>
        </div>
        <p>Pour toute question ou pour faire appel de cette décision, veuillez contacter notre support à l'adresse suivante : <strong>support@medjira.com</strong></p>
        <p>Cordialement,<br>L'équipe Medjira</p>
      </div>
      <div class="footer">
        &copy; ${new Date().getFullYear()} Medjira. Tous droits réservés.
      </div>
    </div>
  </body>
  </html>
`;

export const getDeactivationTemplate = (driverName: string, reason?: string) => `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <style>
      body { font-family: 'Inter', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
      .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; }
      .header { background-color: #dc2626; color: white; padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0; }
      .content { padding: 30px; background-color: #ffffff; }
      .reason-box { background-color: #fee2e2; border-left: 4px solid #dc2626; padding: 20px; margin: 25px 0; border-radius: 0 4px 4px 0; }
      .alert { background-color: #fef2f2; border: 1px solid #dc2626; padding: 15px; margin: 20px 0; border-radius: 4px; color: #991b1b; }
      .footer { padding: 20px; text-align: center; font-size: 12px; color: #888; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1 style="margin:0">🚫 Désactivation définitive</h1>
      </div>
      <div class="content">
        <p>Bonjour <strong>${driverName}</strong>,</p>
        <p>Nous vous informons que suite à notre examen, votre compte chauffeur sur la plateforme Medjira a été <strong>désactivé définitivement</strong>.</p>
        <div class="reason-box">
          <strong>Motif de la désactivation :</strong>
          <p style="margin: 10px 0 0 0;">${reason || 'Violation grave des conditions d\'utilisation.'}</p>
        </div>
        <div class="alert">
          <strong>🚫 Information importante :</strong>
          <p style="margin: 5px 0 0 0;">Votre accès aux services Medjira est révoqué de manière permanente.</p>
        </div>
        <p>Si vous estimez qu'il s'agit d'une erreur administrative, veuillez contacter notre support : <strong>support@medjira.com</strong></p>
        <p>Cordialement,<br>L'équipe Medjira</p>
      </div>
      <div class="footer">
        &copy; ${new Date().getFullYear()} Medjira. Tous droits réservés.
      </div>
    </div>
  </body>
  </html>
`;

export const getReactivationTemplate = (driverName: string) => `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <style>
      body { font-family: 'Inter', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
      .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; }
      .header { background-color: #10b981; color: white; padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0; }
      .content { padding: 30px; background-color: #ffffff; }
      .button { display: inline-block; padding: 14px 28px; background-color: #10b981; color: white !important; text-decoration: none; border-radius: 6px; margin-top: 25px; font-weight: bold; }
      .success { background-color: #d1fae5; border-left: 4px solid #10b981; padding: 20px; margin: 25px 0; border-radius: 0 4px 4px 0; }
      .footer { padding: 20px; text-align: center; font-size: 12px; color: #888; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1 style="margin:0"> Votre compte est réactivé !</h1>
      </div>
      <div class="content">
        <p>Bonjour <strong>${driverName}</strong>,</p>
        <p>Bonne nouvelle ! Après examen de votre situation, votre compte chauffeur sur la plateforme Medjira a été <strong>réactivé</strong>.</p>
        <div class="success">
          <strong> Accès rétabli :</strong>
          <p style="margin: 10px 0 0 0;">Vous pouvez à nouveau vous connecter et reprendre vos activités immédiatemment.</p>
        </div>
        <div style="text-align: center;">
          <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/driver/login" class="button">
            Reprendre la route
          </a>
        </div>
        <p style="margin-top: 30px;">Merci de votre patience et bienvenue de nouveau sur Medjira !</p>
        <p>Cordialement,<br>L'équipe Medjira</p>
      </div>
      <div class="footer">
        &copy; ${new Date().getFullYear()} Medjira. Tous droits réservés.
      </div>
    </div>
  </body>
  </html>
`;
