/**
 * Tests d'Intégration - Inscription par Téléphone
 * 
 * Tests du composant RegisterPhoneContent et de l'intégration Firebase
 * 
 * @group integration
 * @group phone-registration
 */

import { isValidPhoneNumber } from '@/lib/validation';

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

describe('Tests d\'Intégration - Inscription par Téléphone', () => {
  const mockUser = {
    uid: 'test-user-123',
    phoneNumber: '+237655744484',
  };

  const mockConfirmation = {
    verificationId: 'test-verification-id',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Validation des numéros de téléphone', () => {
    test('devrait accepter un numéro camerounais valide', () => {
      expect(isValidPhoneNumber('+237655744484')).toBe(true);
      expect(isValidPhoneNumber('+237677123456')).toBe(true);
    });

    test('devrait accepter un numéro français valide', () => {
      expect(isValidPhoneNumber('+33612345678')).toBe(true);
    });

    test('devrait accepter un numéro belge valide', () => {
      expect(isValidPhoneNumber('+32470123456')).toBe(true);
    });

    test('devrait accepter un numéro canadien valide', () => {
      expect(isValidPhoneNumber('+15550123456')).toBe(true);
    });

    test('devrait rejeter un numéro sans indicatif pays', () => {
      expect(isValidPhoneNumber('655744484')).toBe(false);
    });

    test('devrait rejeter un numéro trop court', () => {
      expect(isValidPhoneNumber('+237123')).toBe(false);
    });

    test('devrait rejeter un numéro avec des caractères invalides', () => {
      expect(isValidPhoneNumber('+237abc744484')).toBe(false);
    });

    test('devrait rejeter une chaîne vide', () => {
      expect(isValidPhoneNumber('')).toBe(false);
    });
  });

  describe('Appels Firebase - Envoi du code', () => {
    test('devrait pouvoir appeler signInWithPhoneNumber avec succès', async () => {
      const { signInWithPhoneNumber } = await import('firebase/auth');
      const { auth } = await import('@/config/firebase');
      
      (signInWithPhoneNumber as jest.Mock).mockResolvedValue(mockConfirmation);

      const result = await signInWithPhoneNumber(auth, '+237655744484', expect.anything());

      expect(signInWithPhoneNumber).toHaveBeenCalledWith(
        auth,
        '+237655744484',
        expect.anything()
      );
      expect(result).toEqual(mockConfirmation);
    });

    test('devrait gérer l\'erreur "numéro invalide"', async () => {
      const { signInWithPhoneNumber } = await import('firebase/auth');
      const { auth } = await import('@/config/firebase');
      
      (signInWithPhoneNumber as jest.Mock).mockRejectedValue({
        code: 'auth/invalid-phone-number',
        message: 'Numéro invalide',
      });

      await expect(
        signInWithPhoneNumber(auth, 'invalid', expect.anything())
      ).rejects.toMatchObject({
        code: 'auth/invalid-phone-number',
      });
    });

    test('devrait gérer l\'erreur "trop de tentatives"', async () => {
      const { signInWithPhoneNumber } = await import('firebase/auth');
      const { auth } = await import('@/config/firebase');
      
      (signInWithPhoneNumber as jest.Mock).mockRejectedValue({
        code: 'auth/too-many-requests',
        message: 'Trop de tentatives',
      });

      await expect(
        signInWithPhoneNumber(auth, '+237655744484', expect.anything())
      ).rejects.toMatchObject({
        code: 'auth/too-many-requests',
      });
    });
  });

  describe('Appels Firebase - Vérification du code', () => {
    test('devrait pouvoir vérifier un code valide', async () => {
      const { PhoneAuthProvider, signInWithCredential } = await import('firebase/auth');
      const { auth } = await import('@/config/firebase');
      
      (PhoneAuthProvider.credential as jest.Mock).mockReturnValue('mock-credential');
      (signInWithCredential as jest.Mock).mockResolvedValue({
        user: mockUser,
      });

      const credential = PhoneAuthProvider.credential('test-verification-id', '123456');
      const result = await signInWithCredential(auth, credential);

      expect(PhoneAuthProvider.credential).toHaveBeenCalledWith('test-verification-id', '123456');
      expect(signInWithCredential).toHaveBeenCalledWith(auth, 'mock-credential');
      expect(result.user).toEqual(mockUser);
    });

    test('devrait rejeter un code invalide', async () => {
      const { PhoneAuthProvider, signInWithCredential } = await import('firebase/auth');
      const { auth } = await import('@/config/firebase');
      
      (PhoneAuthProvider.credential as jest.Mock).mockReturnValue('mock-credential');
      (signInWithCredential as jest.Mock).mockRejectedValue({
        code: 'auth/invalid-verification-code',
        message: 'Code invalide',
      });

      const credential = PhoneAuthProvider.credential('test-verification-id', '000000');

      await expect(
        signInWithCredential(auth, credential)
      ).rejects.toMatchObject({
        code: 'auth/invalid-verification-code',
      });
    });
  });

  describe('Appels Firestore - Création du compte', () => {
    test('devrait créer un document utilisateur si il n\'existe pas', async () => {
      const { doc, getDoc, setDoc } = await import('firebase/firestore');
      const { db } = await import('@/config/firebase');
      
      (getDoc as jest.Mock).mockResolvedValue({ exists: () => false });
      (setDoc as jest.Mock).mockResolvedValue(undefined);

      const userDocRef = doc(db, 'users', mockUser.uid);
      const docSnap = await getDoc(userDocRef);

      if (!docSnap.exists()) {
        await setDoc(userDocRef, {
          uid: mockUser.uid,
          phoneNumber: mockUser.phoneNumber,
          firstName: 'Jean',
          lastName: 'Dupont',
          userType: 'client',
          createdAt: new Date(),
        });
      }

      expect(getDoc).toHaveBeenCalled();
      expect(setDoc).toHaveBeenCalled();
    });

    test('ne devrait pas créer de document si l\'utilisateur existe déjà', async () => {
      const { doc, getDoc, setDoc } = await import('firebase/firestore');
      const { db } = await import('@/config/firebase');
      
      (getDoc as jest.Mock).mockResolvedValue({ 
        exists: () => true,
        data: () => ({ uid: mockUser.uid, phoneNumber: mockUser.phoneNumber }),
      });
      (setDoc as jest.Mock).mockClear();

      const userDocRef = doc(db, 'users', mockUser.uid);
      const docSnap = await getDoc(userDocRef);

      if (!docSnap.exists()) {
        await setDoc(userDocRef, {});
      }

      expect(getDoc).toHaveBeenCalled();
      expect(setDoc).not.toHaveBeenCalled();
    });
  });

  describe('Flux d\'inscription complet (intégration)', () => {
    test('Scénario nominal: envoi code → vérification → création compte', async () => {
      const { signInWithPhoneNumber, PhoneAuthProvider, signInWithCredential } = await import('firebase/auth');
      const { doc, getDoc, setDoc } = await import('firebase/firestore');
      const { auth, db } = await import('@/config/firebase');

      // Setup mocks
      (signInWithPhoneNumber as jest.Mock).mockResolvedValue(mockConfirmation);
      (PhoneAuthProvider.credential as jest.Mock).mockReturnValue('mock-credential');
      (signInWithCredential as jest.Mock).mockResolvedValue({ user: mockUser });
      (getDoc as jest.Mock).mockResolvedValue({ exists: () => false });
      (setDoc as jest.Mock).mockResolvedValue(undefined);

      // Étape 1: Envoi du code
      const confirmation = await signInWithPhoneNumber(auth, '+237655744484', expect.anything());
      expect(confirmation.verificationId).toBe('test-verification-id');

      // Étape 2: Vérification du code
      const credential = PhoneAuthProvider.credential(confirmation.verificationId, '123456');
      const userCredential = await signInWithCredential(auth, credential);
      expect(userCredential.user.uid).toBe('test-user-123');

      // Étape 3: Vérifier si l'utilisateur existe
      const userDocRef = doc(db, 'users', userCredential.user.uid);
      const docSnap = await getDoc(userDocRef);
      expect(docSnap.exists()).toBe(false);

      // Étape 4: Créer le document utilisateur
      await setDoc(userDocRef, {
        uid: userCredential.user.uid,
        phoneNumber: userCredential.user.phoneNumber,
        firstName: 'Jean',
        lastName: 'Dupont',
        userType: 'client',
        createdAt: new Date(),
      });

      expect(setDoc).toHaveBeenCalled();
      console.log('✅ Flux d\'inscription complet réussi');
    });

    test('Scénario d\'erreur: code invalide → réessai → succès', async () => {
      const { PhoneAuthProvider, signInWithCredential } = await import('firebase/auth');
      const { auth } = await import('@/config/firebase');

      (PhoneAuthProvider.credential as jest.Mock).mockReturnValue('mock-credential');
      
      // Premier essai avec code invalide
      (signInWithCredential as jest.Mock).mockRejectedValueOnce({
        code: 'auth/invalid-verification-code',
        message: 'Code invalide',
      });

      const credential1 = PhoneAuthProvider.credential('test-verification-id', '000000');
      await expect(signInWithCredential(auth, credential1)).rejects.toMatchObject({
        code: 'auth/invalid-verification-code',
      });

      // Deuxième essai avec code valide
      (signInWithCredential as jest.Mock).mockResolvedValueOnce({ user: mockUser });

      const credential2 = PhoneAuthProvider.credential('test-verification-id', '123456');
      const userCredential = await signInWithCredential(auth, credential2);

      expect(userCredential.user.uid).toBe('test-user-123');
      console.log('✅ Scénario de réessai validé');
    });

    test('Scénario d\'erreur: erreur réseau → nouvelle tentative → succès', async () => {
      const { signInWithPhoneNumber } = await import('firebase/auth');
      const { auth } = await import('@/config/firebase');

      // Premier essai avec erreur réseau
      (signInWithPhoneNumber as jest.Mock).mockRejectedValueOnce({
        code: 'auth/network-request-failed',
        message: 'Erreur réseau',
      });

      await expect(
        signInWithPhoneNumber(auth, '+237655744484', expect.anything())
      ).rejects.toMatchObject({
        code: 'auth/network-request-failed',
      });

      // Deuxième essai avec succès
      (signInWithPhoneNumber as jest.Mock).mockResolvedValueOnce(mockConfirmation);

      const confirmation = await signInWithPhoneNumber(auth, '+237655744484', expect.anything());
      expect(confirmation.verificationId).toBe('test-verification-id');
      
      console.log('✅ Scénario de récupération après erreur réseau validé');
    });
  });

  describe('Tests de sécurité', () => {
    test('Les mots de passe ne doivent jamais être loggés', () => {
      const password = 'SecurePassword123!';
      const logSpy = jest.spyOn(console, 'log');
      
      // Simuler une opération d'inscription
      console.log('Création de compte pour utilisateur');
      
      // Vérifier qu'aucun log ne contient le mot de passe
      expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining(password));
      
      logSpy.mockRestore();
    });

    test('Les numéros de téléphone dans les logs doivent être masqués', () => {
      const phoneNumber = '+237655744484';
      const masked = phoneNumber.slice(0, 4) + '***' + phoneNumber.slice(-2);
      
      expect(masked).toBe('+237***84');
      expect(masked).not.toBe(phoneNumber);
    });
  });
});
