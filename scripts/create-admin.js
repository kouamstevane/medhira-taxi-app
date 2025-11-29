/**
 * Script pour créer un compte administrateur
 * 
 * Usage: node scripts/create-admin.js <email> <uid>
 * 
 * Exemple: node scripts/create-admin.js admin@medjira.com abc123def456
 * 
 * Note: Vous devez d'abord obtenir l'UID de l'utilisateur depuis Firebase Console > Authentication
 */

import admin from 'firebase-admin';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Charger la clé de service
const serviceAccountPath = path.join(__dirname, '../src/config/keys/serviceAccountKey.json');

try {
  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
  
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  }

  const db = admin.firestore();

  async function createAdmin() {
    const args = process.argv.slice(2);
    
    if (args.length < 2) {
      console.error('❌ Usage: node scripts/create-admin.js <email> <uid>');
      console.error('   Exemple: node scripts/create-admin.js admin@medjira.com abc123def456');
      process.exit(1);
    }

    const email = args[0];
    const uid = args[1];

    try {
      // Vérifier si l'utilisateur existe dans Authentication
      const user = await admin.auth().getUser(uid);
      
      if (user.email !== email) {
        console.warn('⚠️  Attention: L\'email fourni ne correspond pas à l\'email de l\'utilisateur dans Authentication');
        console.warn(`   Email fourni: ${email}`);
        console.warn(`   Email dans Auth: ${user.email}`);
      }

      // Créer le document admin
      await db.collection('admins').doc(uid).set({
        userId: uid,
        email: user.email || email,
        role: 'admin',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: 'script'
      });

      console.log('✅ Admin créé avec succès !');
      console.log(`   UID: ${uid}`);
      console.log(`   Email: ${user.email || email}`);
      console.log(`   Accès: http://localhost:3000/admin/drivers`);
      
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        console.error('❌ Erreur: L\'utilisateur avec cet UID n\'existe pas dans Firebase Authentication');
        console.error('   Veuillez d\'abord créer l\'utilisateur dans Firebase Console > Authentication');
      } else {
        console.error('❌ Erreur:', error.message);
      }
      process.exit(1);
    }
  }

  createAdmin().then(() => {
    process.exit(0);
  });

} catch (error) {
  console.error('❌ Erreur: Impossible de charger la clé de service Firebase');
  console.error('   Vérifiez que le fichier existe: src/config/keys/serviceAccountKey.json');
  console.error('   Détails:', error.message);
  process.exit(1);
}

