/**
 * Service de Messagerie In-App
 * 
 * Gère les communications entre clients et chauffeurs sans échange de numéros personnels
 */

import {
  collection,
  doc,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  getDocs,
  increment,
  limit,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { Message, MessageType } from '@/types/chat';
import { logger } from '@/utils/logger';

/**
 * Envoyer un message dans une conversation de course
 */
export const sendMessage = async (
  bookingId: string,
  senderId: string,
  senderName: string,
  senderType: 'client' | 'chauffeur',
  content: string,
  type: MessageType = 'text'
): Promise<string> => {
  try {
    const messagesRef = collection(db, 'bookings', bookingId, 'messages');
    
    const messageData = {
      bookingId,
      senderId,
      senderName,
      senderType,
      type,
      content,
      read: false,
      createdAt: serverTimestamp(),
    };

    const docRef = await addDoc(messagesRef, messageData);
    
    // Mettre à jour le compteur de messages non lus
    // Note: Les champs Firestore utilisent encore 'driver' pour la compatibilité
    const bookingRef = doc(db, 'bookings', bookingId);
    const unreadField = senderType === 'client' 
      ? 'unreadMessages.driver' 
      : 'unreadMessages.client';
    
    await updateDoc(bookingRef, {
      lastMessage: content,
      lastMessageAt: serverTimestamp(),
      [unreadField]: increment(1),
    });

    logger.info('Message envoyé', { bookingId, senderId, type });
    return docRef.id;
  } catch (error) {
    logger.error('Erreur envoi message', { error, bookingId });
    throw error;
  }
};

/**
 * Écouter les messages d'une course en temps réel
 */
export const subscribeToMessages = (
  bookingId: string,
  callback: (messages: Message[]) => void
): (() => void) => {
  const messagesRef = collection(db, 'bookings', bookingId, 'messages');
  const q = query(messagesRef, orderBy('createdAt', 'asc'), limit(200));

  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const messages: Message[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Message[];
      
      callback(messages);
    },
    (error) => {
      logger.error('Erreur écoute messages', { error, bookingId });
    }
  );

  return unsubscribe;
};

/**
 * Marquer tous les messages comme lus
 */
export const markMessagesAsRead = async (
  bookingId: string,
  userId: string,
  userType: 'client' | 'chauffeur'
): Promise<void> => {
  try {
    const messagesRef = collection(db, 'bookings', bookingId, 'messages');
    const q = query(
      messagesRef,
      where('read', '==', false),
      where('senderType', '==', userType === 'client' ? 'chauffeur' : 'client'),
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

    // Réinitialiser le compteur
    // Note: Les champs Firestore utilisent encore 'driver' pour la compatibilité
    const bookingRef = doc(db, 'bookings', bookingId);
    const unreadField = userType === 'client' 
      ? 'unreadMessages.client' 
      : 'unreadMessages.driver';
    
    await updateDoc(bookingRef, {
      [unreadField]: 0,
    });

    logger.info('Messages marqués comme lus', { bookingId, userId });
  } catch (error) {
    logger.error('Erreur marquage messages lus', { error, bookingId });
  }
};

/**
 * Démarrer un appel vocal (enregistre l'événement)
 */
export const initiateCall = async (
  bookingId: string,
  callerId: string,
  callerName: string,
  callerType: 'client' | 'chauffeur'
): Promise<void> => {
  try {
    await sendMessage(
      bookingId,
      callerId,
      callerName,
      callerType,
      `${callerName} souhaite vous appeler`,
      'voice_call'
    );
    
    logger.info('Appel initié', { bookingId, callerId });
  } catch (error) {
    logger.error('Erreur initiation appel', { error, bookingId });
    throw error;
  }
};

/**
 * Envoyer un message système automatique
 * Utilise une Cloud Function car les security rules Firestore
 * ne permettent pas d'écrire avec senderId='system'
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
    
    // Mapper 'chauffeur' vers 'driver' pour la Cloud Function (compatibilité backend)
    const recipientForBackend = recipient === 'chauffeur' ? 'driver' : recipient;
    
    await sendSystemMsg({ bookingId, content, recipient: recipientForBackend });
    
    logger.info('Message système envoyé via Cloud Function', { bookingId, content, recipient });
  } catch (error) {
    logger.error('Erreur message système', { error, bookingId });
  }
};
