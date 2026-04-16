/**
 * Configuration Jest pour Next.js
 * 
 * Configuration des tests unitaires et d'intégration avec Jest et React Testing Library.
 * 
 * @see https://nextjs.org/docs/testing#jest-and-react-testing-library
 */

const nextJest = require('next/jest');

const createJestConfig = nextJest({
  // Chemin vers l'app Next.js pour charger next.config.js et .env
  dir: './',
});

// Configuration Jest personnalisée
const customJestConfig = {
  // Environnement de test
  testEnvironment: 'jest-environment-jsdom',

  // Chemins de modules
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },

  // Polyfill fetch avant le chargement de tout module (firebase/auth en a besoin)
  setupFiles: ['<rootDir>/jest.fetch-polyfill.js'],

  // Fichiers de setup
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],

  // Patterns de fichiers de test
  testMatch: [
    '**/__tests__/**/*.[jt]s?(x)',
    '**/?(*.)+(spec|test).[jt]s?(x)',
  ],

  // Fichiers à ignorer
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/.next/',
    // Tests Playwright — doivent être lancés via `npx playwright test`
    '<rootDir>/e2e/',
    // Tests Firestore rules — nécessitent les émulateurs Firebase (`npm run test:firestore:emulators`)
    '<rootDir>/tests/',
    // Fichiers de setup/helpers qui ne contiennent pas de tests
    '<rootDir>/src/__tests__/setup/',
  ],

  // Couverture de code
  collectCoverageFrom: [
    'src/**/*.{js,jsx,ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.stories.{js,jsx,ts,tsx}',
    '!src/**/__tests__/**',
  ],

  // Transformations
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': ['@swc/jest', {}],
  },

  // Variables d'environnement pour les tests
  testEnvironmentOptions: {
    customExportConditions: [''],
  },
};

// Export de la config avec les transformations Next.js
module.exports = createJestConfig(customJestConfig);









