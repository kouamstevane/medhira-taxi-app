import { Timestamp } from 'firebase/firestore';

/**
 * Types pour le système de messagerie in-app
 */

export type MessageType = 'text' | 'voice_call' | 'system';

export interface Message {
  id: string;
  bookingId: string;
  senderId: string;
  senderName: string;
  senderType: 'client' | 'driver';
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
