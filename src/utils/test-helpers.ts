/**
 * Script de Test Helper
 * 
 * Fournit des utilitaires et helpers pour les tests
 */

import { isValidPhoneNumber } from '@/lib/validation';

/**
 * Générateur de numéros de téléphone aléatoires valides
 */
export function generateRandomPhoneNumber(countryCode: string = '+237'): string {
  const length = countryCode === '+237' ? 9 : 9;
  const randomDigits = Array.from({ length }, () => Math.floor(Math.random() * 10)).join('');
  return `${countryCode}${randomDigits}`;
}

/**
 * Générateur de numéros de téléphone invalides pour tests
 */
export function generateInvalidPhoneNumbers(): string[] {
  return [
    '', // Vide
    '123', // Trop court
    'abcdefghijk', // Lettres
    '+', // Juste le +
    '+0123456789', // Commence par 0
    '00237655744484', // Format 00 au lieu de +
    '+237-655-744-484', // Avec tirets
  ];
}

/**
 * Créer un contexte de test avec données factices
 */
export interface TestUser {
  firstName: string;
  lastName: string;
  phone: string;
  fullPhone: string;
  password: string;
  confirmPassword: string;
  country: string;
  uid: string;
}

export function createTestUser(overrides?: Partial<TestUser>): TestUser {
  const defaults: TestUser = {
    firstName: 'Jean',
    lastName: 'Dupont',
    phone: '655744484',
    fullPhone: '+237655744484',
    password: 'SecurePass123!',
    confirmPassword: 'SecurePass123!',
    country: 'CM',
    uid: `test-user-${Date.now()}`,
  };

  return { ...defaults, ...overrides };
}

/**
 * Créer plusieurs utilisateurs de test
 */
export function createTestUsers(count: number): TestUser[] {
  return Array.from({ length: count }, (_, i) => {
    const phone = `655${String(i).padStart(6, '0')}`;
    return createTestUser({
      firstName: `User${i}`,
      lastName: `Test${i}`,
      phone,
      fullPhone: `+237${phone}`,
      uid: `test-user-${i}`,
    });
  });
}

/**
 * Délai asynchrone pour simuler des opérations
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Mock d'une réponse Firebase Authentication
 */
export function mockFirebaseAuthResponse(user: Partial<TestUser>) {
  return {
    user: {
      uid: user.uid || 'test-uid',
      phoneNumber: user.fullPhone || '+237655744484',
      email: null,
      displayName: `${user.firstName} ${user.lastName}`,
      photoURL: null,
      emailVerified: false,
      metadata: {
        creationTime: new Date().toISOString(),
        lastSignInTime: new Date().toISOString(),
      },
    },
  };
}

/**
 * Mock d'un document Firestore
 */
