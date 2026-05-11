const admin = require('firebase-admin');

admin.initializeApp({
  projectId: 'medjira-service',
  credential: admin.credential.applicationDefault(),
});

const db = admin.firestore();
const auth = admin.auth();

(async () => {
  const targetUidArg = process.argv[2];
  if (targetUidArg) {
    const targetUser = await auth.getUser(targetUidArg);
    const ref = db.collection('users').doc(targetUidArg);
    const existing = await ref.get();
    if (existing.exists) {
      console.log(`[fix] users/${targetUidArg} already exists, nothing to do.`);
      return;
    }
    const display = targetUser.displayName || '';
    const [firstName, ...rest] = display.split(' ');
    const lastName = rest.join(' ');
    await ref.set({
      uid: targetUidArg,
      email: targetUser.email ?? null,
      phoneNumber: targetUser.phoneNumber ?? null,
      firstName: firstName || 'Test',
      lastName: lastName || 'GooglePlay',
      profileImageUrl: targetUser.photoURL ?? null,
      emailVerified: targetUser.emailVerified ?? false,
      country: null,
      roles: {
        client: { enabled: true, joinedAt: admin.firestore.FieldValue.serverTimestamp() },
      },
      activeRole: 'client',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`[fix] ✅ Created users/${targetUidArg} (${targetUser.email})`);
    return;
  }

  console.log('[fix] Listing 20 most recent Firebase Auth users...\n');
  const list = await auth.listUsers(20);
  const users = list.users
    .map((u) => ({
      uid: u.uid,
      email: u.email || '(no email)',
      created: u.metadata.creationTime,
      lastSignIn: u.metadata.lastSignInTime,
    }))
    .sort((a, b) => new Date(b.created) - new Date(a.created));

  const snaps = await Promise.all(
    users.map((u) => db.collection('users').doc(u.uid).get()),
  );
  users.forEach((u, i) => {
    console.log(
      `${snaps[i].exists ? '✅' : '❌'} ${u.email.padEnd(35)} uid=${u.uid}  created=${u.created}`,
    );
  });

  console.log('\n[fix] Users with ❌ are missing their Firestore document.');
  console.log('[fix] To fix one, re-run with: node scripts/fix-missing-user-doc.cjs <uid>');
})()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[fix] ERROR', err);
    process.exit(1);
  });
