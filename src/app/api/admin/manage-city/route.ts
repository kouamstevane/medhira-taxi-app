import { NextResponse } from 'next/server'
import { z } from 'zod'
import * as admin from 'firebase-admin'
import { adminDb } from '@/config/firebase-admin'

const ManageCitySchema = z.object({
  action: z.enum(['activate', 'deactivate', 'create', 'update_zones']),
  cityId: z.string().min(1),
  name: z.string().optional(),
  country: z.string().optional(),
  currency: z.string().optional(),
})

export async function POST(request: Request) {
  if (!adminDb) {
    return NextResponse.json({ error: 'Firebase Admin SDK non configuré.' }, { status: 503 })
  }

  const body = ManageCitySchema.parse(await request.json())
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
  }

  return NextResponse.json({ success: true, action: body.action })
}
