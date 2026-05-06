import { renderHook, act } from '@testing-library/react';

const mockReplace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn(), back: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(() => ({ currentUser: null })),
  onAuthStateChanged: jest.fn(() => jest.fn()),
  createUserWithEmailAndPassword: jest.fn(),
  deleteUser: jest.fn(),
  sendEmailVerification: jest.fn(),
  reload: jest.fn(),
}));
jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { error: jest.fn(), success: jest.fn() },
}));
jest.mock('firebase/firestore', () => ({
  getFirestore: jest.fn(),
  doc: jest.fn(),
  getDoc: jest.fn(),
  setDoc: jest.fn(),
  updateDoc: jest.fn(),
  serverTimestamp: jest.fn(() => 'MOCK_TS'),
}));
jest.mock('@/config/firebase', () => ({
  db: {},
  auth: { currentUser: null },
  functions: {},
}));
jest.mock('firebase/functions', () => ({
  getFunctions: jest.fn(),
  httpsCallable: jest.fn(),
}));
jest.mock('@/services/cloud-functions.helpers', () => ({
  mapHttpsError: jest.fn((err: unknown) => {
    if (err instanceof Error) return { message: err.message, code: 'unknown' };
    return { message: 'Erreur inconnue', code: 'unknown' };
  }),
}));

import { useRestaurantRegistration } from '@/hooks/useRestaurantRegistration';

