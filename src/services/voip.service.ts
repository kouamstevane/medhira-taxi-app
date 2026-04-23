import { 
  doc, 
  onSnapshot, 
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { db } from '@/config/firebase';
import { VoipCallState, CallStatus, CallParticipant, IVoipEngine } from '@/types/voip';
import { logger } from '@/utils/logger';
import { AgoraVoipEngine } from './voip/engines/agora.engine';

interface VoipForegroundPlugin {
  startService(options: { callerName: string; callId: string }): Promise<void>;
  stopService(): Promise<void>;
}

const VoipForeground = registerPlugin<VoipForegroundPlugin>('VoipForeground');

class VoipService {
  private engine: IVoipEngine;
  private callDocUnsubscribe: (() => void) | null = null;
  private isEnding = false;

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
    try {
      await this.engine.initialize();
      
      this.engine.onRemoteUserJoined = (uid) => {
        logger.info('Participant distant rejoint', { uid });
      };
      
      this.engine.onRemoteUserLeft = (uid) => {
        logger.info('Participant distant parti', { uid });
      };
      
      this.engine.onError = (message) => {
        this.updateState({ error: message });
      };
    } catch (error) {
      console.error('[voip.service] initEngine failed:', error);
      this.updateState({ error: 'Initialisation moteur d\'appel échouée' });
    }
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
      } catch (error: unknown) {
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
  private isNetworkError(error: unknown): boolean {
    const networkErrorCodes = ['UNAVAILABLE', 'RESOURCE_EXHAUSTED', 'DEADLINE_EXCEEDED'];
    const err = error as { code?: string; message?: string };
    return networkErrorCodes.some(code => 
      err?.code === code || 
      err?.message?.includes('network') ||
      err?.message?.includes('timeout')
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

      // Start Android foreground service
      if (Capacitor.getPlatform() === 'android') {
        try {
          await VoipForeground.startService({
            callerName: callee.name || 'Client',
            callId: callId
          });
        } catch (e) {
          logger.warn('Failed to start foreground service', { e });
        }
      }

      // Rejoindre le channel via l'engine
      await this.engine.join(channel, token, caller.uid);
      
      logger.info('Appel créé avec succès', { callId });
    } catch (error: unknown) {
      const err = error instanceof Error ? error : error as { message?: string; code?: string };
      logger.error('Erreur startCall', { error });
      this.updateState({ 
        status: 'failed', 
        error: err.message || 'Impossible d\'initier l\'appel' 
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

      // Start Android foreground service
      if (Capacitor.getPlatform() === 'android') {
        try {
          await VoipForeground.startService({
            callerName: this.state.caller?.name || 'Appelant',
            callId: this.state.callId
          });
        } catch (e) {
          logger.warn('Failed to start foreground service', { e });
        }
      }

      if (this.state.channel && this.state.token && this.state.callee) {
        await this.engine.join(this.state.channel, this.state.token, this.state.callee.uid);
      }
      
      this.updateState({ status: 'accepted' });
    } catch (error: unknown) {
      logger.error('Erreur acceptCall', { error });
      this.endCall('failed');
      throw error;
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
    // Re-entrance guard: endCall() is called from an onSnapshot listener
    // (subscribeToCallDoc), and cleanup() unsubscribes that listener, which
    // can itself trigger the listener callback again in some Firestore edge
    // cases. Without this guard, recursive endCall() calls could stack.
    if (this.isEnding) return;
    this.isEnding = true;

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
      try {
        await this.cleanup();
      } catch (cleanupError) {
        console.error('[VoipService] cleanup error:', cleanupError);
      }
      try {
        this.updateState({
          status: (reason as CallStatus) === 'declined' ? 'declined' : 'ended',
          callId: null,
          bookingId: null,
          channel: null,
          token: null,
        });
      } catch (stateError) {
        console.error('[VoipService] state update error:', stateError);
      }
      this.isEnding = false;
    }
  }

  /**
   * Toggle Mute
   */
  async toggleMute(): Promise<void> {
    const newMuted = !this.state.isMuted;
    try {
      await this.engine.setMuted(newMuted);
      this.updateState({ isMuted: newMuted });
    } catch (error) {
      logger.error('Erreur toggleMute', { error });
      throw error;
    }
  }

  /**
   * Suspendre/Reprendre l'écoute (Speaker)
   */
  async toggleSpeaker(): Promise<void> {
    const newSpeaker = !this.state.isSpeakerOn;
    try {
      await this.engine.setSpeaker(newSpeaker);
      this.updateState({ isSpeakerOn: newSpeaker });
    } catch (error) {
      logger.error('Erreur toggleSpeaker', { error });
      throw error;
    }
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

    if (Capacitor.getPlatform() === 'android') {
      try {
        await VoipForeground.stopService();
      } catch (e) {
        logger.warn('Failed to stop foreground service', { e });
      }
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
