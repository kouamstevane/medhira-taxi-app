/**
 * Setup Jest
 * 
 * Configuration globale pour tous les tests.
 * Importe les matchers de testing-library et configure les mocks.
 */

// Import des matchers de @testing-library/jest-dom
import '@testing-library/jest-dom';

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









