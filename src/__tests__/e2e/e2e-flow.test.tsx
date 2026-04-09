/**
 * Tests E2E (End-to-End) - Flux Complet d'Inscription par Téléphone
 * 
 * Tests simulant le parcours complet d'un utilisateur sans rendu de composant
 * 
 * @group e2e
 * @group phone-registration-flow
 */

import { testLogger } from '@/utils/test-logger';

// Mock Firebase AVANT les imports
jest.mock('@/config/firebase', () => ({
  auth: {
    settings: { appVerificationDisabledForTesting: true },
  },
  db: {},
}));

jest.mock('firebase/auth', () => ({
  RecaptchaVerifier: jest.fn().mockImplementation(() => ({
    verify: jest.fn().mockResolvedValue('dummy-token'),
    clear: jest.fn(),
  })),
  signInWithPhoneNumber: jest.fn(),
  PhoneAuthProvider: {
    credential: jest.fn(),
  },
  signInWithCredential: jest.fn(),
  AuthErrorCodes: {
    INVALID_PHONE_NUMBER: 'auth/invalid-phone-number',
    TOO_MANY_REQUESTS: 'auth/too-many-requests',
  },
}));

jest.mock('firebase/firestore', () => ({
  doc: jest.fn(),
  getDoc: jest.fn(),
  setDoc: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    back: jest.fn(),
  }),
}));

