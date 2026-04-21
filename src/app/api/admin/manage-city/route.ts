import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import * as admin from 'firebase-admin'
import { adminDb, adminAuth } from '@/config/firebase-admin'

const ManageCitySchema = z.object({
  action: z.enum(['activate', 'deactivate', 'create', 'update_zones']),
  cityId: z.string().min(1).regex(/^[a-zA-Z0-9-]+$/, 'cityId doit contenir uniquement des caractères alphanumériques et des tirets'),
  name: z.string().optional(),
  country: z.string().optional(),
  currency: z.string().optional(),
  zones: z.array(z.object({
    id: z.string(),
    name: z.string(),
    polygon: z.array(z.object({
      lat: z.number(),
      lng: z.number(),
    })),
  })).optional(),
})

export async function POST(request: NextRequest) {
  try {
    if (!adminDb || !adminAuth) {
      return NextResponse.json({ error: 'Firebase Admin SDK non configuré.' }, { status: 503 })
    }

    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    let adminUid: string;
    try {
      const decodedToken = await adminAuth.verifyIdToken(authHeader.slice(7));
      adminUid = decodedToken.uid;
    } catch {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const adminDoc = await adminDb.collection('admins').doc(adminUid).get();
    if (!adminDoc.exists) {
      const adminSnapshot = await adminDb.collection('admins')
        .where('userId', '==', adminUid)
        .limit(1)
        .get();
      if (adminSnapshot.empty) {
        return NextResponse.json({ error: 'Accès non autorisé.' }, { status: 403 });
      }
    }

    const parsed = ManageCitySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Données invalides', details: parsed.error.flatten() }, { status: 400 });
    }
    const body = parsed.data;
    const now = admin.firestore.FieldValue.serverTimestamp()

    switch (body.action) {
      case 'activate':
        await adminDb.collection('cities').doc(body.cityId).update({ isActive: true, updatedAt: now })
        break
      case 'deactivate':
        await adminDb.collection('cities').doc(body.cityId).update({ isActive: false, updatedAt: now })
        break
      case 'create':
        await adminDb.collection('cities').doc(body.cityId).set({
          cityId: body.cityId,
          name: body.name ?? body.cityId,
          country: body.country ?? 'CA',
          currency: body.currency ?? 'CAD',
          isActive: false,
          createdAt: now,
          updatedAt: now,
        })
        break
      case 'update_zones':
        if (!body.zones || body.zones.length === 0) {
          return NextResponse.json({ error: 'zones est requis pour l\'action update_zones' }, { status: 400 });
        }
        await adminDb.collection('cities').doc(body.cityId).update({
          zones: body.zones,
          updatedAt: now,
        })
        break
    }

    return NextResponse.json({ success: true, action: body.action })
  } catch (error: unknown) {
    console.error('Erreur API manage-city:', error);
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    );
  }
}