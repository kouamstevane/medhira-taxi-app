/**
 * Script de diagnostic pour identifier le problème de chargement du module
 * Ce script tente de charger le module index.js et capture les erreurs
 */

console.log('=== Début du diagnostic de chargement du module ===');
console.log('Node version:', process.version);
console.log('Répertoire de travail:', process.cwd());
console.log('');

try {
  console.log('1. Tentative de chargement du module crypto...');
  const crypto = require('crypto');
  console.log('✅ Module crypto chargé avec succès');
  console.log('');
  
  console.log('2. Tentative de chargement de firebase-admin...');
  const admin = require('firebase-admin');
  console.log('✅ Module firebase-admin chargé avec succès');
  console.log('');
  
  console.log('3. Tentative de chargement de firebase-functions...');
  const functions = require('firebase-functions');
  console.log('✅ Module firebase-functions chargé avec succès');
  console.log('  - Version:', functions.SDK_VERSION);
  console.log('');
  
  console.log('4. Initialisation de Firebase Admin...');
  if (!admin.apps.length) {
    admin.initializeApp();
    console.log('✅ Firebase Admin initialisé avec succès');
  } else {
    console.log('✅ Firebase Admin déjà initialisé');
  }
  console.log('');
  
  console.log('5. Test d\'accès à Firestore...');
  const db = admin.firestore();
  console.log('✅ Firestore accessible');
  console.log('');
  
  console.log('6. Tentative de chargement du module principal (lib/index.js)...');
  const startTime = Date.now();
  const indexModule = require('./lib/index.js');
  const loadTime = Date.now() - startTime;
  console.log('✅ Module principal chargé en', loadTime, 'ms');
  console.log('');
  
  console.log('7. Vérification des exports du module...');
  const exports = Object.keys(indexModule);
  console.log('Exports trouvés:', exports.length, 'fonctions');
  exports.forEach(exp => {
    console.log('  -', exp);
  });
  console.log('');
  
  console.log('=== Diagnostic terminé avec succès ===');
  process.exit(0);
  
} catch (error) {
  console.error('');
  console.error('❌ ERREUR détectée:');
  console.error('Type:', error.constructor.name);
  console.error('Message:', error.message);
  console.error('');
  
  if (error.stack) {
    console.error('Stack trace:');
    console.error(error.stack);
  }
  
  process.exit(1);
}
