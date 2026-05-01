import { useState, useEffect, useCallback } from 'react';
import { VoipCallState, CallParticipant } from '@/types/voip';
import { voipService } from '@/services/voip.service';

export function useVoipCall() {
  const [callState, setCallState] = useState<VoipCallState>(voipService.getState());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = voipService.subscribe((state) => {
      setCallState(state);
    });
    return () => unsubscribe();
  }, []);

  const startCall = useCallback(async (conversationId: string, caller: CallParticipant, callee: CallParticipant) => {
    try {
      await voipService.startCall(conversationId, caller, callee);
    } catch (error) {
      console.error('[useVoipCall] startCall failed:', error);
      setError(error instanceof Error ? error.message : 'Erreur appel');
    }
  }, []);

  const acceptCall = useCallback(async () => {
    try {
      await voipService.acceptCall();
    } catch (error) {
      console.error('[useVoipCall] acceptCall failed:', error);
      setError(error instanceof Error ? error.message : 'Erreur appel');
    }
  }, []);

  const declineCall = useCallback(async () => {
    try {
      await voipService.declineCall();
    } catch (error) {
      console.error('[useVoipCall] declineCall failed:', error);
      setError(error instanceof Error ? error.message : 'Erreur appel');
    }
  }, []);

  const endCall = useCallback(async () => {
    try {
      await voipService.endCall();
    } catch (error) {
      console.error('[useVoipCall] endCall failed:', error);
      setError(error instanceof Error ? error.message : 'Erreur appel');
    }
  }, []);

  const toggleMute = useCallback(async () => {
    try {
      await voipService.toggleMute();
    } catch (error) {
      console.error('[useVoipCall] toggleMute failed:', error);
      setError(error instanceof Error ? error.message : 'Erreur appel');
    }
  }, []);

  const toggleSpeaker = useCallback(() => {
    try {
      voipService.toggleSpeaker();
    } catch (error) {
      console.error('[useVoipCall] toggleSpeaker failed:', error);
      setError(error instanceof Error ? error.message : 'Erreur appel');
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    callState,
    error,
    clearError,
    startCall,
    acceptCall,
    declineCall,
    endCall,
    toggleMute,
    toggleSpeaker,
  };
}
