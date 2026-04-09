// scripts/migrate-driver-documents.ts
/**
 * Script de migration one-shot (2026-04-07)
 * Usage:
 *   npx ts-node scripts/migrate-driver-documents.ts          # dry-run
 *   npx ts-node scripts/migrate-driver-documents.ts --write  # écriture réelle
 * Idempotent : skip si driverType déjà présent.
 */
import * as admin from 'firebase-admin'

const isDryRun = !process.argv.includes('--write')
if (!admin.apps.length) admin.initializeApp()
const db = admin.firestore()

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size))
  return chunks
}

interface OldDocuments {
  biometricPhoto?: string; licenseFront?: string; licenseBack?: string
  idFront?: string; idBack?: string; carRegistration?: string; techControl?: string
  insurance?: string; vehicleExterior?: string; vehicleInterior?: string
  [key: string]: string | undefined
}

function buildNewDocuments(old: OldDocuments, isApproved: boolean) {
  const status: 'approved' | 'pending' = isApproved ? 'approved' : 'pending'
  const now = admin.firestore.FieldValue.serverTimestamp()
  const entry = (url: string | undefined) => ({
    url: url || null,
    status: url ? status : 'not_submitted',
    submittedAt: url ? now : null,
    reviewedAt: url && isApproved ? now : null,
  })
  return {
    photoProfile:              entry(old.biometricPhoto),
    permitConduire:            entry(old.licenseFront),
    casierJudiciaire:          entry(undefined),
    historiqueConduire:        entry(undefined),
    preuvePermitTravail:       entry(old.idFront),
    plaqueImmatriculation:     entry(old.carRegistration),
    permitCommercial:          entry(undefined),
    plaqueImmatriculationCommerciale: entry(undefined),
    visiteTechniqueCommerciale: entry(old.techControl),
    certificatVille:           entry(undefined),
  }
}

async function migrateDrivers() {
  console.log(`\n Migration drivers — mode: ${isDryRun ? 'DRY-RUN' : 'ÉCRITURE'}\n`)
  const snap = await db.collection('drivers').get()
  console.log(` ${snap.size} drivers trouvés\n`)

  let migrated = 0, skipped = 0, errors = 0

  for (const docSnap of snap.docs) {
    const data = docSnap.data()
    if (data.driverType != null) { skipped++; continue }

    const isApproved = data.status === 'approved'
    const payload = {
      driverType: 'chauffeur',
      cityId: 'edmonton',
      vehicleType: 'voiture',
      documents: buildNewDocuments((data.documents || {}) as OldDocuments, isApproved),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }

    if (isDryRun) {
      console.log(`  [DRY] ${docSnap.id} — ${data.firstName} ${data.lastName}`)
    } else {
      try {
        await db.collection('audit_logs').add({
          event: 'driver_migration_2026_04_07',
          driverId: docSnap.id,
          previousDocuments: data.documents || {},
          migratedAt: admin.firestore.FieldValue.serverTimestamp(),
        })
        await db.collection('drivers').doc(docSnap.id).update(payload)
        migrated++
      } catch (err) {
        console.error(`  ${docSnap.id}:`, err)
        errors++
      }
    }
  }
  console.log(`\nDrivers — Migrés: ${migrated}, Skippés: ${skipped}, Erreurs: ${errors}`)
}

async function migrateCityId(collectionName: string) {
  const allDocs = await db.collection(collectionName).get()
  const toMigrate = allDocs.docs.filter(d => !d.data().cityId)
  console.log(`  ${collectionName}: ${toMigrate.length} docs sans cityId`)

  const batches = chunk(toMigrate, 500)
  for (const batch of batches) {
    const writeBatch = db.batch()
    batch.forEach(doc => writeBatch.update(doc.ref, { cityId: 'edmonton' }))
    if (!isDryRun) await writeBatch.commit()
  }

  if (collectionName === 'restaurants') {
    const noCounter = allDocs.docs.filter(d => d.data().orderCounter === undefined)
    console.log(`  restaurants: ${noCounter.length} docs sans orderCounter`)
    if (!isDryRun) {
      const b = db.batch()
      noCounter.forEach(doc => b.update(doc.ref, { orderCounter: 0 }))
      if (noCounter.length > 0) await b.commit()
    }
  }
}

async function seedSupportPhone() {
  const ref = db.collection('config').doc('support_phone')
  const snap = await ref.get()
  if (!snap.exists && !isDryRun) {
    await ref.set({ value: '+1-780-555-0199', updatedAt: admin.firestore.FieldValue.serverTimestamp() })
    console.log('  config/support_phone créé')
  }
}

async function main() {
  await migrateDrivers()
  console.log('\n Migration cityId sur autres collections...')
  for (const col of ['food_orders', 'restaurants', 'bookings']) {
    await migrateCityId(col)
  }
  console.log('\n Seeder support phone...')
  await seedSupportPhone()
  if (isDryRun) console.log('\n DRY-RUN — aucun changement écrit. Relancer avec --write.')
}

main().catch(err => { console.error('Erreur fatale:', err); process.exit(1) })
