/**
 * Promeut un utilisateur existant au rôle admin.
 *
 * Crée (ou met à jour) le document `admins/{uid}` dans Firestore, qui est
 * le marqueur canonique reconnu par firestore.rules, requireAdmin() côté
 * Cloud Functions et useAdminAuth() côté client.
 *
 * Pose en option le custom claim `role: 'admin'` sur le compte Auth pour
 * que le middleware Next puisse l'utiliser sans round-trip Firestore.
 * Si le claim est posé, l'utilisateur doit se reconnecter pour que son
 * ID token soit régénéré.
 *
 * Usage :
 *   node scripts/make-admin.cjs <email|uid> [--claim] [--revoke]
 *
 * Exemples :
 *   node scripts/make-admin.cjs alice@example.com
 *   node scripts/make-admin.cjs alice@example.com --claim
 *   node scripts/make-admin.cjs rPi3nLHTMfNfKQGcfUBaLm4T4RI2 --claim
 *   node scripts/make-admin.cjs alice@example.com --revoke   # retire les droits admin
 *
 * Prérequis : service-account-key.json à la racine du projet
 * (Firebase Console → Paramètres → Comptes de service → Générer une clé).
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith('--'));
const useClaim = args.includes('--claim');
const revoke = args.includes('--revoke');

if (!target) {
  console.error('Usage: node scripts/make-admin.cjs <email|uid> [--claim] [--revoke]');
  process.exit(1);
}

const serviceAccountPath = path.join(process.cwd(), 'service-account-key.json');
if (!fs.existsSync(serviceAccountPath)) {
  console.error('❌ service-account-key.json introuvable à la racine du projet.');
  console.error('   Firebase Console → Paramètres → Comptes de service → Générer une clé privée.');
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(require(serviceAccountPath)) });

const db = admin.firestore();
const auth = admin.auth();

const isEmail = target.includes('@');

(async () => {
  const user = isEmail ? await auth.getUserByEmail(target) : await auth.getUser(target);
  console.log(`🔍 Utilisateur : ${user.email ?? '(sans email)'} — uid ${user.uid}`);

  if (revoke) {
    await db.collection('admins').doc(user.uid).delete();
    console.log('🗑️  Document admins/' + user.uid + ' supprimé.');
    if (useClaim) {
      const claims = { ...(user.customClaims ?? {}) };
      delete claims.role;
      await auth.setCustomUserClaims(user.uid, claims);
      console.log('🗑️  Custom claim role retiré. L\'utilisateur doit se reconnecter.');
    }
    console.log('✅ Droits admin révoqués.');
    process.exit(0);
  }

  const ref = db.collection('admins').doc(user.uid);
  const snap = await ref.get();
  await ref.set(
    {
      userId: user.uid,
      email: user.email ?? null,
      ...(snap.exists ? { updatedAt: admin.firestore.FieldValue.serverTimestamp() }
                      : { createdAt: admin.firestore.FieldValue.serverTimestamp() }),
    },
    { merge: true },
  );
  console.log(snap.exists ? '♻️  admins/' + user.uid + ' mis à jour.'
                          : '📝 admins/' + user.uid + ' créé.');

  if (useClaim) {
    await auth.setCustomUserClaims(user.uid, { ...(user.customClaims ?? {}), role: 'admin' });
    console.log('🔐 Custom claim role=admin posé. L\'utilisateur doit se reconnecter pour rafraîchir son ID token.');
  }

  console.log('✅ Admin opérationnel.');
  process.exit(0);
})().catch((err) => {
  console.error('❌', err.message ?? err);
  process.exit(1);
});
