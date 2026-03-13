/**
 * API Route : Gestion administrative des chauffeurs
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/config/firebase-admin';
import { sendDriverStatusEmail } from '@/lib/email-service';
import { z } from 'zod';

// Schéma de validation pour les actions admin
const ManageDriverSchema = z.object({
  action: z.enum(['approve', 'reject', 'suspend', 'unsuspend', 'deactivate', 'reactivate', 'delete']),
  driverId: z.string().min(1),
  adminUid: z.string().min(1),
  reason: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    // Vérifier que Firebase Admin est initialisé
    if (!adminDb) {
      return NextResponse.json(
        { error: 'Firebase Admin SDK non configuré.' },
        { status: 503 }
      );
    }

    const body = await request.json();
    
    // Validation Zod
    const result = ManageDriverSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: result.error.format() },
        { status: 400 }
      );
    }

    const { action, driverId, reason, adminUid } = result.data;

    // Vérifier que l'utilisateur est bien un admin
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

    const driverRef = adminDb.collection('drivers').doc(driverId);
    const driverDoc = await driverRef.get();
    
    if (!driverDoc.exists) {
      return NextResponse.json(
        { error: 'Chauffeur introuvable' },
        { status: 404 }
      );
    }

    const timestamp = new Date();
    const driverData = driverDoc.data();
    const driverEmail = driverData?.email;
    const driverName = `${driverData?.firstName || ''} ${driverData?.lastName || ''}`.trim() || 'Chauffeur';

    /**
     * Helper pour notifier le chauffeur par email
     */
    const notifyDriver = async (type: 'approval' | 'rejection' | 'suspension' | 'deactivation' | 'reactivation', emailReason?: string) => {
      if (!driverEmail) return;
      try {
        await sendDriverStatusEmail({
          to: driverEmail,
          driverName,
          type,
          reason: emailReason
        });
      } catch (error) {
        console.error(`❌ Erreur notification email (${type}):`, error);
      }
    };

    switch (action) {
      case 'approve':
        await driverRef.update({
          status: 'approved',
          isAvailable: true,
          isActive: true, // S'assurer qu'il est actif par défaut
          approvedAt: timestamp,
          approvedBy: adminUid,
          updatedAt: timestamp,
        });

        await notifyDriver('approval');
        return NextResponse.json({ success: true, message: 'Chauffeur approuvé avec succès' });

      case 'reject':
        if (!reason) return NextResponse.json({ error: 'Raison requise pour le refus' }, { status: 400 });
        
        await driverRef.update({
          status: 'rejected',
          rejectionReason: reason,
          rejectedAt: timestamp,
          rejectedBy: adminUid,
          updatedAt: timestamp,
        });

        await notifyDriver('rejection', reason);
        return NextResponse.json({ success: true, message: 'Chauffeur refusé' });

      case 'suspend':
        if (!reason) return NextResponse.json({ error: 'Raison requise' }, { status: 400 });
        
        await driverRef.update({
          isSuspended: true,
          suspensionReason: reason,
          suspendedAt: timestamp,
          suspendedBy: adminUid,
          status: 'offline',
          isAvailable: false,
          updatedAt: timestamp,
        });

        await notifyDriver('suspension', reason);
        return NextResponse.json({ success: true, message: 'Chauffeur suspendu' });

      case 'unsuspend':
        await driverRef.update({
          isSuspended: false,
          suspensionReason: null,
          suspendedAt: null,
          suspendedBy: null,
          updatedAt: timestamp,
        });

        await notifyDriver('reactivation');
        return NextResponse.json({ success: true, message: 'Chauffeur réactivé' });

      case 'deactivate':
        if (!reason) return NextResponse.json({ error: 'Raison requise' }, { status: 400 });
        
        await driverRef.update({
          isActive: false,
          isSuspended: true,
          suspensionReason: reason,
          suspendedAt: timestamp,
          suspendedBy: adminUid,
          status: 'offline',
          isAvailable: false,
          updatedAt: timestamp,
        });

        await notifyDriver('deactivation', reason);
        return NextResponse.json({ success: true, message: 'Chauffeur désactivé' });

      case 'reactivate':
        await driverRef.update({
          isActive: true,
          isSuspended: false,
          suspensionReason: null,
          suspendedAt: null,
          suspendedBy: null,
          updatedAt: timestamp,
        });

        await notifyDriver('reactivation');
        return NextResponse.json({ success: true, message: 'Chauffeur réactivé' });

      case 'delete':
        const { driverDeletionService } = await import('@/utils/driver-deletion.service');
        const deletionResult = await driverDeletionService.deleteDriverCompletely(driverId, adminUid);
        
        if (!deletionResult.success) {
          return NextResponse.json({ 
            success: false, 
            message: 'Erreur lors de la suppression complète',
            errors: deletionResult.errors 
          }, { status: 500 });
        }
        
        return NextResponse.json({ success: true, message: 'Chauffeur et toutes ses données supprimés avec succès' });

      default:
        return NextResponse.json({ error: 'Action non supportée' }, { status: 400 });
    }
  } catch (error: any) {
    console.error('❌ Erreur API manage-driver:', error);
    return NextResponse.json(
      { error: 'Erreur serveur', details: error.message },
      { status: 500 }
    );
  }
}
