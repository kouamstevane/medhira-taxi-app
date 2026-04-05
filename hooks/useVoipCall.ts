/**
 * Hook React pour gérer les appels VoIP
 * C'est un wrapper autour de voipService (Zustand-like)
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Haptics } from '@capacitor/haptics';
import { voipService } from '../src/services/voip.service';
import { useAuth } from '../src/hooks/useAuth';
import {
  VoipCallState,
  VoipCall,
  CreateCallParams,
  CallEndReason
} from '../src/types/voip';

export function useVoipCall() {
  const { currentUser } = useAuth();
  const router = useRouter();

  // On s'abonne à l'état du service VoIP unique (Source of Truth)
  const [voipState, setVoipState] = useState<VoipCallState>(voipService.getState());

  useEffect(() => {
    const unsubscribe = voipService.subscribe((newState) => {
      setVoipState(newState);
    });
    return () => unsubscribe();
  }, []);

  // Dériver "currentCall" pour la compatibilité avec l'UI existante
  const currentCall: VoipCall | null = voipState.callId ? {
    id: voipState.callId,
    callerId: voipState.caller?.uid || '',
    calleeId: voipState.callee?.uid || '',
    rideId: voipState.bookingId || '',
    status: voipState.status,
    startTime: voipState.startTime ? new Date(voipState.startTime) : new Date(),
    channel: voipState.channel || '',
    token: voipState.token || null,
    callerMetadata: voipState.caller ? {
      name: voipState.caller.name,
      avatar: voipState.caller.avatar || undefined,
      role: voipState.caller.role,
      uid: voipState.caller.uid
    } : {
      name: 'Inconnu',
      role: 'client',
      uid: ''
    }
  } : null;

  const isInCall = voipState.status === 'accepted';
  const callStatus = voipState.status;
  const isMuted = voipState.isMuted;
  const isSpeaker = voipState.isSpeakerOn;
  const error = voipState.error;

  // Calcul du CallDuration live
  const [duration, setDuration] = useState(0);
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isInCall) {
      interval = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);
    } else {
      setDuration(0);
    }
    return () => clearInterval(interval);
  }, [isInCall]);

  const startCall = useCallback(async (params: CreateCallParams) => {
    if (!currentUser) return;
    try {
      await voipService.startCall(
        params.rideId,
        { uid: currentUser.uid, name: currentUser.displayName || 'Moi', role: 'chauffeur' },
        { uid: params.calleeId, name: 'Client', role: 'client' }
      );
    } catch (err) {
      console.error('[useVoipCall] startCall error', err);
    }
  }, [currentUser]);

  const answerCall = useCallback(async (call: VoipCall) => {
    try {
      await voipService.acceptCall();
      await Haptics.vibrate({ duration: 50 });
    } catch (err) {
      console.error('[useVoipCall] answerCall error', err);
    }
  }, []);

  const declineCall = useCallback(async (callId: string) => {
    try {
      await voipService.declineCall();
      await Haptics.vibrate({ duration: 50 });
    } catch (err) {
      console.error('[useVoipCall] declineCall error', err);
    }
  }, []);

  const endCall = useCallback(async (reason?: CallEndReason) => {
    try {
      await voipService.endCall(reason || 'user_ended');
      await Haptics.vibrate({ duration: 50 });
    } catch (err) {
      console.error('[useVoipCall] endCall error', err);
    }
  }, []);

  const toggleMute = useCallback(async () => {
    try {
      await voipService.toggleMute();
      await Haptics.vibrate({ duration: 30 });
    } catch (err) {
      console.error('[useVoipCall] toggleMute error', err);
    }
  }, []);

  const toggleSpeaker = useCallback(async () => {
    try {
      await voipService.toggleSpeaker();
      await Haptics.vibrate({ duration: 30 });
    } catch (err) {
      console.error('[useVoipCall] toggleSpeaker error', err);
    }
  }, []);

  const fallbackToChat = useCallback(() => {
    if (currentCall) {
      router.push(`/chat/${currentCall.rideId}`);
    }
  }, [currentCall, router]);

  return {
    currentCall,
    callStatus,
    isInCall,
    isMuted,
    isSpeaker,
    callDuration: duration,
    error,
    startCall,
    answerCall,
    declineCall,
    endCall,
    toggleMute,
    toggleSpeaker,
    fallbackToChat,
    clearError: () => {}, // mock
    hasActiveCall: currentCall !== null && isInCall
  };
}

export type UseVoipCallReturn = ReturnType<typeof useVoipCall>;
