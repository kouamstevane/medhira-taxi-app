const admin = require('firebase-admin');

// Initialize with default credentials from environment or default project
if (!admin.apps.length) {
  admin.initializeApp();
}

const uid = 'lkcxgOPhAQX03d9UOWmK6TrpkXZ2';

async function cleanup() {
  console.log('--- CLEANUP START ---');
  console.log(`UID: ${uid}`);
  
  try {
    const db = admin.firestore();
    
    // 1. Check if user exists in various collections
    const collections = ['users', 'drivers', 'wallets', 'admins', 'vehicles'];
    for (const coll of collections) {
      const doc = await db.collection(coll).doc(uid).get();
      if (doc.exists) {
        await db.collection(coll).doc(uid).delete();
        console.log(`[Firestore] Deleted ${coll}/${uid}`);
      } else {
        console.log(`[Firestore] ${coll}/${uid} not found`);
      }
    }
    
    // 2. Delete from Auth
    try {
      await admin.auth().deleteUser(uid);
      console.log('[Auth] Deleted user account');
    } catch (authError) {
      if (authError.code === 'auth/user-not-found') {
        console.log('[Auth] User not found (already deleted?)');
      } else {
        console.error('[Auth] Error:', authError.message);
      }
    }
    
    console.log('--- CLEANUP FINISHED ---');
  } catch (error) {
    console.error('--- CLEANUP ERROR ---');
    console.error(error);
    process.exit(1);
  }
}

cleanup();
