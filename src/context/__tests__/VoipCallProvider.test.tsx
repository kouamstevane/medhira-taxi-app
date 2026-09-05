import { render } from '@testing-library/react';
import { onSnapshot } from 'firebase/firestore';
import { useAuth } from '@/hooks/useAuth';
import { VoipCallProvider } from '../VoipCallProvider';

jest.mock('@/hooks/useAuth', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/hooks/useVoipCall', () => ({
  useVoipCall: jest.fn(() => ({ callState: { status: 'idle' } })),
}));

jest.mock('@/services/voip.service', () => ({
  voipService: {
    getState: jest.fn(() => ({ status: 'idle' })),
    handleIncomingCall: jest.fn(),
  },
}));

jest.mock('@/services/pushNotifications.service', () => ({
  pushNotifications: { addListener: jest.fn(() => jest.fn()) },
}));

jest.mock('@/components/IncomingCallOverlay', () => ({
  IncomingCallOverlay: () => null,
}));

jest.mock('@/components/ActiveCallOverlay', () => ({
  ActiveCallOverlay: () => null,
}));

jest.mock('@/config/firebase', () => ({ db: {} }));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(() => ({})),
  query: jest.fn(() => ({})),
  where: jest.fn(),
  limit: jest.fn(),
  onSnapshot: jest.fn(() => jest.fn()),
}));

describe('VoipCallProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useAuth as jest.Mock).mockReturnValue({ currentUser: { uid: 'user-1' } });
  });

  it('registers an error callback for the incoming-call listener', () => {
    render(
      <VoipCallProvider>
        <div />
      </VoipCallProvider>,
    );

    expect(onSnapshot).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(Function),
      expect.any(Function),
    );
  });
});
