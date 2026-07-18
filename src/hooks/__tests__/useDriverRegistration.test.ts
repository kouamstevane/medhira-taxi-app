import { act, renderHook } from '@testing-library/react';
import { useDriverRegistration } from '@/hooks/useDriverRegistration';

const mockPush = jest.fn();
const mockRedirectWithFallback = jest.fn();
const mockSubmitApplication = jest.fn();
const mockCommit = jest.fn();
const mockGetIdToken = jest.fn();

const mockUser = {
  uid: 'driver-123',
  email: 'driver@test.com',
  getIdToken: mockGetIdToken,
};

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@/config/firebase', () => ({
  auth: { currentUser: mockUser },
  db: {},
  app: {},
  getFirebaseStorage: jest.fn(() => ({})),
}));

jest.mock('firebase/auth', () => ({
  onAuthStateChanged: jest.fn((_: unknown, callback: (user: typeof mockUser) => void) => {
    callback(mockUser);
    return jest.fn();
  }),
  deleteUser: jest.fn(),
  fetchSignInMethodsForEmail: jest.fn(),
}));

jest.mock('firebase/firestore', () => ({
  doc: jest.fn((...segments: string[]) => ({ path: segments.join('/') })),
  getDoc: jest.fn(async () => ({ exists: () => false, data: () => undefined })),
  serverTimestamp: jest.fn(() => 'SERVER_TIMESTAMP'),
  updateDoc: jest.fn(),
  writeBatch: jest.fn(() => ({
    set: jest.fn(),
    commit: mockCommit,
  })),
}));

jest.mock('firebase/storage', () => ({
  ref: jest.fn(() => ({ fullPath: 'drivers/driver-123/compliance/file.pdf' })),
  uploadBytes: jest.fn(async () => ({ ref: { fullPath: 'drivers/driver-123/compliance/file.pdf' } })),
  getDownloadURL: jest.fn(async () => 'https://example.com/work-eligibility.pdf'),
  deleteObject: jest.fn(),
}));

jest.mock('firebase/functions', () => ({
  getFunctions: jest.fn(() => ({})),
  httpsCallable: jest.fn((_: unknown, name: string) => {
    if (name === 'submitDriverApplication') {
      return mockSubmitApplication;
    }
    throw new Error(`Unexpected callable: ${name}`);
  }),
}));

jest.mock('@/services', () => ({
  AuthService: {
    signInWithGoogleForDriver: jest.fn(),
  },
}));

jest.mock('@/services/auth.service', () => ({
  createDriverOnboardingAccount: jest.fn(),
}));

jest.mock('@/services/secureStorage.service', () => ({
  secureStorage: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => undefined),
    removeItem: jest.fn(async () => undefined),
  },
}));

jest.mock('@/utils/logger', () => ({
  StructuredLogger: jest.fn().mockImplementation(() => ({
    setUserId: jest.fn(),
    logError: jest.fn(),
    logWarning: jest.fn(),
  })),
}));

jest.mock('@/utils/retry', () => ({
  retryWithBackoff: jest.fn(async (fn: () => Promise<unknown>) => fn()),
}));

jest.mock('@/utils/navigation', () => ({
  redirectWithFallback: (...args: unknown[]) => mockRedirectWithFallback(...args),
}));

jest.mock('@/hooks/useConnectivityMonitor', () => ({
  useConnectivityMonitor: jest.fn(() => true),
  checkConnectivity: jest.fn(() => true),
}));

describe('useDriverRegistration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetIdToken.mockResolvedValue('token');
    mockSubmitApplication.mockResolvedValue({ data: { success: true } });
    mockCommit.mockResolvedValue(undefined);
  });

  it('uses the shared fallback redirect after a successful final submission', async () => {
    const { result } = renderHook(() => useDriverRegistration());

    await act(async () => {
      result.current.handleStep0Next('livreur');
      result.current.setVehicleType('velo');
      await result.current.handleStep2Next({
        firstName: 'Jean',
        lastName: 'Livreur',
        phone: '+33612345678',
        city: 'Paris',
        zipCode: '75001',
        dob: '1990-01-01',
        address: '1 rue de Test',
        province: 'Ile-de-France',
        country: 'France',
      }, null);
      result.current.handleStep3Next({} as never, {});
      result.current.handleStep4Next({
        workEligibility: new File(['permit'], 'permit.pdf', { type: 'application/pdf' }),
      } as never);
      await result.current.handleStep5FinalSubmit({ country: 'FR' });
    });

    expect(mockSubmitApplication).toHaveBeenCalled();
    expect(mockCommit).toHaveBeenCalled();
    expect(mockRedirectWithFallback).toHaveBeenCalledWith(
      expect.objectContaining({ push: mockPush }),
      '/driver/payments/setup?onboarding=fresh'
    );
  });
});
