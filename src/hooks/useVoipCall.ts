import { useState, useEffect, useCallback } from 'react';
import { VoipCallState, CallParticipant } from '@/types/voip';
import { voipService } from '@/services/voip.service';

export function useVoipCall() {
  const [callState, setCallState] = useState<VoipCallState>(voipService.getState());

  useEffect(() => {
    const unsubscribe = voipService.subscribe((state) => {
      setCallState(state);
    });
    return () => unsubscribe();
  }, []);

  const startCall = useCallback(async (bookingId: string, caller: CallParticipant, callee: CallParticipant) => {
    await voipService.startCall(bookingId, caller, callee);
  }, []);

  const acceptCall = useCallback(async () => {
    await voipService.acceptCall();
  }, []);

  const declineCall = useCallback(async () => {
    await voipService.declineCall();
  }, []);

  const endCall = useCallback(async () => {
    await voipService.endCall();
  }, []);

  const toggleMute = useCallback(async () => {
    await voipService.toggleMute();
  }, []);

  const toggleSpeaker = useCallback(() => {
    voipService.toggleSpeaker();
  }, []);

  return {
    callState,
    startCall,
    acceptCall,
    declineCall,
    endCall,
    toggleMute,
    toggleSpeaker,
  };
}
