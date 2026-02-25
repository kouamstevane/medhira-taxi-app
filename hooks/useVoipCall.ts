/**
 * Hook React pour gérer les appels VoIP
 * Interface principale pour les composants UI
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Haptics } from '@capacitor/haptics';
import { App } from '@capacitor/app';
import { agoraService } from '../services/voip/AgoraService';
import { signalingService } from '../services/voip/SignalingService';
import {
  VoipCall,
  CallStatus,
  LocalCallState,
  CreateCallParams,
  CallEndReason,
  DEFAULT_CALL_TIMEOUTS
} from '../types/voip';
import { useAuth } from '../src/hooks/useAuth';

/**
 * Hook pour gérer les appels VoIP
 */
export function useVoipCall() {
  const { currentUser } = useAuth();
  const router = useRouter();

  // État local de l'appel
  const [currentCall, setCurrentCall] = useState<VoipCall | null>(null);
  const [callStatus, setCallStatus] = useState<CallStatus | null>(null);
  const [isInCall, setIsInCall] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Refs pour éviter les stale closures
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const statusUnsubscribeRef = useRef<(() => void) | null>(null);
  const incomingCallUnsubscribeRef = useRef<(() => void) | null>(null);
  const callTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Ref pour callStatus (évite stale closure dans timeouts)
  const callStatusRef = useRef<CallStatus | null>(null);
  useEffect(() => {
    callStatusRef.current = callStatus;
  }, [callStatus]);

  // Ref pour isInCall
  const isInCallRef = useRef(false);
  useEffect(() => {
    isInCallRef.current = isInCall;
  }, [isInCall]);

  /**
   * Initialiser Agora au mount du composant
   */
  useEffect(() => {
    const initAgora = async () => {
      try {
        await agoraService.initialize({
          mode: 'rtc',
          codec: 'vp8',
          audioScenario: 'SPEECH',
          enableAudioVolumeIndication: true,
          cpuUsage: 'low'
        });
        console.log('[useVoipCall] Agora initialized');
      } catch (err: any) {
        console.error('[useVoipCall] Failed to initialize Agora:', err);
        setError(err.message || 'Failed to initialize VoIP service');
      }
    };

    initAgora();

    // Cleanup au démontage
    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
      if (statusUnsubscribeRef.current) {
        statusUnsubscribeRef.current();
      }
      if (incomingCallUnsubscribeRef.current) {
        incomingCallUnsubscribeRef.current();
      }
      if (callTimeoutRef.current) {
        clearTimeout(callTimeoutRef.current);
      }

      // Nettoyer les services
      signalingService.cleanup();
      agoraService.removeAllListeners();
    };
  }, []);

  /**
   * Écouter les appels entrants
   */
  useEffect(() => {
    if (!currentUser) return;

    incomingCallUnsubscribeRef.current = signalingService.listenForIncomingCall(
      currentUser.uid,
      (incomingCall: VoipCall) => {
        setCurrentCall(incomingCall);
        setCallStatus('ringing');
        setError(null);

        // Vibration via Capacitor Haptics
        Haptics.vibrate({ duration: 500 });
        
        // Vibration répétée pour sonnerie
        const vibrateInterval = setInterval(() => {
          if (callStatusRef.current === 'ringing') {
            Haptics.vibrate({ duration: 500 });
          } else {
            clearInterval(vibrateInterval);
          }
        }, 2000);

        // Timeout auto-annulation
        callTimeoutRef.current = setTimeout(() => {
          if (callStatusRef.current === 'ringing') {
            handleCallTimeout(incomingCall.id);
          }
        }, DEFAULT_CALL_TIMEOUTS.ringTimeout);
      }
    );

    return () => {
      if (incomingCallUnsubscribeRef.current) {
        incomingCallUnsubscribeRef.current();
      }
    };
  }, [currentUser]);

  /**
   * Gérer le timeout d'appel (pas de réponse)
   */
  const handleCallTimeout = async (callId: string) => {
    if (callStatusRef.current === 'ringing') {
      try {
        await signalingService.endCall(callId, 'no_answer');
        setCurrentCall(null);
        setCallStatus(null);
        setError('Appel sans réponse');
      } catch (error) {
        console.error('[useVoipCall] Error handling timeout:', error);
      }
    }
  };

  /**
   * Démarrer le timer de durée d'appel
   */
  useEffect(() => {
    if (isInCall) {
      durationIntervalRef.current = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    } else {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
      setCallDuration(0);
    }

    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
    };
  }, [isInCall]);

  /**
   * Gérer l'acceptation de l'appel (appelé par le listener uniquement)
   */
  const handleCallAccepted = async (call: VoipCall) => {
    try {
      // Annuler le timeout
      if (callTimeoutRef.current) {
        clearTimeout(callTimeoutRef.current);
      }

      // Rejoindre le channel Agora
      await agoraService.joinChannel(
        call.channel,
        call.token,
        currentUser!.uid
      );

      setIsInCall(true);
      setError(null);

      // Feedback haptique
      await Haptics.vibrate({ duration: 50 });

    } catch (err: any) {
      console.error('[useVoipCall] Error accepting call:', err);
      setError(err.message || 'Impossible de répondre à l\'appel');
      await signalingService.endCall(call.id, 'connection_failed');
    }
  };

  /**
   * Démarrer un appel sortant
   */
  const startCall = useCallback(async (params: CreateCallParams) => {
    if (!currentUser) {
      setError('Utilisateur non authentifié');
      return;
    }

    try {
      setError(null);

      // Créer l'appel via Cloud Function
      const result = await signalingService.createCall(params);

      // Créer l'objet appel local
      const call: VoipCall = {
        id: result.callId,
        callerId: currentUser.uid,
        calleeId: params.calleeId,
        rideId: params.rideId,
        status: 'ringing',
        startTime: { seconds: Date.now() / 1000, nanoseconds: 0 } as any,
        channel: result.channel,
        token: result.token,
        callerMetadata: {
          name: currentUser.displayName || 'Vous',
          avatar: currentUser.photoURL || undefined,
          role: 'client', // À déterminer selon contexte
          uid: currentUser.uid
        }
      };

      setCurrentCall(call);
      setCallStatus('ringing');

      // Écouter les changements de statut
      statusUnsubscribeRef.current = signalingService.listenToCallStatus(
        result.callId,
        (status: CallStatus, updatedCall?: VoipCall) => {
          setCallStatus(status);

          if (updatedCall) {
            setCurrentCall(updatedCall);
          }

          if (status === 'accepted') {
            // Appeler handleCallAccepted (ne PAS appeler answerCall ici)
            handleCallAccepted(updatedCall || call);
          } else if (status === 'declined' || status === 'failed') {
            handleCallFailed(status);
          }
        }
      );

    } catch (err: any) {
      console.error('[useVoipCall] Error starting call:', err);
      setError(err.message || 'Impossible de démarrer l\'appel');
      setCurrentCall(null);
      setCallStatus(null);
    }
  }, [currentUser]);

  /**
   * Gérer l'échec de l'appel
   */
  const handleCallFailed = async (status: CallStatus) => {
    const reason = status === 'declined' ? 'declined' : 'failed';

    if (currentCall) {
      await signalingService.endCall(currentCall.id, reason as CallEndReason);
    }

    setCurrentCall(null);
    setCallStatus(null);
    setIsInCall(false);

    if (reason === 'declined') {
      setError('Appel refusé');
    } else {
      setError('Appel échoué');
    }
  };

  /**
   * Répondre à un appel entrant
   */
  const answerCall = useCallback(async (call: VoipCall) => {
    try {
      setError(null);

      if (callTimeoutRef.current) {
        clearTimeout(callTimeoutRef.current);
      }

      // Répondre via Cloud Function
      await signalingService.answerCall(call.id);

      // Rejoindre le channel Agora
      await agoraService.joinChannel(
        call.channel,
        call.token,
        currentUser!.uid
      );

      setCurrentCall(call);
      setIsInCall(true);
      setCallStatus('accepted');

      // Feedback haptique
      await Haptics.vibrate({ duration: 50 });

    } catch (err: any) {
      console.error('[useVoipCall] Error answering call:', err);
      setError(err.message || 'Impossible de répondre à l\'appel');
    }
  }, [currentUser]);

  /**
   * Refuser un appel entrant
   */
  const declineCall = useCallback(async (callId: string) => {
    try {
      setError(null);

      if (callTimeoutRef.current) {
        clearTimeout(callTimeoutRef.current);
      }

      await signalingService.declineCall(callId);

      setCurrentCall(null);
      setCallStatus(null);
      setIsInCall(false);

      // Feedback haptique
      await Haptics.vibrate({ duration: 50 });

    } catch (err: any) {
      console.error('[useVoipCall] Error declining call:', err);
      setError(err.message || 'Impossible de refuser l\'appel');
    }
  }, []);

  /**
   * Terminer un appel en cours
   */
  const endCall = useCallback(async (reason?: CallEndReason) => {
    try {
      setError(null);

      if (currentCall) {
        await signalingService.endCall(currentCall.id, reason);
      }

      // Quitter le channel Agora
      await agoraService.leave();

      setCurrentCall(null);
      setCallStatus(null);
      setIsInCall(false);
      setCallDuration(0);

      // Feedback haptique
      await Haptics.vibrate({ duration: 50 });

    } catch (err: any) {
      console.error('[useVoipCall] Error ending call:', err);
      setError(err.message || 'Impossible de terminer l\'appel');
    }
  }, [currentCall]);

  /**
   * Activer/désactiver le micro
   */
  const toggleMute = useCallback(async () => {
    try {
      const newMutedState = !isMuted;
      await agoraService.muteLocalAudio(newMutedState);
      setIsMuted(newMutedState);
      
      // Feedback haptique
      await Haptics.vibrate({ duration: 30 });
    } catch (err) {
      console.error('[useVoipCall] Error toggling mute:', err);
    }
  }, [isMuted]);

  /**
   * Activer/désactiver le haut-parleur
   */
  const toggleSpeaker = useCallback(async () => {
    try {
      const newSpeakerState = !isSpeaker;
      await agoraService.setEnableSpeakerphone(newSpeakerState);
      setIsSpeaker(newSpeakerState);
      
      // Feedback haptique
      await Haptics.vibrate({ duration: 30 });
    } catch (err) {
      console.error('[useVoipCall] Error toggling speaker:', err);
    }
  }, [isSpeaker]);

  /**
   * Basculer vers le chat si l'appel échoue
   */
  const fallbackToChat = useCallback(() => {
    if (currentCall) {
      router.push(`/chat/${currentCall.rideId}`);
    }
  }, [currentCall, router]);

  return {
    // État
    currentCall,
    callStatus,
    isInCall,
    isMuted,
    isSpeaker,
    callDuration,
    error,

    // Actions
    startCall,
    answerCall,
    declineCall,
    endCall,
    toggleMute,
    toggleSpeaker,
    fallbackToChat,

    // Utilitaires
    clearError: () => setError(null),
    hasActiveCall: currentCall !== null && isInCall
  };
}

/**
 * Type pour le retour du hook
 */
export type UseVoipCallReturn = ReturnType<typeof useVoipCall>;
