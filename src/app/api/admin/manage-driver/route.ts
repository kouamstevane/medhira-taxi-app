/**
 * API Route : Gestion administrative des chauffeurs
 * 
 * Actions disponibles :
 * - suspend : Suspendre un chauffeur
 * - unsuspend : Réactiver un chauffeur suspendu
 * - deactivate : Désactiver définitivement
 * - reactivate : Réactiver un compte désactivé
 * - delete : Supprimer définitivement
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/config/firebase-admin';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, driverId, reason, adminUid } = body;

    // Validation
    if (!action || !driverId || !adminUid) {
      return NextResponse.json(
        { error: 'Paramètres manquants: action, driverId et adminUid sont requis' },
        { status: 400 }
      );
    }

    // Vérifier que l'utilisateur est bien un admin
    const adminRef = adminDb.collection('admins').doc(adminUid);
    const adminDoc = await adminRef.get();

    if (!adminDoc.exists) {
      // Fallback: chercher par userId
      const adminSnapshot = await adminDb.collection('admins')
        .where('userId', '==', adminUid)
        .limit(1)
        .get();

      if (adminSnapshot.empty) {
        return NextResponse.json(
          { error: 'Accès non autorisé. Vous devez être administrateur.' },
          { status: 403 }
        );
      }
    }

    const driverRef = adminDb.collection('drivers').doc(driverId);
    const timestamp = new Date();

    // Récupérer les informations du chauffeur pour l'email
    const driverDoc = await driverRef.get();
    if (!driverDoc.exists) {
      return NextResponse.json(
        { error: 'Chauffeur introuvable' },
        { status: 404 }
      );
    }

    const driverData = driverDoc.data();
    const driverEmail = driverData?.email;
    const driverName = `${driverData?.firstName || ''} ${driverData?.lastName || ''}`.trim() || 'Chauffeur';

    // Fonction helper pour envoyer un email
    const sendEmail = async (type: string, reason?: string) => {
      if (!driverEmail) {
        console.warn('⚠️ Pas d\'email pour le chauffeur, notification non envoyée');
        return;
      }

      try {
        const emailResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/admin/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: driverEmail,
            type,
            driverName,
            reason,
          }),
        });

        if (!emailResponse.ok) {
          console.error('❌ Erreur envoi email:', await emailResponse.text());
        } else {
          console.log(`✅ Email de ${type} envoyé à ${driverEmail}`);
        }
      } catch (emailError) {
        console.error('❌ Erreur envoi email:', emailError);
        // Ne pas bloquer l'action si l'email échoue
      }
    };

    switch (action) {
      case 'suspend':
        if (!reason) {
          return NextResponse.json(
            { error: 'La raison de la suspension est requise' },
            { status: 400 }
          );
        }
        await driverRef.update({
          isSuspended: true,
          suspensionReason: reason,
          suspendedAt: timestamp,
          suspendedBy: adminUid,
          status: 'offline',
          isAvailable: false,
          updatedAt: timestamp,
        });
        
        // Envoyer email de notification
        await sendEmail('suspension', reason);
        
        return NextResponse.json({ 
          success: true, 
          message: 'Chauffeur suspendu avec succès' 
        });

      case 'unsuspend':
        await driverRef.update({
          isSuspended: false,
          suspensionReason: null,
          suspendedAt: null,
          suspendedBy: null,
          updatedAt: timestamp,
        });
        
        // Envoyer email de réactivation
        await sendEmail('reactivation');
        
        return NextResponse.json({ 
          success: true, 
          message: 'Chauffeur réactivé avec succès' 
        });

      case 'deactivate':
        if (!reason) {
          return NextResponse.json(
            { error: 'La raison de la désactivation est requise' },
            { status: 400 }
          );
        }
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
        
        // Envoyer email de désactivation
        await sendEmail('deactivation', reason);
        
        return NextResponse.json({ 
          success: true, 
          message: 'Chauffeur désactivé définitivement' 
        });

      case 'reactivate':
        await driverRef.update({
          isActive: true,
          isSuspended: false,
          suspensionReason: null,
          suspendedAt: null,
          suspendedBy: null,
          updatedAt: timestamp,
        });
        
        // Envoyer email de réactivation
        await sendEmail('reactivation');
        
        return NextResponse.json({ 
          success: true, 
          message: 'Chauffeur réactivé avec succès' 
        });

      case 'delete':
        // Pas d'email pour la suppression (le compte sera supprimé)
        await driverRef.delete();
        
        // Optionnel : Supprimer aussi l'utilisateur Firebase Auth
        // Décommentez si vous voulez supprimer complètement l'accès
        /*
        try {
          const driverDoc = await driverRef.get();
          const driverData = driverDoc.data();
          if (driverData?.userId) {
            await adminAuth.deleteUser(driverData.userId);
          }
        } catch (authError) {
          console.error('Erreur suppression auth:', authError);
        }
        */
        
        return NextResponse.json({ 
          success: true, 
          message: 'Chauffeur supprimé définitivement' 
        });

      default:
        return NextResponse.json(
          { error: `Action inconnue: ${action}` },
          { status: 400 }
        );
    }
  } catch (error: unknown) {
    console.error('Erreur API manage-driver:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
    return NextResponse.json(
      { error: 'Erreur serveur', details: errorMessage },
      { status: 500 }
    );
  }
}
