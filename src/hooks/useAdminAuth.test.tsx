import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('firebase/auth', () => ({
  onAuthStateChanged: jest.fn(),
}));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(() => ({})),
  doc: jest.fn(() => ({})),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  limit: jest.fn(() => ({})),
  query: jest.fn(() => ({})),
  where: jest.fn(() => ({})),
}));

jest.mock('@/config/firebase', () => ({ auth: {}, db: {} }));
jest.mock('@/utils/logger', () => ({ createLogger: () => ({ error: jest.fn() }) }));

const { getDoc: mockGetDoc } = require('firebase/firestore') as { getDoc: jest.Mock };
const { onAuthStateChanged: mockOnAuthStateChanged } = require('firebase/auth') as { onAuthStateChanged: jest.Mock };
const mockPush = jest.fn();
const mockUnsubscribe = jest.fn();
const mockUser = { uid: 'admin-1' };
const { useAdminAuth } = require('./useAdminAuth') as typeof import('./useAdminAuth');

function AuthProbe() {
  const isAdmin = useAdminAuth();
  return <span>{isAdmin === null ? 'pending' : isAdmin ? 'ready' : 'denied'}</span>;
}

describe('useAdminAuth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(require('next/navigation'), 'useRouter').mockReturnValue({ push: mockPush });
    mockOnAuthStateChanged.mockImplementation((_auth: unknown, callback: (user: typeof mockUser) => void) => {
      callback(mockUser);
      return mockUnsubscribe;
    });
    mockGetDoc.mockResolvedValue({ exists: () => true });
  });

  it('reuses a successful admin check when navigating between admin pages', async () => {
    const firstRender = render(<AuthProbe />);
    await waitFor(() => expect(screen.getByText('ready')).toBeInTheDocument());
    firstRender.unmount();

    render(<AuthProbe />);
    await waitFor(() => expect(screen.getByText('ready')).toBeInTheDocument());

    expect(mockGetDoc).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
  });
});
