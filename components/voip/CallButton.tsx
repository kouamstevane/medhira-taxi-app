'use client';

/**
 * Composant bouton d'appel VoIP
 * Bouton circulaire pour déclencher un appel vocal
 */

import React, { useState } from 'react';
import { MdPhone } from 'react-icons/md';
import { useVoipCall } from '../../hooks/useVoipCall';

interface CallButtonProps {
  /** UID du destinataire (chauffeur ou client) */
  calleeId: string;
  /** ID de la course associée */
  rideId: string;
  /** Classe CSS personnalisée */
  className?: string;
  /** Taille du bouton (par défaut 56) */
  size?: number;
  /** Désactiver le bouton */
  disabled?: boolean;
}

/**
 * Bouton d'appel VoIP
 */
export function CallButton({
  calleeId,
  rideId,
  className,
  size = 56,
  disabled = false
}: CallButtonProps) {
  const { startCall, callStatus, isInCall } = useVoipCall();
  const [isLoading, setIsLoading] = useState(false);

  const isRinging = callStatus === 'ringing';
  const isDisabled = disabled || isLoading || isRinging || isInCall;

  const handleCall = async () => {
    setIsLoading(true);
    try {
      await startCall({ calleeId, rideId });
    } catch (error) {
      console.error('[CallButton] Error starting call:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const buttonStyle: React.CSSProperties = {
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: `${size / 2}px`,
    backgroundColor: isDisabled ? '#999' : '#4CAF50',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    cursor: isDisabled ? 'not-allowed' : 'pointer',
    opacity: isDisabled ? 0.6 : 1,
    transition: 'all 0.2s',
    boxShadow: isDisabled ? 'none' : '0 2px 4px rgba(0,0,0,0.25)',
  };

  return (
    <button
      onClick={handleCall}
      disabled={isDisabled}
      className={`call-button ${className || ''}`}
      style={buttonStyle}
      aria-label="Appeler"
    >
      {isLoading ? (
        <div className="call-button-spinner" />
      ) : (
        <MdPhone size={size * 0.43} color="white" />
      )}
    </button>
  );
}