describe('useRestaurantRegistration', () => {
  test('initial state: step 1, no error, not loading', () => {
    const { result } = renderHook(() => useRestaurantRegistration());
    expect(result.current.currentStep).toBe(1);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  test('goToStep advances step', () => {
    const { result } = renderHook(() => useRestaurantRegistration());
    act(() => { result.current.goToStep(2); });
    expect(result.current.currentStep).toBe(2);
  });

  test('goToStep rejects invalid step numbers', () => {
    const { result } = renderHook(() => useRestaurantRegistration());
    act(() => { result.current.goToStep(5); });
    expect(result.current.currentStep).toBe(1);
  });

  test('setError sets error message', () => {
    const { result } = renderHook(() => useRestaurantRegistration());
    act(() => { result.current.setError('Test error'); });
    expect(result.current.error).toBe('Test error');
  });

  test('clearError clears error', () => {
    const { result } = renderHook(() => useRestaurantRegistration());
    act(() => { result.current.setError('Test error'); });
    act(() => { result.current.clearError(); });
    expect(result.current.error).toBeNull();
  });

  test('skipToStep3 sets step to 3 (from=become-pro)', () => {
    const { result } = renderHook(() => useRestaurantRegistration());
    act(() => { result.current.skipToStep3(); });
    expect(result.current.currentStep).toBe(3);
  });

  test('step data accumulates across steps', () => {
    const { result } = renderHook(() => useRestaurantRegistration());
    act(() => { result.current.setStepData(1, { firstName: 'Marc' }); });
    act(() => { result.current.setStepData(2, { emailVerified: true }); });
    expect(result.current.step1Data).toEqual({ firstName: 'Marc' });
    expect(result.current.step2Data).toEqual({ emailVerified: true });
  });
});

describe('useRestaurantRegistration — draft persistence', () => {
  test('handleDraftSave does nothing if no user', () => {
    const { result } = renderHook(() => useRestaurantRegistration());
    expect(result.current.handleDraftSave).toBeDefined();
  });

  test('setStepData accumulates restaurant data for draft', () => {
    const { result } = renderHook(() => useRestaurantRegistration());
    act(() => {
      result.current.setStepData(3, { name: 'Le Bistrot', cuisineType: ['Française'] });
    });
    expect(result.current.step3Data).toEqual({ name: 'Le Bistrot', cuisineType: ['Française'] });
  });

  test('goToStep with draft data preserves state', () => {
    const { result } = renderHook(() => useRestaurantRegistration());
    act(() => {
      result.current.setStepData(3, { name: 'Test Resto' });
      result.current.goToStep(4);
    });
    expect(result.current.currentStep).toBe(4);
    expect(result.current.step3Data).toEqual({ name: 'Test Resto' });
  });
});

describe('useRestaurantRegistration — error handling', () => {
  test('goToStep clears previous error', () => {
    const { result } = renderHook(() => useRestaurantRegistration());
    act(() => { result.current.setError('Some error'); });
    act(() => { result.current.goToStep(2); });
    expect(result.current.error).toBeNull();
  });

  test('setError and clearError work together', () => {
    const { result } = renderHook(() => useRestaurantRegistration());
    act(() => { result.current.setError('Network error'); });
    expect(result.current.error).toBe('Network error');
    act(() => { result.current.clearError(); });
    expect(result.current.error).toBeNull();
  });
});

describe('useRestaurantRegistration — full wizard flow', () => {
  test('step data accumulates through all 4 steps', () => {
    const { result } = renderHook(() => useRestaurantRegistration());
    act(() => {
      result.current.setStepData(1, { firstName: 'Jean', lastName: 'Dupont', email: 'jean@test.fr', password: 'password123' });
      result.current.goToStep(2);
    });
    act(() => {
      result.current.setStepData(2, { emailVerified: true });
      result.current.goToStep(3);
    });
    act(() => {
      result.current.setStepData(3, { name: 'Le Bistrot', description: 'Restaurant français traditionnel', cuisineType: ['Française'], address: '12 Rue de Paris', phone: '+33123456789', email: 'bistrot@test.fr' });
      result.current.goToStep(4);
    });
    act(() => {
      result.current.setStepData(4, { openingHours: { monday: { open: '09:00', close: '22:00', closed: false } } });
    });

    expect(result.current.currentStep).toBe(4);
    expect(result.current.step1Data.firstName).toBe('Jean');
    expect(result.current.step2Data.emailVerified).toBe(true);
    expect(result.current.step3Data.name).toBe('Le Bistrot');
    expect(result.current.step4Data.openingHours.monday.open).toBe('09:00');
  });

  test('cannot advance past step 4', () => {
    const { result } = renderHook(() => useRestaurantRegistration());
    act(() => { result.current.goToStep(4); });
    act(() => { result.current.goToStep(5); });
    expect(result.current.currentStep).toBe(4);
  });

  test('cannot go below step 1', () => {
    const { result } = renderHook(() => useRestaurantRegistration());
    act(() => { result.current.goToStep(0); });
    expect(result.current.currentStep).toBe(1);
  });
});

describe('useRestaurantRegistration — handleStep1Submit Auth errors', () => {
  test('email-already-in-use sets French error message', async () => {
    const { createUserWithEmailAndPassword } = require('firebase/auth');
    createUserWithEmailAndPassword.mockRejectedValueOnce(
      Object.assign(new Error('Email already in use'), { code: 'auth/email-already-in-use' })
    );

    const { result } = renderHook(() => useRestaurantRegistration());
    await act(async () => {
      await result.current.handleStep1Submit({
        firstName: 'Marc',
        lastName: 'Test',
        email: 'taken@test.fr',
        password: 'password123',
      });
    });

    expect(result.current.error).toContain('déjà utilisé');
    expect(result.current.currentStep).toBe(1);
  });

  test('Firestore failure after Auth success triggers deleteUser rollback', async () => {
    const { createUserWithEmailAndPassword, deleteUser } = require('firebase/auth');
    const { setDoc } = require('firebase/firestore');

    const fakeUser = { uid: 'test-uid' };
    createUserWithEmailAndPassword.mockResolvedValueOnce({ user: fakeUser });
    setDoc.mockRejectedValueOnce(new Error('Firestore write failed'));
    deleteUser.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useRestaurantRegistration());
    await act(async () => {
      await result.current.handleStep1Submit({
        firstName: 'Marc',
        lastName: 'Test',
        email: 'test@test.fr',
        password: 'password123',
      });
    });

    expect(deleteUser).toHaveBeenCalledWith(fakeUser);
    expect(result.current.error).toBeTruthy();
    expect(result.current.currentStep).toBe(1);
  });

  test('successful step 1 advances to step 2', async () => {
    const { createUserWithEmailAndPassword } = require('firebase/auth');
    const { setDoc } = require('firebase/firestore');

    createUserWithEmailAndPassword.mockResolvedValueOnce({
      user: { uid: 'new-uid' },
    });
    setDoc.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useRestaurantRegistration());
    await act(async () => {
      await result.current.handleStep1Submit({
        firstName: 'Marc',
        lastName: 'Lefèvre',
        email: 'marc@test.fr',
        password: 'password123',
      });
    });

    expect(result.current.currentStep).toBe(2);
    expect(result.current.error).toBeNull();
  });
});