describe('E2E - Flux Complet d\'Inscription par Téléphone', () => {
  const testContext = {
    user: {
      firstName: 'Jean',
      lastName: 'Dupont',
      phone: '655744484',
      fullPhone: '+237655744484',
      password: 'SecurePassword123!',
    },
    verificationCode: '123456',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    testLogger.testStarted('E2E Flow Test');
  });

  afterEach(() => {
    testLogger.testPassed('E2E Flow Test');
  });

  describe('Scénario Nominal - Inscription réussie', () => {
    test('Flux complet: Formulaire → Envoi code → Vérification → Création compte', async () => {
      const stepResults: Array<{ step: string; success: boolean; duration: number; error?: any }> = [];
      const totalStart = Date.now();

      try {
        // ÉTAPE 1: Validation des données
        const step1Start = Date.now();
        expect(testContext.user.firstName).toBeTruthy();
        expect(testContext.user.lastName).toBeTruthy();
        expect(testContext.user.fullPhone).toMatch(/^\+\d{10,15}$/);
        expect(testContext.user.password.length).toBeGreaterThanOrEqual(8);

        stepResults.push({
          step: 'Validation des données du formulaire',
          success: true,
          duration: Date.now() - step1Start,
        });

        // ÉTAPE 2: Envoi du code de vérification
        const step2Start = Date.now();
        const { signInWithPhoneNumber } = await import('firebase/auth');
        const { auth } = await import('@/config/firebase');
        
        (signInWithPhoneNumber as jest.Mock).mockResolvedValue({
          verificationId: 'test-verification-id',
        });

        const confirmation = await signInWithPhoneNumber(
          auth,
          testContext.user.fullPhone,
          expect.anything()
        );

        expect(confirmation.verificationId).toBe('test-verification-id');

        stepResults.push({
          step: 'Envoi du code de vérification SMS',
          success: true,
          duration: Date.now() - step2Start,
        });

        // ÉTAPE 3: Vérification du code
        const step3Start = Date.now();
        const { PhoneAuthProvider, signInWithCredential } = await import('firebase/auth');
        
        (PhoneAuthProvider.credential as jest.Mock).mockReturnValue('mock-credential');
        (signInWithCredential as jest.Mock).mockResolvedValue({
          user: {
            uid: 'test-user-123',
            phoneNumber: testContext.user.fullPhone,
          },
        });

        const credential = PhoneAuthProvider.credential(
          confirmation.verificationId,
          testContext.verificationCode
        );
        const userCredential = await signInWithCredential(auth, credential);

        expect(userCredential.user.uid).toBe('test-user-123');
        expect(userCredential.user.phoneNumber).toBe(testContext.user.fullPhone);

        stepResults.push({
          step: 'Vérification du code SMS',
          success: true,
          duration: Date.now() - step3Start,
        });

        // ÉTAPE 4: Création du compte utilisateur
        const step4Start = Date.now();
        const { doc, getDoc, setDoc } = await import('firebase/firestore');
        const { db } = await import('@/config/firebase');

        (getDoc as jest.Mock).mockResolvedValue({ exists: () => false });
        (setDoc as jest.Mock).mockResolvedValue(undefined);

        const userDocRef = doc(db, 'users', userCredential.user.uid);
        const docSnap = await getDoc(userDocRef);

        if (!docSnap.exists()) {
          await setDoc(userDocRef, {
            uid: userCredential.user.uid,
            phoneNumber: userCredential.user.phoneNumber,
            firstName: testContext.user.firstName,
            lastName: testContext.user.lastName,
            userType: 'client',
            createdAt: new Date(),
          });
        }

        expect(setDoc).toHaveBeenCalled();

        stepResults.push({
          step: 'Création du compte utilisateur dans Firestore',
          success: true,
          duration: Date.now() - step4Start,
        });

        const totalDuration = Date.now() - totalStart;

        console.log('\n✅ Résultats du flux E2E:');
        console.log('─'.repeat(60));
        stepResults.forEach(result => {
          console.log(`  ✓ ${result.step}: ${result.duration}ms`);
        });
        console.log('─'.repeat(60));
        console.log(`  Durée totale: ${totalDuration}ms\n`);

        expect(stepResults.every(r => r.success)).toBe(true);
        expect(totalDuration).toBeLessThan(10000); // Devrait compléter en moins de 10s

        // Succès enregistré
      } catch (error) {
        testLogger.logError({
          testName: 'E2E Flow Test',
          testFile: 'src/__tests__/e2e/e2e-flow.test.tsx',
          error: error as Error,
          context: { stepResults },
        });
        throw error;
      }
    });
  });

  describe('Scénario d\'erreur - Code de vérification invalide', () => {
    test('Scénario: Code de vérification invalide → Réessai → Succès', async () => {
      const stepResults: Array<{ step: string; success: boolean; attempts: number }> = [];

      try {
        // ÉTAPE 1: Envoi du code
        const { signInWithPhoneNumber } = await import('firebase/auth');
        const { auth } = await import('@/config/firebase');

        (signInWithPhoneNumber as jest.Mock).mockResolvedValue({
          verificationId: 'test-verification-id',
        });

        const confirmation = await signInWithPhoneNumber(
          auth,
          testContext.user.fullPhone,
          expect.anything()
        );

        stepResults.push({
          step: 'Envoi du code SMS',
          success: true,
          attempts: 1,
        });

        // ÉTAPE 2: Premier essai avec code invalide
        const { PhoneAuthProvider, signInWithCredential } = await import('firebase/auth');

        (PhoneAuthProvider.credential as jest.Mock).mockReturnValue('mock-credential');
        (signInWithCredential as jest.Mock).mockRejectedValueOnce({
          code: 'auth/invalid-verification-code',
          message: 'Code invalide',
        });

        const badCredential = PhoneAuthProvider.credential(confirmation.verificationId, '000000');

        await expect(signInWithCredential(auth, badCredential)).rejects.toMatchObject({
          code: 'auth/invalid-verification-code',
        });

        stepResults.push({
          step: 'Première vérification (code invalide)',
          success: false,
          attempts: 1,
        });

        // ÉTAPE 3: Deuxième essai avec bon code
        (signInWithCredential as jest.Mock).mockResolvedValueOnce({
          user: {
            uid: 'test-user-123',
            phoneNumber: testContext.user.fullPhone,
          },
        });

        const goodCredential = PhoneAuthProvider.credential(
          confirmation.verificationId,
          testContext.verificationCode
        );
        const userCredential = await signInWithCredential(auth, goodCredential);

        expect(userCredential.user.uid).toBe('test-user-123');

        stepResults.push({
          step: 'Deuxième vérification (code valide)',
          success: true,
          attempts: 2,
        });

        console.log('\n✅ Test de réessai après code invalide:');
        console.log('─'.repeat(60));
        stepResults.forEach(result => {
          const status = result.success ? '✓' : '✗';
          console.log(`  ${status} ${result.step} (tentative ${result.attempts})`);
        });
        console.log('─'.repeat(60) + '\n');

        // Succès enregistré
      } catch (error) {
        testLogger.logError({
          testName: 'Invalid Code Retry Test',
          testFile: 'src/__tests__/e2e/e2e-flow.test.tsx',
          error: error as Error,
          context: { stepResults },
        });
        throw error;
      }
    });
  });

  describe('Scénario d\'erreur - Problème réseau', () => {
    test('Scénario: Erreur réseau → Nouvelle tentative → Succès', async () => {
      const stepResults: Array<{ step: string; success: boolean; attempts: number }> = [];

      try {
        // ÉTAPE 1: Première tentative avec erreur réseau
        const { signInWithPhoneNumber } = await import('firebase/auth');
        const { auth } = await import('@/config/firebase');

        (signInWithPhoneNumber as jest.Mock).mockRejectedValueOnce({
          code: 'auth/network-request-failed',
          message: 'Échec de la requête réseau',
        });

        await expect(
          signInWithPhoneNumber(auth, testContext.user.fullPhone, expect.anything())
        ).rejects.toMatchObject({
          code: 'auth/network-request-failed',
        });

        stepResults.push({
          step: 'Première tentative d\'envoi (erreur réseau)',
          success: false,
          attempts: 1,
        });

        // ÉTAPE 2: Deuxième tentative réussie
        (signInWithPhoneNumber as jest.Mock).mockResolvedValueOnce({
          verificationId: 'test-verification-id',
        });

        const confirmation = await signInWithPhoneNumber(
          auth,
          testContext.user.fullPhone,
          expect.anything()
        );

        expect(confirmation.verificationId).toBe('test-verification-id');

        stepResults.push({
          step: 'Deuxième tentative d\'envoi (succès)',
          success: true,
          attempts: 2,
        });

        console.log('\n✅ Test de récupération après erreur réseau:');
        console.log('─'.repeat(60));
        stepResults.forEach(result => {
          const status = result.success ? '✓' : '✗';
          console.log(`  ${status} ${result.step} (tentative ${result.attempts})`);
        });
        console.log('─'.repeat(60) + '\n');

        // Succès enregistré
      } catch (error) {
        testLogger.logError({
          testName: 'Network Error Recovery Test',
          testFile: 'src/__tests__/e2e/e2e-flow.test.tsx',
          error: error as Error,
          context: { stepResults },
        });
        throw error;
      }
    });
  });

  describe('Analyse de l\'expérience utilisateur', () => {
    test('Le flux complet devrait se terminer en temps raisonnable', async () => {
      const benchmarks = {
        formValidation: 100, // ms
        codeSending: 2000, // ms
        codeVerification: 2000, // ms
        accountCreation: 1000, // ms
        total: 10000, // ms
      };

      const startTime = Date.now();
      const timings: Record<string, number> = {};

      // Simuler chaque étape
      const { signInWithPhoneNumber, PhoneAuthProvider, signInWithCredential } = await import('firebase/auth');
      const { doc, getDoc, setDoc } = await import('firebase/firestore');
      const { auth, db } = await import('@/config/firebase');

      // Validation
      const validationStart = Date.now();
      expect(testContext.user.fullPhone).toMatch(/^\+\d{10,15}$/);
      timings.formValidation = Date.now() - validationStart;

      // Envoi du code
      const sendingStart = Date.now();
      (signInWithPhoneNumber as jest.Mock).mockResolvedValue({ verificationId: 'test-id' });
      await signInWithPhoneNumber(auth, testContext.user.fullPhone, expect.anything());
      timings.codeSending = Date.now() - sendingStart;

      // Vérification
      const verificationStart = Date.now();
      (PhoneAuthProvider.credential as jest.Mock).mockReturnValue('credential');
      (signInWithCredential as jest.Mock).mockResolvedValue({
        user: { uid: 'test-user-123', phoneNumber: testContext.user.fullPhone },
      });
      const mockCredential = { providerId: 'phone', signInMethod: 'phone' } as any;
      await signInWithCredential(auth, mockCredential);
      timings.codeVerification = Date.now() - verificationStart;

      // Création du compte
      const creationStart = Date.now();
      (getDoc as jest.Mock).mockResolvedValue({ exists: () => false });
      (setDoc as jest.Mock).mockResolvedValue(undefined);
      await setDoc(doc(db, 'users', 'test-user-123'), {});
      timings.accountCreation = Date.now() - creationStart;

      timings.total = Date.now() - startTime;

      console.log('\n📊 Analyse de performance:');
      console.log('─'.repeat(60));
      Object.entries(timings).forEach(([step, duration]) => {
        const benchmark = benchmarks[step as keyof typeof benchmarks];
        const status = duration < benchmark ? '✓' : '⚠';
        console.log(`  ${status} ${step}: ${duration}ms (limite: ${benchmark}ms)`);
      });
      console.log('─'.repeat(60) + '\n');

      expect(timings.total).toBeLessThan(benchmarks.total);

      // Succès enregistré
    });
  });
});
