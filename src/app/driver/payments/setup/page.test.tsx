import { render, waitFor } from '@testing-library/react';
import PaymentSetupPage from './page';
import { Browser } from '@capacitor/browser';

const mockReplace = jest.fn();
var mockRouter = { push: jest.fn(), replace: mockReplace };
const mockCreateAccount = jest.fn().mockResolvedValue({ data: { accountId: 'acct_123' } });
const mockCreateLink = jest.fn().mockResolvedValue({ data: { url: 'https://connect.stripe.com/onboarding' } });
const mockGetStatus = jest.fn().mockResolvedValue({
  data: {
    accountId: null,
    status: 'not_created',
    chargesEnabled: false,
    payoutsEnabled: false,
    detailsSubmitted: false,
    disabledReason: null,
    requirements: {
      currently_due: [],
      past_due: [],
      eventually_due: [],
      pending_verification: [],
      current_deadline: null,
    },
  },
});

jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  useSearchParams: () => new URLSearchParams('onboarding=fresh'),
}));

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    currentUser: { uid: 'driver-1', getIdToken: jest.fn().mockResolvedValue('token') },
    loading: false,
  }),
}));

jest.mock('@/config/firebase', () => ({
  app: {},
  auth: {
    currentUser: { uid: 'driver-1', getIdToken: jest.fn().mockResolvedValue('token') },
  },
  db: {},
}));

jest.mock('firebase/firestore', () => ({
  doc: jest.fn(),
  getDoc: jest.fn().mockResolvedValue({
    exists: () => true,
    data: () => ({ stripeAccountId: null, stripeAccountStatus: 'not_created' }),
  }),
}));

jest.mock('firebase/functions', () => ({
  getFunctions: jest.fn(),
  httpsCallable: jest.fn((_functions: unknown, name: string) => {
    if (name === 'createConnectAccount') return mockCreateAccount;
    if (name === 'createConnectOnboardLink') return mockCreateLink;
    return mockGetStatus;
  }),
}));

jest.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: jest.fn(() => true) },
}));

jest.mock('@capacitor/browser', () => ({
  Browser: {
    addListener: jest.fn().mockResolvedValue({ remove: jest.fn() }),
    open: jest.fn().mockResolvedValue(undefined),
  },
}));

describe('PaymentSetupPage', () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockCreateAccount.mockClear();
    mockCreateLink.mockClear();
    mockGetStatus.mockClear();
    (Browser.open as jest.Mock).mockClear();
  });

  it('opens the Stripe form automatically after a fresh driver registration', async () => {
    render(<PaymentSetupPage />);

    await waitFor(() => {
      expect(mockCreateAccount).toHaveBeenCalledWith({ country: expect.any(String) });
      expect(mockCreateLink).toHaveBeenCalledTimes(1);
      expect(mockGetStatus).toHaveBeenCalledTimes(1);
      expect(Browser.open).toHaveBeenCalledWith({
        url: 'https://connect.stripe.com/onboarding',
        presentationStyle: 'popover',
      });
    });
  });
});
