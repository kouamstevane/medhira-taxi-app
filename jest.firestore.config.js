/**
 * Configuration Jest pour les tests Firestore Rules
 *
 * Cette configuration est spécifiquement conçue pour tester les règles
 * de sécurité Firestore avec @firebase/rules-unit-testing.
 */

export default {
  // Environnement de test Node.js (requis pour @firebase/rules-unit-testing)
  testEnvironment: 'node',

  // Extensions de fichiers à prendre en compte
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],

  // Transformateur pour TypeScript
  transform: {
    '^.+\\.tsx?$': ['@swc/jest', {
      jsc: {
        parser: {
          syntax: 'typescript',
          tsx: false,
        },
        transform: {
          react: {
            runtime: 'automatic',
          },
        },
      },
    }],
  },

  // Fichiers de test à exécuter
  testMatch: [
    '**/tests/**/*.firestore.test.ts',
    '**/tests/**/*.firestore.test.tsx',
    '**/tests/**/*.rules.test.ts',
    '**/tests/**/*.rules.test.tsx',
    '**/__tests__/**/*firestore*.test.ts',
    '**/__tests__/**/*firestore*.test.tsx',
    '**/__tests__/**/*rules*.test.ts',
    '**/__tests__/**/*rules*.test.tsx',
  ],

  // Fichiers à ignorer
  testPathIgnorePatterns: [
    '/node_modules/',
    '/.next/',
    '/out/',
    '/android/',
    '/ios/',
    '/functions/',
  ],

  // Modules à mocker
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },

  // Configuration de la collecte de couverture
  collectCoverageFrom: [
    'tests/**/*.{ts,tsx}',
    '!tests/**/*.d.ts',
    '!tests/**/*.config.{ts,js}',
  ],

  // Timeout pour les tests (30 secondes pour les tests d'émulateurs)
  testTimeout: 30000,

  // Variables d'environnement
  setupFilesAfterEnv: ['<rootDir>/jest.firestore.setup.js'],

  // Affichage détaillé des résultats
  verbose: true,
};
