import { render, screen } from '@testing-library/react';
import { ChatModal } from '../ChatModal';

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ currentUser: { uid: 'restaurant-1' } }),
}));

jest.mock('@/hooks/useVoipCall', () => ({
  useVoipCall: () => ({ startCall: jest.fn() }),
}));

jest.mock('@/components/ui/MaterialIcon', () => ({
  MaterialIcon: ({ name }: { name: string }) => <span>{name}</span>,
}));

jest.mock('@/services/chat.service', () => ({
  subscribeToMessages: jest.fn(() => jest.fn()),
  sendMessage: jest.fn(),
  markMessagesAsRead: jest.fn(),
  ensureConversation: jest.fn(() => new Promise(() => {})),
}));

jest.mock('firebase/firestore', () => ({
  doc: jest.fn(),
  getDoc: jest.fn(),
}));

jest.mock('@/config/firebase', () => ({
  db: {},
}));

beforeAll(() => {
  HTMLElement.prototype.scrollIntoView = jest.fn();
});

describe('ChatModal', () => {
  it('stays above the fixed bottom navigation so the composer remains usable', () => {
    const { container } = render(
      <ChatModal
        context={{
          type: 'food',
          entityId: 'order-1',
          participantA: { uid: 'restaurant-1', name: 'Restaurant', role: 'restaurant' },
          participantB: { uid: 'client-1', name: 'Client', role: 'client' },
        }}
        currentUserUid="restaurant-1"
        onClose={jest.fn()}
      />,
    );

    expect(container.firstElementChild).toHaveClass('z-[60]');
    expect(screen.getByPlaceholderText('Écrivez votre message...')).toBeInTheDocument();
  });
});
