/**
 * API Route : Gestion administrative des restaurants
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/config/firebase-admin';
import { z } from 'zod';

// Schéma de validation pour les actions admin
const ManageRestaurantSchema = z.object({
  action: z.enum(['approve', 'reject', 'suspend', 'unsuspend']),
  restaurantId: z.string().min(1),
  reason: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    // Vérifier que Firebase Admin est initialisé
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

    // Validation Zod
    const result = ManageRestaurantSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: result.error.format() },
        { status: 400 }
      );
    }

    const { action, restaurantId, reason } = result.data;

    // Vérifier que l'utilisateur est bien un admin
    const adminDoc = await adminDb.collection('admins').doc(adminUid).get();

    if (!adminDoc.exists) {
      const adminSnapshot = await adminDb.collection('admins')
        .where('userId', '==', adminUid)
        .limit(1)
        .get();

      if (adminSnapshot.empty) {
        return NextResponse.json(
          { error: 'Accès non autorisé. Vous n\'êtes pas reconnu comme administrateur.' },
          { status: 403 }
        );
      }
    }

    const restaurantRef = adminDb.collection('restaurants').doc(restaurantId);
    const restaurantDoc = await restaurantRef.get();
    
    if (!restaurantDoc.exists) {
      return NextResponse.json(
        { error: 'Restaurant introuvable' },
        { status: 404 }
      );
    }

    const timestamp = new Date();
    const restaurantData = restaurantDoc.data();
    const ownerId = restaurantData?.ownerId;

    switch (action) {
      case 'approve':
        await restaurantRef.update({
          status: 'approved',
          approvedAt: timestamp,
          approvedBy: adminUid,
          updatedAt: timestamp,
        });
        
        // Mettre à jour le type d'utilisateur de l'owner vers 'restaurateur'
        if (ownerId) {
          try {
            await adminDb.collection('users').doc(ownerId).update({
              userType: 'restaurateur'
            });
          } catch (e) {
            console.error('Erreur lors de la mise à jour du type utilisateur:', e);
            // On continue quand même, l'approbation du restaurant est le plus important
          }
        }

        return NextResponse.json({ 
          success: true, 
          message: 'Restaurant approuvé avec succès' 
        });

      case 'reject':
        if (!reason) {
          return NextResponse.json({ error: 'Raison requise pour le refus' }, { status: 400 });
        }
        
        await restaurantRef.update({
          status: 'rejected',
          rejectionReason: reason,
          rejectedAt: timestamp,
          rejectedBy: adminUid,
          updatedAt: timestamp,
        });

        return NextResponse.json({ success: true, message: 'Restaurant refusé' });

      case 'suspend':
        if (!reason) {
          return NextResponse.json({ error: 'Raison requise pour la suspension' }, { status: 400 });
        }
        
        await restaurantRef.update({
          status: 'suspended',
          suspensionReason: reason,
          suspendedAt: timestamp,
          suspendedBy: adminUid,
          updatedAt: timestamp,
        });

        return NextResponse.json({ success: true, message: 'Restaurant suspendu' });

      case 'unsuspend':
        await restaurantRef.update({
          status: 'approved',
          suspensionReason: null,
          suspendedAt: null,
          suspendedBy: null,
          updatedAt: timestamp,
        });

        return NextResponse.json({ success: true, message: 'Restaurant réactivé' });

      default:
        return NextResponse.json({ error: 'Action non supportée' }, { status: 400 });
    }
  } catch (error: unknown) {
    console.error('Erreur API manage-restaurant:', error);
    return NextResponse.json(
      { error: 'Erreur serveur', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
