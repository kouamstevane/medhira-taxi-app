import { 
  doc, 
  onSnapshot, 
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Capacitor } from '@capacitor/core';
import { db } from '@/config/firebase';
import { VoipCallState, CallStatus, CallParticipant, IVoipEngine } from '@/types/voip';
import { logger } from '@/utils/logger';
import { AgoraVoipEngine } from './voip/engines/agora.engine';

class VoipService {
  private engine: IVoipEngine;
  private callDocUnsubscribe: (() => void) | null = null;

  // État initial
  private state: VoipCallState = {
    status: 'idle',
    direction: null,
    callId: null,
    bookingId: null,
    channel: null,
    token: null,
    caller: null,
    callee: null,
    isMuted: false,
    isSpeakerOn: true,
    startTime: null,
    duration: 0,
    error: null,
  };

  private listeners: ((state: VoipCallState) => void)[] = [];

  constructor(engine?: IVoipEngine) {
    // Par défaut on utilise Agora, mais on peut injecter un autre engine (ex: Zego)
    this.engine = engine || new AgoraVoipEngine();
    
    if (typeof window !== 'undefined') {
      this.initEngine();
    }
  }

  private async initEngine() {
    await this.engine.initialize();
    
    // Configurer les callbacks de l'engine
    this.engine.onRemoteUserJoined = (uid) => {
      logger.info('Participant distant rejoint', { uid });
    };
    
    this.engine.onRemoteUserLeft = (uid) => {
      logger.info('Participant distant parti', { uid });
    };
    
    this.engine.onError = (message) => {
      this.updateState({ error: message });
    };
  }

  // --- Actions ---

