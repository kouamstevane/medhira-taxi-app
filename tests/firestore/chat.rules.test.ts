import {
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { addDoc, collection, doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('Conversation Firestore rules', () => {
  let testEnv: RulesTestEnvironment;

  const restaurantUid = 'restaurant-chat-test';
  const clientUid = 'client-chat-test';
  const conversationId = 'food_order-chat-test_client-chat-test__restaurant-chat-test';
  const participants = {
    [restaurantUid]: { uid: restaurantUid, name: 'Restaurant', role: 'restaurant' },
    [clientUid]: { uid: clientUid, name: 'Client', role: 'client' },
  };

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'medjira-taxi-test',
      firestore: {
        rules: readFileSync(join(__dirname, '../../firestore.rules'), 'utf8'),
        host: '127.0.0.1',
        port: 8080,
      },
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  it('allows both participants to send and read messages regardless of participant order', async () => {
    const restaurantDb = testEnv.authenticatedContext(restaurantUid).firestore();
    const clientDb = testEnv.authenticatedContext(clientUid).firestore();
    const conversationRef = doc(restaurantDb, 'conversations', conversationId);

    await assertSucceeds(
      setDoc(conversationRef, {
        type: 'food',
        entityId: 'order-chat-test',
        participants,
        participantUids: [restaurantUid, clientUid],
        createdAt: Timestamp.now(),
      }),
    );

    await assertSucceeds(
      setDoc(doc(clientDb, 'conversations', conversationId), {
        type: 'food',
        entityId: 'order-chat-test',
        participants,
        participantUids: [clientUid, restaurantUid],
        createdAt: Timestamp.now(),
      }, { merge: true }),
    );

    const restaurantMessage = await addDoc(collection(restaurantDb, 'conversations', conversationId, 'messages'), {
      conversationId,
      senderId: restaurantUid,
      senderName: 'Restaurant',
      senderType: 'restaurant',
      type: 'text',
      content: 'Bonjour',
      read: false,
      createdAt: Timestamp.now(),
    });

    await assertSucceeds(getDoc(doc(clientDb, 'conversations', conversationId, 'messages', restaurantMessage.id)));

    const clientMessage = await addDoc(collection(clientDb, 'conversations', conversationId, 'messages'), {
      conversationId,
      senderId: clientUid,
      senderName: 'Client',
      senderType: 'client',
      type: 'text',
      content: 'Bonjour, merci',
      read: false,
      createdAt: Timestamp.now(),
    });

    await assertSucceeds(getDoc(doc(restaurantDb, 'conversations', conversationId, 'messages', clientMessage.id)));
  });
});
