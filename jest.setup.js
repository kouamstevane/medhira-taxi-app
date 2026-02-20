/**
 * Configuration Jest - Setup
 * 
 * Fichier de configuration exécuté avant chaque fichier de test.
 * Configure React Testing Library, les utilitaires de test et le système de logging.
 */

// Importer les matchers de @testing-library/jest-dom
import '@testing-library/jest-dom';

// Configuration globale pour les tests
global.console = {
  ...console,
  // Conserver les logs pour le debugging mais formatter
  warn: jest.fn((...args) => console.warn(...args)),
  error: jest.fn((...args) => console.error(...args)),
};

// Mock des variables d'environnement Next.js pour les tests
process.env.NEXT_PUBLIC_FIREBASE_API_KEY = 'test-api-key';
process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = 'test.firebaseapp.com';
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = 'test-project';
process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = 'test.firebasestorage.app';
process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID = '123456789';
process.env.NEXT_PUBLIC_FIREBASE_APP_ID = '1:123456789:web:abc123';

// Timeout global pour les tests (10 secondes)
jest.setTimeout(10000);

// Importer le setup du logger de tests (doit être après les autres configurations)
// Note: Utiliser require car import ne fonctionne pas bien dans jest.setup.js
// Le logger sera automatiquement intégré à tous les tests
try {
  require('./src/__tests__/setup/test-logger-setup');
  console.log('✅ Système de logging des tests initialisé');
} catch (error) {
  console.warn('⚠️  Le système de logging des tests n\'a pas pu être chargé:', error.message);
}

// Mock de Firebase
jest.mock('./src/config/firebase', () => ({
  auth: {
    currentUser: null,
  },
  db: {},
  storage: {},
}));

// Mock de Next.js router
jest.mock('next/navigation', () => ({
  useRouter() {
    return {
      push: jest.fn(),
      replace: jest.fn(),
      prefetch: jest.fn(),
      back: jest.fn(),
    };
  },
  usePathname() {
    return '/';
  },
  useSearchParams() {
    return new URLSearchParams();
  },
}));

// Mock de Google Maps
global.google = {
  maps: {
    Map: jest.fn(),
    Marker: jest.fn(),
    SymbolPath: {
      CIRCLE: 0,
    },
  },
};

// Supprimer les warnings de console pendant les tests
global.console = {
  ...console,
  warn: jest.fn(),
  error: jest.fn(),
};









