import { getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { ensureConversation } from '@/services/chat.service';
import type { ConversationContext } from '@/types/conversation';

jest.mock('firebase/firestore', () => ({
  doc: jest.fn(() => ({ path: 'conversations/test-conversation' })),
  getDoc: jest.fn(),
  serverTimestamp: jest.fn(() => 'server-timestamp'),
  setDoc: jest.fn(),
}));

jest.mock('@/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

const context: ConversationContext = {
  type: 'food',
  entityId: 'order-123',
  participantA: { uid: 'restaurant-uid', name: 'Restaurant', role: 'restaurant' },
  participantB: { uid: 'client-uid', name: 'Client', role: 'client' },
};

describe('ensureConversation', () => {
  it('creates the conversation without requiring a read of a missing document', async () => {
    (getDoc as jest.Mock).mockRejectedValueOnce(new Error('Missing or insufficient permissions'));
    (setDoc as jest.Mock).mockResolvedValueOnce(undefined);

    await expect(ensureConversation(context)).resolves.toBe(
      'food_order-123_client-uid__restaurant-uid'
    );

    expect(getDoc).not.toHaveBeenCalled();
    expect(setDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: 'food',
        entityId: 'order-123',
        participantUids: ['client-uid', 'restaurant-uid'],
      }),
      { merge: true }
    );
    expect(serverTimestamp).toHaveBeenCalled();
  });
});
