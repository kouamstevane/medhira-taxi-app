/**
 * Configuration Jest pour les tests Firestore Rules - Setup
 * 
 * Fichier de configuration exécuté avant chaque test Firestore.
 * Configure l'environnement Node.js pour les tests de règles Firestore.
 */

// Timeout global pour les tests Firestore (30 secondes pour les tests d'émulateurs)
jest.setTimeout(30000);

// Mock des variables d'environnement Firebase pour les tests
process.env.FIREBASE_API_KEY = 'test-api-key';
process.env.FIREBASE_AUTH_DOMAIN = 'test.firebaseapp.com';
process.env.FIREBASE_PROJECT_ID = 'medjira-taxi-test';
process.env.FIREBASE_STORAGE_BUCKET = 'test.firebasestorage.app';
process.env.FIREBASE_MESSAGING_SENDER_ID = '123456789';
process.env.FIREBASE_APP_ID = '1:123456789:web:abc123';

// Configuration de console pour les tests
global.console = {
  ...console,
  // Conserver les logs pour le debugging
  warn: (...args) => console.warn(...args),
  error: (...args) => console.error(...args),
};

console.log('✅ Setup Firestore Rules Tests initialisé');
