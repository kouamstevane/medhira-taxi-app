/**
 * Seeder one-shot : créer le document cities/edmonton.
 * Usage: npx ts-node scripts/seed-cities.ts
 */
import * as admin from 'firebase-admin'

if (!admin.apps.length) admin.initializeApp()
const db = admin.firestore()

async function seed() {
  const ref = db.collection('cities').doc('edmonton')
  const snap = await ref.get()
  if (snap.exists) {
    console.log('✅ cities/edmonton existe déjà — skip')
    return
  }
  await ref.set({
    cityId: 'edmonton',
    name: 'Edmonton',
    country: 'CA',
    currency: 'CAD',
    isActive: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  })
  console.log('✅ cities/edmonton créé avec isActive: true')
}

seed().catch(err => { console.error('Erreur:', err); process.exit(1) })
