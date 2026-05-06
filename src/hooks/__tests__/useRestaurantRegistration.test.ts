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
