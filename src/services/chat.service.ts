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
  senderType: 'client' | 'driver',
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
  const q = query(messagesRef, orderBy('createdAt', 'asc'));

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
  userType: 'client' | 'driver'
): Promise<void> => {
  try {
    const messagesRef = collection(db, 'bookings', bookingId, 'messages');
    const q = query(
      messagesRef,
      where('read', '==', false),
      where('senderType', '==', userType === 'client' ? 'driver' : 'client')
    );

    const snapshot = await getDocs(q);
    const updatePromises = snapshot.docs.map((doc) =>
      updateDoc(doc.ref, { read: true })
    );

    await Promise.all(updatePromises);

    // Réinitialiser le compteur
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
  callerType: 'client' | 'driver'
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
 */
export const sendSystemMessage = async (
  bookingId: string,
  content: string,
  recipient: 'client' | 'driver' = 'client' // Par défaut, on notifie le client
): Promise<void> => {
  try {
    // Si le destinataire est le client, l'émetteur simulé doit être 'driver' pour incrémenter le compteur du client
    // Si le destinataire est le chauffeur, l'émetteur simulé doit être 'client' pour incrémenter le compteur du chauffeur
    const simulatedSenderType = recipient === 'client' ? 'driver' : 'client';

    await sendMessage(
      bookingId,
      'system',
      'Système',
      simulatedSenderType,
      content,
      'system'
    );
    
    logger.info('Message système envoyé', { bookingId, content, recipient });
  } catch (error) {
    logger.error('Erreur message système', { error, bookingId });
  }
};