  /**
   * Helper pour réessayer une opération avec backoff exponentiel
   */
  private async retryWithBackoff<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
  ): Promise<T> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        const isLastAttempt = attempt === maxRetries - 1;
        
        if (isLastAttempt || !this.isNetworkError(error)) {
          throw error;
        }
        
        const delay = baseDelay * Math.pow(2, attempt);
        logger.info(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw new Error('Max retries exceeded');
  }

  /**
   * Détermine si une erreur est liée au réseau
   */
  private isNetworkError(error: any): boolean {
    const networkErrorCodes = ['UNAVAILABLE', 'RESOURCE_EXHAUSTED', 'DEADLINE_EXCEEDED'];
    return networkErrorCodes.some(code => 
      error?.code === code || 
      error?.message?.includes('network') ||
      error?.message?.includes('timeout')
    );
  }

  /**
   * Vérifie et demande la permission microphone si nécessaire
   */
  private async ensureMicrophonePermission(): Promise<boolean> {
    if (typeof window === 'undefined' || !Capacitor.isNativePlatform()) {
      return true; // Web doesn't need explicit permission check
    }

    try {
      // Sur Android, les permissions sont gérées par le manifest et demandées au runtime
      // Sur iOS, les permissions sont demandées automatiquement par le SDK Agora
      // On retourne true pour laisser le SDK Agora gérer les permissions
      return true;
    } catch (error) {
      logger.error('Error checking microphone permission', { error });
      return true; // Assume granted on error to prevent blocking
    }
  }

  /**
   * Initialise un appel (appelant)
   */
  async startCall(bookingId: string, caller: CallParticipant, callee: CallParticipant): Promise<void> {
    try {
      this.updateState({
        status: 'calling',
        direction: 'outgoing',
        bookingId,
        caller,
        callee,
        error: null,
      });

      const functions = getFunctions();
      
      const response = await this.retryWithBackoff(async () => {
        const createCallFn = httpsCallable(functions, 'createCall');
        return await createCallFn({
          rideId: bookingId,
          calleeId: callee.uid,
        }) as { data: { callId: string, channel: string, token: string } };
      });

      const { callId, channel, token } = response.data;

      // Utilisation des noms génériques
      this.updateState({ callId, channel, token });
      this.subscribeToCallDoc(callId);

      // Check permissions before joining
      const hasPermission = await this.ensureMicrophonePermission();
      if (!hasPermission) {
        throw new Error('Permission microphone requise');
      }

      // Rejoindre le channel via l'engine
      await this.engine.join(channel, token, caller.uid);
      
      logger.info('Appel créé avec succès', { callId });
    } catch (error: any) {
      logger.error('Erreur startCall', { error });
      this.updateState({ 
        status: 'failed', 
        error: error.message || 'Impossible d\'initier l\'appel' 
      });
      throw error;
    }
  }

  /**
   * Accepte un appel (appelé)
   */
  async acceptCall(): Promise<void> {
    if (!this.state.callId) return;

    try {
      const functions = getFunctions();
      const answerCallFn = httpsCallable(functions, 'answerCall');
      
      await answerCallFn({ callId: this.state.callId });

      // Check permissions before joining
      const hasPermission = await this.ensureMicrophonePermission();
      if (!hasPermission) {
        this.endCall('failed');
        throw new Error('Permission microphone requise');
      }

      if (this.state.channel && this.state.token && this.state.callee) {
        await this.engine.join(this.state.channel, this.state.token, this.state.callee.uid);
      }
      
      this.updateState({ status: 'accepted' });
    } catch (error: any) {
      logger.error('Erreur acceptCall', { error });
      this.endCall('failed');
    }
  }

  /**
   * Décline un appel
   */
  async declineCall(): Promise<void> {
    await this.endCall('declined');
  }

  /**
   * Termine un appel
   */
  async endCall(reason: string = 'user_ended'): Promise<void> {
    const callId = this.state.callId;
    
    try {
      if (callId) {
        const functions = getFunctions();
        const endCallFn = httpsCallable(functions, 'endCall');
        await endCallFn({ callId, reason });
      }
    } catch (error) {
      logger.error('Erreur endCall Cloud Function', { error });
    } finally {
      await this.cleanup();
      this.updateState({
        status: reason as CallStatus === 'declined' ? 'declined' : 'ended',
        callId: null,
        bookingId: null,
        channel: null,
        token: null,
      });
    }
  }

  /**
   * Toggle Mute
   */
  async toggleMute(): Promise<void> {
    const newMuted = !this.state.isMuted;
    await this.engine.setMuted(newMuted);
    this.updateState({ isMuted: newMuted });
  }

  /**
   * Suspendre/Reprendre l'écoute (Speaker)
   */
  async toggleSpeaker(): Promise<void> {
    const newSpeaker = !this.state.isSpeakerOn;
    await this.engine.setSpeaker(newSpeaker);
    this.updateState({ isSpeakerOn: newSpeaker });
  }

  // --- Internals ---

  private subscribeToCallDoc(callId: string) {
    if (this.callDocUnsubscribe) this.callDocUnsubscribe();

    this.callDocUnsubscribe = onSnapshot(doc(db, 'calls', callId), (snapshot) => {
      if (!snapshot.exists()) {
        this.endCall('ended');
        return;
      }

      const data = snapshot.data();
      const status = data.status as CallStatus;

      if (status === 'ended' || status === 'declined') {
        this.endCall(status);
      } else if (status === 'accepted' && this.state.status !== 'accepted') {
        this.updateState({ status: 'accepted', startTime: Date.now() });
      } else if (status === 'ringing' && this.state.status === 'calling') {
        this.updateState({ status: 'ringing' });
      }
    });
  }

  private async cleanup() {
    if (this.callDocUnsubscribe) {
      this.callDocUnsubscribe();
      this.callDocUnsubscribe = null;
    }

    await this.engine.leave();
  }

  // --- State Management ---

  private updateState(partialState: Partial<VoipCallState>) {
    this.state = { ...this.state, ...partialState };
    this.notifyListeners();
  }

  private notifyListeners() {
    this.listeners.forEach(l => l(this.state));
  }

  subscribe(listener: (state: VoipCallState) => void) {
    this.listeners.push(listener);
    listener(this.state);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  getState(): VoipCallState {
    return this.state;
  }
  
  /**
   * Détecte un appel entrant depuis une notification ou un listener externe
   */
  handleIncomingCall(callId: string, bookingId: string, channel: string, token: string, caller: CallParticipant) {
    // Double-check to prevent race conditions
    if (this.state.status !== 'idle') {
      logger.warn('Rejected incoming call: already in a call', { 
        currentStatus: this.state.status,
        incomingCallId: callId 
      });
      return;
    }

    // Set status to 'ringing' immediately to prevent duplicate handling
    this.updateState({
      status: 'ringing',
      direction: 'incoming',
      callId,
      bookingId,
      channel,
      token,
      caller,
      callee: { 
        uid: caller.uid === this.state.callee?.uid ? this.state.caller?.uid || '' : this.state.callee?.uid || '',
        name: 'Moi',
        role: caller.role === 'client' ? 'chauffeur' : 'client'
      },
      error: null
    });
    
    this.subscribeToCallDoc(callId);
  }
}

export const voipService = new VoipService();
