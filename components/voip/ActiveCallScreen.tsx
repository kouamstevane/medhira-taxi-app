/**
 * Écran d'appel VoIP actif
 * Affiché pendant un appel en cours
 */

import React, { useEffect, useState } from 'react';
import { MdMic, MdMicOff, MdVolumeUp, MdVolumeOff, MdCallEnd } from 'react-icons/md';
import { useVoipCall } from '../../hooks/useVoipCall';
import { VoipCall } from '../../types/voip';

interface ActiveCallScreenProps {
  /** Document d'appel actif */
  call: VoipCall;
  /** Métadonnées de l'autre participant */
  metadata: {
    name: string;
    avatar?: string;
  };
}

/**
 * Écran plein écran pour les appels en cours
 */
export function ActiveCallScreen({ call, metadata }: ActiveCallScreenProps) {
  const { endCall, toggleMute, toggleSpeaker, isMuted, isSpeaker, callDuration } = useVoipCall();
  const [isEnding, setIsEnding] = useState(false);

  /**
   * Formater la durée en MM:SS
   */
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  /**
   * Gérer la fin d'appel
   */
  const handleEndCall = async () => {
    setIsEnding(true);
    try {
      await endCall('user_ended');
    } catch (error) {
      console.error('[ActiveCallScreen] Error ending call:', error);
      setIsEnding(false);
    }
  };

  /**
   * Gérer le toggle mute avec feedback haptique
   */
  const handleToggleMute = async () => {
    try {
      await toggleMute();
      // Feedback haptique
      if ('vibrate' in navigator) {
        navigator.vibrate(50);
      }
    } catch (error) {
      console.error('[ActiveCallScreen] Error toggling mute:', error);
    }
  };

  /**
   * Gérer le toggle haut-parleur avec feedback haptique
   */
  const handleToggleSpeaker = async () => {
    try {
      await toggleSpeaker();
      // Feedback haptique
      if ('vibrate' in navigator) {
        navigator.vibrate(50);
      }
    } catch (error) {
      console.error('[ActiveCallScreen] Error toggling speaker:', error);
    }
  };

  return (
    <div className="active-call-screen">
      <div className="active-call-content">
        {/* Avatar de l'autre participant */}
        <img
          src={metadata.avatar || '/default-avatar.png'}
          alt={metadata.name}
          className="active-call-avatar"
        />

        {/* Nom */}
        <h2 className="active-call-name">{metadata.name}</h2>

        {/* Durée d'appel */}
        <div className="active-call-duration-container">
          <div className="active-call-duration">{formatTime(callDuration)}</div>
          <div className="active-call-duration-label">Durée d'appel</div>
        </div>

        {/* Indicateur d'état */}
        <div className="active-call-status-container">
          <div className="active-call-status-indicator active-call-status-active" />
          <span className="active-call-status-text">Appel en cours</span>
        </div>

        {/* Contrôles d'appel */}
        <div className="active-call-controls-container">
          {/* Bouton mute */}
          <button
            onClick={handleToggleMute}
            className={`active-call-control-button ${isMuted ? 'active-call-control-button-active' : ''}`}
            aria-label={isMuted ? "Activer le micro" : "Couper le micro"}
          >
            {isMuted ? (
              <MdMicOff size={24} color="white" />
            ) : (
              <MdMic size={24} color="white" />
            )}
            <span className="active-call-control-label">
              {isMuted ? 'Muet' : 'Micro'}
            </span>
          </button>

          {/* Bouton haut-parleur */}
          <button
            onClick={handleToggleSpeaker}
            className={`active-call-control-button ${isSpeaker ? 'active-call-control-button-active' : ''}`}
            aria-label={isSpeaker ? "Désactiver le haut-parleur" : "Activer le haut-parleur"}
          >
            {isSpeaker ? (
              <MdVolumeUp size={24} color="white" />
            ) : (
              <MdVolumeOff size={24} color="white" />
            )}
            <span className="active-call-control-label">
              {isSpeaker ? 'Haut-parleur' : 'Écouteur'}
            </span>
          </button>

          {/* Bouton terminer l'appel */}
          <button
            onClick={handleEndCall}
            disabled={isEnding}
            className="active-call-control-button active-call-end-button"
            aria-label="Terminer l'appel"
          >
            <MdCallEnd size={24} color="white" />
            <span className="active-call-control-label">Terminer</span>
          </button>
        </div>

        {/* Informations de course */}
        <div className="active-call-ride-info">
          <span className="active-call-ride-info-text">
            Course #{call.rideId.slice(-6)}
          </span>
        </div>
      </div>
    </div>
  );
}
