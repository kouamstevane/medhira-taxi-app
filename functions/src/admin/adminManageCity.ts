import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { requireAdmin } from './_shared.js';
import { enforceRateLimit } from '../utils/rateLimiter.js';

const ManageCitySchema = z.object({
  action: z.enum(['activate', 'deactivate', 'create', 'update_zones']),
  cityId: z
    .string()
    .min(1)
    .regex(
      /^[a-zA-Z0-9-]+$/,
      'cityId doit contenir uniquement des caractères alphanumériques et des tirets',
    ),
  name: z.string().optional(),
  country: z.string().optional(),
  currency: z.string().optional(),
  zones: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        polygon: z.array(
          z.object({
            lat: z.number(),
            lng: z.number(),
          }),
        ),
      }),
    )
    .optional(),
});

export const adminManageCity = onCall(
  { region: 'europe-west1' },
  async (request: CallableRequest<unknown>) => {
    const uid = await requireAdmin(request);

    await enforceRateLimit({
      identifier: uid,
      bucket: 'admin:manageCity',
      limit: 30,
      windowSec: 60,
    });

    const parsed = ManageCitySchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError(
        'invalid-argument',
        'Données invalides',
        parsed.error.flatten(),
      );
    }
    const body = parsed.data;
    const now = admin.firestore.FieldValue.serverTimestamp();

    switch (body.action) {
      case 'activate':
        await admin
          .firestore()
          .collection('cities')
          .doc(body.cityId)
          .update({ isActive: true, updatedAt: now });
        break;
      case 'deactivate':
        await admin
          .firestore()
          .collection('cities')
          .doc(body.cityId)
          .update({ isActive: false, updatedAt: now });
        break;
      case 'create':
        await admin.firestore().collection('cities').doc(body.cityId).set({
          cityId: body.cityId,
          name: body.name ?? body.cityId,
          country: body.country ?? 'CA',
          currency: body.currency ?? 'CAD',
          isActive: false,
          createdAt: now,
          updatedAt: now,
        });
        break;
      case 'update_zones':
        if (!body.zones || body.zones.length === 0) {
          throw new HttpsError(
            'invalid-argument',
            "zones est requis pour l'action update_zones",
          );
        }
        await admin
          .firestore()
          .collection('cities')
          .doc(body.cityId)
          .update({
            zones: body.zones,
            updatedAt: now,
          });
        break;
    }

    return { success: true, action: body.action };
  },
);