export function mockFirestoreDocument(user: Partial<TestUser>) {
  return {
    exists: () => true,
    data: () => ({
      uid: user.uid || 'test-uid',
      phoneNumber: user.fullPhone || '+237655744484',
      firstName: user.firstName || 'Jean',
      lastName: user.lastName || 'Dupont',
      userType: 'client',
      country: user.country || 'CM',
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
  };
}

/**
 * Générateur d'erreurs Firebase typiques
 */
export function generateFirebaseError(code: string): { code: string; message: string } {
  const errors: Record<string, string> = {
    'auth/invalid-phone-number': 'Numéro de téléphone invalide',
    'auth/too-many-requests': 'Trop de tentatives. Veuillez réessayer plus tard.',
    'auth/invalid-verification-code': 'Code de vérification invalide',
    'auth/network-request-failed': 'Problème de connexion réseau',
    'auth/user-not-found': 'Utilisateur non trouvé',
    'auth/invalid-app-credential': 'Configuration Firebase invalide',
  };

  return {
    code,
    message: errors[code] || 'Erreur inconnue',
  };
}

/**
 * Validateur de format de rapport de test
 */
export function validateTestReport(report: unknown): boolean {
  if (typeof report !== 'object' || report === null) return false;
  const requiredFields = [
    'runId',
    'startTime',
    'totalTests',
    'passedTests',
    'failedTests',
    'skippedTests',
    'errors',
    'performance',
  ];

  return requiredFields.every((field) => field in (report as Record<string, unknown>));
}

/**
 * Calculer le taux de réussite
 */
export function calculateSuccessRate(passed: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((passed / total) * 10000) / 100;
}

/**
 * Formater une durée en texte lisible
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  return `${Math.floor(ms / 60000)}m ${((ms % 60000) / 1000).toFixed(0)}s`;
}

/**
 * Masquer un numéro de téléphone pour les logs
 */
export function maskPhoneNumber(phone: string): string {
  if (phone.length < 8) return '***';
  const visibleStart = phone.slice(0, 4);
  const visibleEnd = phone.slice(-2);
  const masked = '*'.repeat(phone.length - 6);
  return `${visibleStart}${masked}${visibleEnd}`;
}

/**
 * Créer un snapshot de l'état actuel pour comparaison
 */
export function createSnapshot(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

/**
 * Comparer deux snapshots
 */
export function compareSnapshots(snapshot1: string, snapshot2: string): boolean {
  return snapshot1 === snapshot2;
}

/**
 * Extraction des métriques de performance depuis les résultats de test
 */
export interface PerformanceMetrics {
  avgDuration: number;
  minDuration: number;
  maxDuration: number;
  p50: number;
  p95: number;
  p99: number;
}

export function calculatePerformanceMetrics(durations: number[]): PerformanceMetrics {
  if (durations.length === 0) {
    return {
      avgDuration: 0,
      minDuration: 0,
      maxDuration: 0,
      p50: 0,
      p95: 0,
      p99: 0,
    };
  }

  const sorted = [...durations].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);

  return {
    avgDuration: sum / sorted.length,
    minDuration: sorted[0],
    maxDuration: sorted[sorted.length - 1],
    p50: sorted[Math.floor(sorted.length * 0.5)],
    p95: sorted[Math.floor(sorted.length * 0.95)],
    p99: sorted[Math.floor(sorted.length * 0.99)],
  };
}

/**
 * Vérifier si un test est flaky (instable)
 */
export function detectFlakyTest(
  testName: string,
  results: Array<{ name: string; passed: boolean }>
): boolean {
  const testResults = results.filter((r) => r.name === testName);
  if (testResults.length < 3) return false;

  const passCount = testResults.filter((r) => r.passed).length;
  const failCount = testResults.length - passCount;

  // Un test est considéré flaky s'il passe parfois et échoue parfois
  return passCount > 0 && failCount > 0;
}

/**
 * Générer un ID unique pour une exécution de test
 */
export function generateTestRunId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  return `test-run-${timestamp}-${random}`;
}

/**
 * Nettoyer les données de test après exécution
 */
export async function cleanupTestData(userIds: string[]): Promise<void> {
  console.log(`🧹 Nettoyage des données de test (${userIds.length} utilisateurs)...`);
  // Dans un vrai scénario, on supprimerait les données de Firestore ici
  // Pour les tests, on utilise des mocks donc pas besoin de nettoyage réel
}

/**
 * Vérifier la santé du système avant les tests
 */
export async function checkSystemHealth(): Promise<{
  firebase: boolean;
  network: boolean;
  memory: boolean;
}> {
  return {
    firebase: true, // Dans un vrai scénario, ping Firebase
    network: true, // Vérifier la connectivité
    memory: process.memoryUsage().heapUsed < 500 * 1024 * 1024, // < 500MB
  };
}

export default {
  generateRandomPhoneNumber,
  generateInvalidPhoneNumbers,
  createTestUser,
  createTestUsers,
  delay,
  mockFirebaseAuthResponse,
  mockFirestoreDocument,
  generateFirebaseError,
  validateTestReport,
  calculateSuccessRate,
  formatDuration,
  maskPhoneNumber,
  createSnapshot,
  compareSnapshots,
  calculatePerformanceMetrics,
  detectFlakyTest,
  generateTestRunId,
  cleanupTestData,
  checkSystemHealth,
};
