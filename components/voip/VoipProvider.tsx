/**
 * Provider VoIP pour gérer les appels au niveau global de l'application
 * Affiche automatiquement les modaux d'appel entrant et les écrans d'appel actif
 */

import React, { useEffect } from 'react';
import { useVoipCall } from '../../hooks/useVoipCall';
import { IncomingCallModal } from './IncomingCallModal';
import { ActiveCallScreen } from './ActiveCallScreen';
import { VoipCall } from '../../src/types/voip';

interface VoipProviderProps {
  children: React.ReactNode;
}

/**
 * Provider global pour gérer les appels VoIP
 * Doit être enveloppé autour de l'application racine
 */
export function VoipProvider({ children }: VoipProviderProps) {
  const {
    currentCall,
    callStatus,
    isInCall,
    error,
    clearError,
    answerCall
  } = useVoipCall();

  /**
   * Effet pour logger les erreurs
   */
  useEffect(() => {
    if (error) {
      console.error('[VoipProvider] Call error:', error);
      // TODO: Afficher un toast/snackbar avec l'erreur
      // toast.error(error);
    }
  }, [error]);

  /**
   * Déterminer si on doit afficher le modal d'appel entrant
   */
  const shouldShowIncomingModal = currentCall && callStatus === 'ringing' && !isInCall;

  /**
   * Déterminer si on doit afficher l'écran d'appel actif
   */
  const shouldShowActiveScreen = currentCall && isInCall;

  /**
   * Extraire les métadonnées de l'appelant
   */
  const getCallerMetadata = (call: VoipCall) => {
    return {
      name: call.callerMetadata.name,
      avatar: call.callerMetadata.avatar,
      role: call.callerMetadata.role
    };
  };

  return (
    <>
      {children}

      {/* Modal d'appel entrant */}
      {shouldShowIncomingModal && (
        <IncomingCallModal
          call={currentCall!}
          metadata={getCallerMetadata(currentCall!)}
        />
      )}

      {/* Écran d'appel actif */}
      {shouldShowActiveScreen && (
        <ActiveCallScreen
          call={currentCall!}
          metadata={{
            name: currentCall!.callerMetadata.name,
            avatar: currentCall!.callerMetadata.avatar
          }}
        />
      )}
    </>
  );
}

/**
 * Hook pour utiliser le provider VoIP
 * Peut être utilisé pour accéder à l'état global des appels
 */
export function useVoipProvider() {
  const { currentCall, callStatus, isInCall, hasActiveCall } = useVoipCall();

  return {
    currentCall,
    callStatus,
    isInCall,
    hasActiveCall,
    isRinging: callStatus === 'ringing',
    isAccepted: callStatus === 'accepted'
  };
}
