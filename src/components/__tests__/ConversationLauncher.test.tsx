import { render, screen } from '@testing-library/react';
import { ConversationLauncher } from '../ConversationLauncher';

jest.mock('@/components/ui/MaterialIcon', () => ({
  MaterialIcon: ({ name }: { name: string }) => <span>{name}</span>,
}));

jest.mock('@/components/ChatModal', () => ({
  ChatModal: () => null,
}));

jest.mock('@/hooks/useVoipCall', () => ({
  useVoipCall: () => ({ startCall: jest.fn() }),
}));

jest.mock('@/services/chat.service', () => ({
  ensureConversation: jest.fn(),
}));

describe('ConversationLauncher', () => {
  it('uses compact flexible buttons for labeled contact actions', () => {
    render(
      <ConversationLauncher
        context={{
          type: 'food',
          entityId: 'order-1',
          participantA: { uid: 'restaurant-1', name: 'Restaurant', role: 'restaurant' },
          participantB: { uid: 'client-1', name: 'Client', role: 'client' },
        }}
        currentUserUid="restaurant-1"
        variant="icon-label"
      />,
    );

    expect(screen.getByRole('button', { name: 'Ouvrir la conversation' })).toHaveClass('h-9');
    expect(screen.getByRole('button', { name: 'Ouvrir la conversation' })).not.toHaveClass('w-10');
    expect(screen.getByRole('button', { name: 'Appeler' })).toHaveClass('whitespace-nowrap');
  });

  it('uses compact circular buttons for icon-only contact actions', () => {
    render(
      <ConversationLauncher
        context={{
          type: 'food',
          entityId: 'order-1',
          participantA: { uid: 'restaurant-1', name: 'Restaurant', role: 'restaurant' },
          participantB: { uid: 'client-1', name: 'Client', role: 'client' },
        }}
        currentUserUid="restaurant-1"
        variant="icon-only"
      />,
    );

    expect(screen.getByRole('button', { name: 'Ouvrir la conversation' })).toHaveClass('h-9', 'w-9');
    expect(screen.getByRole('button', { name: 'Ouvrir la conversation' })).not.toHaveTextContent('Message');
    expect(screen.getByRole('button', { name: 'Appeler' })).not.toHaveTextContent('Appeler');
  });
});
