/**
 * Service de signalisation pour les appels VoIP
 * Gère la communication avec Firebase (Firestore et Cloud Functions)
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  Unsubscribe,
  QuerySnapshot
} from 'firebase/firestore';
import { httpsCallable, Functions } from 'firebase/functions';
import { firestore, functions } from '../../lib/firebase';
import { VoipCall, CallStatus, CreateCallParams, CreateCallResult, CallEndReason } from '../../types/voip';

/**
 * Service de signalisation pour appels VoIP
 */
export class SignalingService {
  private callListeners: Map<string, Unsubscribe> = new Map();
  private incomingCallListener: Unsubscribe | null = null;

  /**
   * Crée un nouvel appel via Cloud Function
   */
  async createCall(params: CreateCallParams): Promise<CreateCallResult> {
    try {
      const createCallFunction = httpsCallable(functions, 'createCall');
      const result = await createCallFunction(params);

      const data = result.data as { callId: string; channel: string; token: string };

      if (!data.callId || !data.channel || !data.token) {
        throw new Error('Invalid response from createCall function');
      }

      return {
        callId: data.callId,
        channel: data.channel,
        token: data.token
      };
    } catch (error: unknown) {
      console.error('[SignalingService] Error creating call:', error);
      throw new Error(`Failed to create call: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Répond à un appel entrant via Cloud Function
   */
  async answerCall(callId: string): Promise<void> {
    try {
      const answerCallFunction = httpsCallable(functions, 'answerCall');
      await answerCallFunction({ callId });
      console.log('[SignalingService] Call answered:', callId);
    } catch (error: unknown) {
      console.error('[SignalingService] Error answering call:', error);
      throw new Error(`Failed to answer call: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Refuse un appel entrant
   */
  async declineCall(callId: string): Promise<void> {
    try {
      const endCallFunction = httpsCallable(functions, 'endCall');
      await endCallFunction({
        callId,
        reason: 'declined' as CallEndReason
      });
      console.log('[SignalingService] Call declined:', callId);
    } catch (error: unknown) {
      console.error('[SignalingService] Error declining call:', error);
      throw new Error(`Failed to decline call: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Termine un appel en cours
   */
  async endCall(callId: string, reason?: CallEndReason): Promise<void> {
    try {
      const endCallFunction = httpsCallable(functions, 'endCall');
      await endCallFunction({
        callId,
        reason: reason || 'user_ended'
      });
      console.log('[SignalingService] Call ended:', callId, 'reason:', reason);
    } catch (error: unknown) {
      console.error('[SignalingService] Error ending call:', error);
      throw new Error(`Failed to end call: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Récupère un document d'appel par son ID
   */
  async getCall(callId: string): Promise<VoipCall | null> {
    try {
      const callDoc = await getDoc(doc(firestore, 'calls', callId));

      if (!callDoc.exists()) {
        return null;
      }

      return {
        id: callDoc.id,
        ...callDoc.data()
      } as VoipCall;
    } catch (error: unknown) {
      console.error('[SignalingService] Error getting call:', error);
      throw new Error(`Failed to get call: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Récupère les appels actifs pour un utilisateur
   */
  async getActiveCalls(userId: string): Promise<VoipCall[]> {
    try {
      const q = query(
        collection(firestore, 'calls'),
        where('callerId', '==', userId),
        where('status', 'in', ['ringing', 'accepted']),
        orderBy('startTime', 'desc'),
        limit(10)
      );

      const snapshot = await getDocs(q);
      const calls: VoipCall[] = [];

      snapshot.forEach((doc) => {
        calls.push({
          id: doc.id,
          ...doc.data()
        } as VoipCall);
      });

      return calls;
    } catch (error: unknown) {
      console.error('[SignalingService] Error getting active calls:', error);
      throw new Error(`Failed to get active calls: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Écoute les appels entrants pour un utilisateur
   */
  listenForIncomingCall(
    userId: string,
    callback: (call: VoipCall) => void
  ): Unsubscribe {
    // Nettoyer l'écouteur précédent si existe
    if (this.incomingCallListener) {
      this.incomingCallListener();
    }

    const q = query(
      collection(firestore, 'calls'),
      where('calleeId', '==', userId),
      where('status', '==', 'ringing'),
      orderBy('startTime', 'desc'),
      limit(1)
    );

    this.incomingCallListener = onSnapshot(
      q,
      (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const call = {
              id: change.doc.id,
              ...change.doc.data()
            } as VoipCall;

            console.log('[SignalingService] Incoming call detected:', call.id);
            callback(call);
          }
        });
      },
      (error) => {
        console.error('[SignalingService] Error listening for incoming calls:', error);
      }
    );

    return this.incomingCallListener;
  }

  /**
   * Écoute les changements de statut d'un appel
   */
  listenToCallStatus(
    callId: string,
    callback: (status: CallStatus, call?: VoipCall) => void
  ): Unsubscribe {
    // Nettoyer l'écouteur précédent si existe
    if (this.callListeners.has(callId)) {
      this.callListeners.get(callId)!();
    }

    const callRef = doc(firestore, 'calls', callId);

    const unsubscribe = onSnapshot(
      callRef,
      (doc) => {
        if (doc.exists()) {
          const call = {
            id: doc.id,
            ...doc.data()
          } as VoipCall;

          console.log('[SignalingService] Call status updated:', call.id, call.status);
          callback(call.status, call);
        }
      },
      (error) => {
        console.error('[SignalingService] Error listening to call status:', error);
      }
    );

    this.callListeners.set(callId, unsubscribe);

    return unsubscribe;
  }

  /**
   * Arrête d'écouter un appel spécifique
   */
  stopListeningToCall(callId: string): void {
    if (this.callListeners.has(callId)) {
      this.callListeners.get(callId)!();
      this.callListeners.delete(callId);
    }
  }

  /**
   * Arrête d'écouter les appels entrants
   */
  stopListeningForIncomingCalls(): void {
    if (this.incomingCallListener) {
      this.incomingCallListener();
      this.incomingCallListener = null;
    }
  }

  /**
   * Nettoie tous les écouteurs
   */
  cleanup(): void {
    this.stopListeningForIncomingCalls();

    this.callListeners.forEach((unsubscribe) => {
      unsubscribe();
    });

    this.callListeners.clear();

    console.log('[SignalingService] Cleaned up all listeners');
  }

  /**
   * Vérifie si un utilisateur a un appel actif
   */
  async hasActiveCall(userId: string): Promise<boolean> {
    const activeCalls = await this.getActiveCalls(userId);
    return activeCalls.length > 0;
  }

  /**
   * Récupère l'appel associé à une course
   */
  async getCallByRideId(rideId: string): Promise<VoipCall | null> {
    try {
      const q = query(
        collection(firestore, 'calls'),
        where('rideId', '==', rideId),
        where('status', 'in', ['ringing', 'accepted']),
        limit(1)
      );

      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        return null;
      }

      const doc = snapshot.docs[0];
      return {
        id: doc.id,
        ...doc.data()
      } as VoipCall;
    } catch (error: unknown) {
      console.error('[SignalingService] Error getting call by ride:', error);
      throw new Error(`Failed to get call by ride: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

/**
 * Instance singleton du service de signalisation
 */
export const signalingService = new SignalingService();
