/**
 * Service de Messagerie In-App (multi-domaines : taxi, food, parcel)
 *
 * Architecture :
 * - Top-level collection `conversations/{conversationId}` avec sous-collection `messages/`
 * - conversationId déterministe : `${type}_${entityId}_${uidA__uidB}` (uids triés)
 */

import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  getDocs,
  getDoc,
  increment,
  limit,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { Message, MessageType } from '@/types/chat';
import {
  ConversationContext,
  ConversationParticipant,
  buildConversationId,
} from '@/types/conversation';
import { logger } from '@/utils/logger';

/**
 * Crée le document de conversation s'il n'existe pas, et retourne son id.
 * Idempotent : safe à appeler plusieurs fois.
 */
export const ensureConversation = async (
  context: ConversationContext
): Promise<string> => {
  const conversationId = buildConversationId(
    context.type,
    context.entityId,
    context.participantA.uid,
    context.participantB.uid
  );

  const convRef = doc(db, 'conversations', conversationId);
  const snap = await getDoc(convRef);

  if (!snap.exists()) {
    const participantsMap: Record<string, ConversationParticipant> = {
      [context.participantA.uid]: context.participantA,
      [context.participantB.uid]: context.participantB,
    };

    await setDoc(convRef, {
      type: context.type,
      entityId: context.entityId,
      participants: participantsMap,
      participantUids: [context.participantA.uid, context.participantB.uid],
      lastMessage: null,
      lastMessageAt: null,
      unreadCount: {
        [context.participantA.uid]: 0,
        [context.participantB.uid]: 0,
      },
      createdAt: serverTimestamp(),
    });

    logger.info('Conversation créée', { conversationId, type: context.type });
  }

  return conversationId;
};

/**
 * Envoyer un message dans une conversation.
 */
export const sendMessage = async (
  conversationId: string,
  senderId: string,
  senderName: string,
  senderType: string,
  content: string,
  type: MessageType = 'text'
): Promise<string> => {
  try {
    const messagesRef = collection(db, 'conversations', conversationId, 'messages');

    const messageData = {
      conversationId,
      senderId,
      senderName,
      senderType,
      type,
      content,
      read: false,
      createdAt: serverTimestamp(),
    };

    const docRef = await addDoc(messagesRef, messageData);

    // Mettre à jour le doc parent : lastMessage + compteurs unread (par uid)
    const convRef = doc(db, 'conversations', conversationId);
    const convSnap = await getDoc(convRef);

    if (convSnap.exists()) {
      const data = convSnap.data();
      const participantUids: string[] =
        data.participantUids || Object.keys(data.participants || {});
      const updates: Record<string, unknown> = {
        lastMessage: content,
        lastMessageAt: serverTimestamp(),
      };
      participantUids.forEach((uid) => {
        if (uid !== senderId) {
          updates[`unreadCount.${uid}`] = increment(1);
        }
      });
      await updateDoc(convRef, updates);
    }

    logger.info('Message envoyé', { conversationId, senderId, type });
    return docRef.id;
  } catch (error) {
    logger.error('Erreur envoi message', { error, conversationId });
    throw error;
  }
};

/**
 * Écouter les messages d'une conversation en temps réel.
 */
export const subscribeToMessages = (
  conversationId: string,
  callback: (messages: Message[]) => void
): (() => void) => {
  const messagesRef = collection(db, 'conversations', conversationId, 'messages');
  const q = query(messagesRef, orderBy('createdAt', 'asc'), limit(200));

  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const messages: Message[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as Message[];
      callback(messages);
    },
    (error) => {
      logger.error('Erreur écoute messages', { error, conversationId });
    }
  );

  return unsubscribe;
};

/**
 * Marque tous les messages reçus par `userId` comme lus, et reset le compteur.
 */
export const markMessagesAsRead = async (
  conversationId: string,
  userId: string
): Promise<void> => {
  try {
    const messagesRef = collection(db, 'conversations', conversationId, 'messages');
    // Marquer comme lus uniquement les messages NON envoyés par l'utilisateur courant.
    const q = query(
      messagesRef,
      where('read', '==', false),
      where('senderId', '!=', userId),
      limit(200)
    );

    const snapshot = await getDocs(q);
    const BATCH_LIMIT = 500;
    const docs = snapshot.docs;

    for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
      const chunk = docs.slice(i, i + BATCH_LIMIT);
      const batch = writeBatch(db);
      chunk.forEach((docSnap) => {
        batch.update(docSnap.ref, { read: true });
      });
      await batch.commit();
    }

    // Réinitialiser le compteur unread pour cet utilisateur
    const convRef = doc(db, 'conversations', conversationId);
    await updateDoc(convRef, {
      [`unreadCount.${userId}`]: 0,
    });

    logger.info('Messages marqués comme lus', { conversationId, userId });
  } catch (error) {
    logger.error('Erreur marquage messages lus', { error, conversationId });
  }
};

/**
 * Démarrer un appel vocal (enregistre l'événement comme message).
 */
export const initiateCall = async (
  conversationId: string,
  callerId: string,
  callerName: string,
  callerRole: string
): Promise<void> => {
  try {
    await sendMessage(
      conversationId,
      callerId,
      callerName,
      callerRole,
      `${callerName} souhaite vous appeler`,
      'voice_call'
    );
    logger.info('Appel initié', { conversationId, callerId });
  } catch (error) {
    logger.error('Erreur initiation appel', { error, conversationId });
    throw error;
  }
};

/**
 * Envoyer un message système automatique.
 * Note : la signature reste basée sur bookingId pour rétrocompat avec la Cloud Function existante.
 * Une future refonte backend devra accepter conversationId.
 */
export const sendSystemMessage = async (
  bookingId: string,
  content: string,
  recipient: 'client' | 'chauffeur' = 'client'
): Promise<void> => {
  try {
    const { getFunctions, httpsCallable } = await import('firebase/functions');
    const functions = getFunctions();
    const sendSystemMsg = httpsCallable(functions, 'sendSystemMessage');

    const recipientForBackend = recipient === 'chauffeur' ? 'driver' : recipient;

    await sendSystemMsg({ bookingId, content, recipient: recipientForBackend });

    logger.info('Message système envoyé via Cloud Function', {
      bookingId,
      content,
      recipient,
    });
  } catch (error) {
    logger.error('Erreur message système', { error, bookingId });
  }
};
