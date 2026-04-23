import { NextRequest, NextResponse } from 'next/server';
import { sendDriverStatusEmail } from '@/lib/email-service';
import { adminAuth, adminDb } from '@/config/firebase-admin';
import { z } from 'zod';

const EmailPayloadSchema = z.object({
  to: z.string().email(),
  type: z.enum(['approval', 'rejection', 'suspension', 'deactivation', 'reactivation']),
  driverName: z.string().min(1),
  reason: z.string().optional(),
});

/**
 * API Route pour envoyer des emails aux chauffeurs
 */
export async function POST(request: NextRequest) {
  try {
    if (!adminAuth || !adminDb) {
      return NextResponse.json({ error: 'Firebase Admin SDK non configuré.' }, { status: 503 });
    }

    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });
    }

    let uid: string;
    try {
      const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ error: 'Token invalide ou expiré.' }, { status: 401 });
    }

    const adminSnapshot = await adminDb.collection('admins').where('userId', '==', uid).limit(1).get();
    if (adminSnapshot.empty) {
      return NextResponse.json({ error: 'Accès non autorisé.' }, { status: 403 });
    }

    const body = await request.json();
    
    // Validation Zod
    const result = EmailPayloadSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: result.error.format() },
        { status: 400 }
      );
    }

    const { to, type, driverName, reason } = result.data;

    // Envoyer l'email via le service centralisé
    const info = await sendDriverStatusEmail({
      to,
      driverName,
      type,
      reason,
    });
    
    console.log(' Email envoyé via API:', {
      messageId: info.messageId,
      to,
      type,
    });

    return NextResponse.json({
      success: true,
      message: 'Email envoyé avec succès',
      messageId: info.messageId,
    });
  } catch (error: unknown) {
    console.error('Erreur API send-email:', error);

    return NextResponse.json(
      { error: 'Erreur lors de l\'envoi de l\'email' },
      { status: 500 }
    );
  }
}

