import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

/**
 * API Route pour envoyer des emails d'approbation/refus aux chauffeurs
 * 
 * Configuration requise dans .env.local :
 * - SMTP_HOST (ex: smtp.gmail.com)
 * - SMTP_PORT (ex: 587 ou 465)
 * - SMTP_USER (votre email)
 * - SMTP_PASS (votre mot de passe ou app password)
 * - SMTP_FROM (email expéditeur, optionnel)
 */

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { to, type, driverName, reason } = body;

    // Validation des paramètres
    if (!to || !type || !driverName) {
      return NextResponse.json(
        { error: 'Paramètres manquants: to, type et driverName sont requis' },
        { status: 400 }
      );
    }

    // Validation de l'email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      return NextResponse.json(
        { error: 'Adresse email invalide' },
        { status: 400 }
      );
    }

    // TODO: Intégrer avec un service d'email réel
    // Exemples d'intégration ci-dessous

    let subject = '';
    let htmlContent = '';

    if (type === 'approval') {
      subject = 'Votre compte chauffeur Medjira a été approuvé !';
      htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #f29200; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background-color: #f9f9f9; }
            .button { display: inline-block; padding: 12px 24px; background-color: #f29200; color: white; text-decoration: none; border-radius: 5px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎉 Félicitations ${driverName} !</h1>
            </div>
            <div class="content">
              <p>Bonjour ${driverName},</p>
              <p>Nous avons le plaisir de vous informer que votre demande d'inscription en tant que chauffeur sur la plateforme Medjira a été <strong>approuvée</strong> !</p>
              <p>Vous pouvez maintenant vous connecter à votre compte et commencer à recevoir des commandes.</p>
              <p>
                <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/driver/login" class="button">
                  Se connecter maintenant
                </a>
              </p>
              <p>Bienvenue dans l'équipe Medjira !</p>
              <p>Cordialement,<br>L'équipe Medjira</p>
            </div>
          </div>
        </body>
        </html>
      `;
    } else if (type === 'rejection') {
      subject = 'Décision concernant votre demande d\'inscription Medjira';
      htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #dc2626; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background-color: #f9f9f9; }
            .reason-box { background-color: #fee2e2; border-left: 4px solid #dc2626; padding: 15px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Décision concernant votre demande</h1>
            </div>
            <div class="content">
              <p>Bonjour ${driverName},</p>
              <p>Nous avons examiné votre demande d'inscription en tant que chauffeur sur la plateforme Medjira.</p>
              <p>Malheureusement, votre demande n'a pas pu être approuvée pour le moment.</p>
              <div class="reason-box">
                <strong>Raison du refus :</strong>
                <p>${reason || 'Documents incomplets ou non conformes'}</p>
              </div>
              <p>Si vous souhaitez contester cette décision ou soumettre une nouvelle demande avec des documents complémentaires, n'hésitez pas à nous contacter.</p>
              <p>Cordialement,<br>L'équipe Medjira</p>
            </div>
          </div>
        </body>
        </html>
      `;
    }

    // Vérifier que les variables d'environnement SMTP sont configurées
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = process.env.SMTP_PORT;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    if (!smtpHost || !smtpPort || !smtpUser || !smtpPass) {
      console.error('❌ Configuration SMTP manquante:', {
        SMTP_HOST: !!smtpHost,
        SMTP_PORT: !!smtpPort,
        SMTP_USER: !!smtpUser,
        SMTP_PASS: !!smtpPass,
      });
      
      return NextResponse.json(
        { 
          error: 'Configuration SMTP manquante. Veuillez configurer SMTP_HOST, SMTP_PORT, SMTP_USER et SMTP_PASS dans .env.local',
          details: 'Consultez ADMIN_SETUP.md pour la configuration'
        },
        { status: 500 }
      );
    }

    // Configuration du port (587 pour TLS, 465 pour SSL)
    const port = parseInt(smtpPort, 10);
    const isSecure = port === 465;

    // Créer le transporteur Nodemailer
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: port,
      secure: isSecure, // true pour 465, false pour les autres ports
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
      // Pour les ports non-SSL (587), activer TLS
      ...(port === 587 && {
        requireTLS: true,
        tls: {
          rejectUnauthorized: false, // Pour les certificats auto-signés (développement)
        },
      }),
    });

    // Vérifier la connexion SMTP avant d'envoyer
    try {
      await transporter.verify();
      console.log('✅ Connexion SMTP vérifiée avec succès');
    } catch (verifyError: any) {
      console.error('❌ Erreur vérification SMTP:', verifyError);
      return NextResponse.json(
        { 
          error: 'Impossible de se connecter au serveur SMTP',
          details: verifyError.message || 'Vérifiez vos identifiants SMTP et que le serveur est accessible'
        },
        { status: 500 }
      );
    }

    // Envoyer l'email
    // Note: Gmail remplace automatiquement l'adresse "From" par SMTP_USER pour des raisons de sécurité
    // Pour utiliser une adresse différente, utilisez un service d'email professionnel (SendGrid, Mailgun, etc.)
    const fromAddress = process.env.SMTP_FROM || smtpUser;
    
    // Format "Name <email>" pour améliorer l'affichage même si Gmail remplace l'email
    const mailOptions = {
      from: `Medjira <${smtpUser}>`, // Gmail utilisera smtpUser mais affichera "Medjira"
      replyTo: fromAddress !== smtpUser ? fromAddress : undefined, // Reply-To si différent
      to: to,
      subject: subject,
      html: htmlContent,
    };

    console.log('📧 Envoi email:', {
      to,
      subject,
      type,
      driverName,
      from: mailOptions.from,
    });

    const info = await transporter.sendMail(mailOptions);
    
    console.log('✅ Email envoyé avec succès:', {
      messageId: info.messageId,
      to,
      type,
    });

    return NextResponse.json({
      success: true,
      message: 'Email envoyé avec succès',
      messageId: info.messageId,
    });
  } catch (error: any) {
    console.error('❌ Erreur envoi email:', error);
    
    // Messages d'erreur plus détaillés
    let errorMessage = 'Erreur lors de l\'envoi de l\'email';
    let errorDetails = error.message;

    if (error.code === 'EAUTH') {
      errorMessage = 'Erreur d\'authentification SMTP';
      errorDetails = 'Vérifiez vos identifiants SMTP (SMTP_USER et SMTP_PASS)';
    } else if (error.code === 'ECONNECTION') {
      errorMessage = 'Impossible de se connecter au serveur SMTP';
      errorDetails = 'Vérifiez SMTP_HOST et SMTP_PORT, et que le serveur est accessible';
    } else if (error.code === 'ETIMEDOUT') {
      errorMessage = 'Timeout lors de la connexion SMTP';
      errorDetails = 'Le serveur SMTP ne répond pas. Vérifiez votre connexion internet et les paramètres SMTP';
    }

    return NextResponse.json(
      { 
        error: errorMessage,
        details: errorDetails,
        code: error.code || 'UNKNOWN',
      },
      { status: 500 }
    );
  }
}

