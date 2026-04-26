import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { requireAdmin } from './_shared.js';
import { enforceRateLimit } from '../utils/rateLimiter.js';
import { deleteDriverCompletely } from './driverDeletion.js';
import { sendDriverStatusEmail } from '../email-service.js';

const resendApiKey = defineSecret('RESEND_API_KEY');

const ManageDriverSchema = z.object({
  action: z.enum([
    'approve',
    'reject',
    'suspend',
    'unsuspend',
    'deactivate',
    'reactivate',
    'delete',
    'approve_document',
    'reject_document',
    'delete_rating',
  ]),
  driverId: z.string().min(1),
  reason: z.string().optional(),
  rejectionCode: z.string().optional(),
  documentKey: z.string().optional(),
  documentRejectionReason: z.string().optional(),
});

export const adminManageDriver = onCall(
  { region: 'europe-west1', secrets: [resendApiKey] },
  async (request: CallableRequest<unknown>) => {
    const uid = await requireAdmin(request);

    await enforceRateLimit({
      identifier: uid,
      bucket: 'admin:manageDriver',
      limit: 30,
      windowSec: 60,
    });

    const parsed = ManageDriverSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError(
        'invalid-argument',
        'Données invalides',
        parsed.error.format(),
      );
    }

    const {
      action,
      driverId,
      reason,
      rejectionCode,
      documentKey,
      documentRejectionReason,
    } = parsed.data;

    const driverRef = admin.firestore().collection('drivers').doc(driverId);
    const driverDoc = await driverRef.get();

    if (!driverDoc.exists) {
      throw new HttpsError('not-found', 'Chauffeur introuvable');
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    const driverData = driverDoc.data();
    const driverEmail = driverData?.email as string | undefined;
    const driverName =
      `${driverData?.firstName || ''} ${driverData?.lastName || ''}`.trim() ||
      'Chauffeur';

    const notifyDriver = async (
      type:
        | 'approval'
        | 'rejection'
        | 'suspension'
        | 'deactivation'
        | 'reactivation',
      emailReason?: string,
    ) => {
      if (!driverEmail) return;
      try {
        await sendDriverStatusEmail({
          to: driverEmail,
          driverName,
          type,
          reason: emailReason,
          apiKey: resendApiKey.value(),
        });
      } catch (error) {
        console.error(`Erreur notification email (${type}):`, error);
      }
    };

    switch (action) {
      case 'approve':
        await driverRef.update({
          status: 'approved',
          isAvailable: true,
          isActive: true,
          approvedAt: now,
          approvedBy: uid,
          updatedAt: now,
        });
        await notifyDriver('approval');
        return { success: true, message: 'Chauffeur approuvé avec succès' };

      case 'reject':
        if (!reason)
          throw new HttpsError(
            'invalid-argument',
            'Raison requise pour le refus',
          );
        await driverRef.update({
          status: 'rejected',
          rejectionReason: reason,
          rejectionCode: rejectionCode ?? 'R005',
          rejectedAt: now,
          rejectedBy: uid,
          updatedAt: now,
        });
        await notifyDriver('rejection', reason);
        return { success: true, message: 'Chauffeur refusé' };

      case 'suspend':
        if (!reason)
          throw new HttpsError('invalid-argument', 'Raison requise');
        await driverRef.update({
          isSuspended: true,
          suspensionReason: reason,
          suspendedAt: now,
          suspendedBy: uid,
          status: 'suspended',
          isAvailable: false,
          updatedAt: now,
        });
        await notifyDriver('suspension', reason);
        return { success: true, message: 'Chauffeur suspendu' };

      case 'unsuspend':
        await driverRef.update({
          isSuspended: false,
          suspensionReason: null,
          suspendedAt: null,
          suspendedBy: null,
          status: 'approved',
          isAvailable: true,
          updatedAt: now,
        });
        await notifyDriver('reactivation');
        return { success: true, message: 'Chauffeur réactivé' };

      case 'deactivate':
        if (!reason)
          throw new HttpsError('invalid-argument', 'Raison requise');
        await driverRef.update({
          isActive: false,
          isSuspended: true,
          suspensionReason: reason,
          suspendedAt: now,
          suspendedBy: uid,
          status: 'suspended',
          isAvailable: false,
          updatedAt: now,
        });
        await notifyDriver('deactivation', reason);
        return { success: true, message: 'Chauffeur désactivé' };

      case 'reactivate':
        await driverRef.update({
          isActive: true,
          isSuspended: false,
          suspensionReason: null,
          suspendedAt: null,
          suspendedBy: null,
          status: 'approved',
          isAvailable: true,
          updatedAt: now,
        });
        await notifyDriver('reactivation');
        return { success: true, message: 'Chauffeur réactivé' };

      case 'delete': {
        const deletionResult = await deleteDriverCompletely(driverId, uid);
        if (!deletionResult.success) {
          return {
            success: false,
            message: 'Erreur lors de la suppression complète',
            errors: deletionResult.errors,
          };
        }
        return {
          success: true,
          message: 'Chauffeur et toutes ses données supprimés avec succès',
        };
      }

      case 'approve_document': {
        if (!documentKey)
          throw new HttpsError(
            'invalid-argument',
            'documentKey requis.',
          );
        await driverRef.update({
          [`documents.${documentKey}.status`]: 'approved',
          [`documents.${documentKey}.approvedAt`]: now,
          [`documents.${documentKey}.approvedBy`]: uid,
          updatedAt: now,
        });
        return {
          success: true,
          action: 'approve_document',
          documentKey,
        };
      }

      case 'reject_document': {
        if (!documentKey)
          throw new HttpsError(
            'invalid-argument',
            'documentKey requis.',
          );
        await driverRef.update({
          [`documents.${documentKey}.status`]: 'rejected',
          [`documents.${documentKey}.rejectionReason`]:
            documentRejectionReason ?? reason ?? 'Document non conforme',
          [`documents.${documentKey}.rejectedAt`]: now,
          [`documents.${documentKey}.rejectedBy`]: uid,
          updatedAt: now,
        });
        return {
          success: true,
          action: 'reject_document',
          documentKey,
        };
      }

      case 'delete_rating': {
        if (!documentKey)
          throw new HttpsError(
            'invalid-argument',
            'ratingId requis.',
          );
        await admin
          .firestore()
          .collection('driver_ratings')
          .doc(documentKey)
          .delete();
        return { success: true, action: 'delete_rating' };
      }

      default:
        throw new HttpsError('invalid-argument', 'Action non supportée');
    }
  },
);
