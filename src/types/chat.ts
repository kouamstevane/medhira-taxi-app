import { Timestamp } from 'firebase/firestore';

/**
 * Types pour le système de messagerie in-app
 */

export type MessageType = 'text' | 'voice_call' | 'system';

export interface Message {
  id: string;
  /** @deprecated Utiliser `conversationId`. Conservé pour rétrocompatibilité. */
  bookingId?: string;
  conversationId?: string;
  senderId: string;
  senderName: string;
  /** Rôle générique de l'expéditeur — voir ParticipantRole pour la liste complète */
  senderType: string;
  type: MessageType;
  content: string;
  read: boolean;
  createdAt: Timestamp;
}

export interface ChatSession {
  bookingId: string;
  participants: {
    clientId: string;
    clientName: string;
    driverId: string;
    driverName: string;
  };
  lastMessage?: string;
  lastMessageAt?: Timestamp;
  unreadCount: {
    client: number;
    driver: number;
  };
}
