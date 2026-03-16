import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/config/firebase-admin';
import { z } from 'zod';

const ManageUserSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(['client', 'restaurateur', 'chauffeur', 'admin']),
});

export async function POST(request: NextRequest) {
  try {
    if (!adminDb || !adminAuth) {
      return NextResponse.json(
        { error: 'Firebase Admin SDK non configuré.' },
        { status: 503 }
      );
    }

    // Vérifier le token d'authentification Firebase
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Token d\'authentification requis.' }, { status: 401 });
    }
    let adminUid: string;
    try {
      const decodedToken = await adminAuth.verifyIdToken(authHeader.slice(7));
      adminUid = decodedToken.uid;
    } catch {
      return NextResponse.json({ error: 'Token invalide ou expiré.' }, { status: 401 });
    }

    const body = await request.json();
    const result = ManageUserSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: result.error.format() },
        { status: 400 }
      );
    }

    const { userId, role } = result.data;

    // 1. Vérifier les permissions de l'admin
    const adminDoc = await adminDb.collection('admins').doc(adminUid).get();
    if (!adminDoc.exists) {
      const adminSnapshot = await adminDb.collection('admins')
        .where('userId', '==', adminUid)
        .limit(1)
        .get();

      if (adminSnapshot.empty) {
        return NextResponse.json(
          { error: 'Accès non autorisé.' },
          { status: 403 }
        );
      }
    }

    // 2. Mettre à jour l'utilisateur
    const userRef = adminDb.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return NextResponse.json(
        { error: 'Utilisateur introuvable' },
        { status: 404 }
      );
    }

    await userRef.update({
      userType: role, // In our types it's userType, but sometimes called role in UI
      updatedAt: new Date(),
      lastModifiedBy: adminUid
    });

    return NextResponse.json({ 
      success: true, 
      message: `Rôle de l'utilisateur mis à jour vers ${role}` 
    });

  } catch (error: any) {
    console.error('Erreur API manage-user:', error);
    return NextResponse.json(
      { error: 'Erreur serveur', details: error.message },
      { status: 500 }
    );
  }
}
