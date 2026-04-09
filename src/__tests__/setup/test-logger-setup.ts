/**
 * Configuration personnalisée pour Jest avec logger de tests
 * 
 * Ce fichier ajoute des reporters personnalisés et configure le logger de tests
 */

import { testLogger } from '../../utils/test-logger';

// Réinitialiser le logger avant les tests
beforeAll(() => {
  testLogger.reset();
  console.log('\n🚀 Début de l\'exécution de la suite de tests\n');
});

// Sauvegarder les rapports après les tests
afterAll(async () => {
  testLogger.printSummary();
  
  try {
    const jsonPath = await testLogger.saveReport('./test-reports');
    const htmlPath = await testLogger.generateHTMLReport('./test-reports');
    
    console.log(`\n✅ Rapports générés avec succès:`);
    console.log(`   - JSON: ${jsonPath}`);
    console.log(`   - HTML: ${htmlPath}\n`);
  } catch (error) {
    console.error('❌ Erreur lors de la génération des rapports:', error);
  }
});

// Hook pour logger chaque test
beforeEach(() => {
  const testName = expect.getState().currentTestName || 'unknown';
  testLogger.testStarted(testName);
});

// Hook pour logger les résultats de chaque test
afterEach(() => {
  const testName = expect.getState().currentTestName || 'unknown';
  const testState = expect.getState();
  
  // Vérifier si le test a échoué
  if ((testState as any).assertionCalls > 0) {
    testLogger.testPassed(testName);
  }
});

// Intercepter les erreurs globales
process.on('unhandledRejection', (reason, promise) => {
  testLogger.logError({
    testName: 'Global Error Handler',
    testFile: 'unknown',
    error: reason instanceof Error ? reason : new Error(String(reason)),
    context: {
      type: 'unhandledRejection',
      promise: String(promise),
    },
    severity: 'critical',
  });
});

process.on('uncaughtException', (error) => {
  testLogger.logError({
    testName: 'Global Error Handler',
    testFile: 'unknown',
    error,
    context: {
      type: 'uncaughtException',
    },
    severity: 'critical',
  });
});

// Mock de console.error pour capturer les erreurs loggées
const originalConsoleError = console.error;
console.error = (...args: any[]) => {
  // Logger dans notre système si c'est une erreur de test
  if (args[0] instanceof Error) {
    testLogger.logError({
      testName: expect.getState().currentTestName || 'unknown',
      testFile: 'console',
      error: args[0],
      context: {
        additionalArgs: args.slice(1),
      },
    });
  }
  
  // Appeler l'original
  originalConsoleError.apply(console, args);
};

// Configuration globale pour les tests
global.console = {
  ...console,
  error: console.error,
  warn: console.warn,
  log: console.log,
};

export {};
