/**
 * Modal d'appel entrant VoIP
 * Affiché lorsqu'un utilisateur reçoit un appel
 */

import React, { useEffect, useState } from 'react';
import { MdPhone, MdCallEnd } from 'react-icons/md';
import { Haptics } from '@capacitor/haptics';
import { useVoipCall } from '../../hooks/useVoipCall';
import { VoipCall } from '../../src/types/voip';

interface IncomingCallModalProps {
  /** Document d'appel entrant */
  call: VoipCall;
  /** Métadonnées de l'appelant */
  metadata: {
    name: string;
    avatar?: string;
    role: 'client' | 'driver' | 'chauffeur';
  };
  /** Fonction pour fermer le modal */
  onClose?: () => void;
}

/**
 * Modal plein écran pour les appels entrants
 */
export function IncomingCallModal({ call, metadata, onClose }: IncomingCallModalProps) {
  const { answerCall, declineCall } = useVoipCall();
  const [isAnswering, setIsAnswering] = useState(false);

  useEffect(() => {
    // Vibration pattern pour sonnerie via Capacitor Haptics
    const vibratePattern = async () => {
      await Haptics.vibrate({ duration: 500 });
    };

    vibratePattern();

    // Vibration répétée toutes les 2 secondes
    const vibrateInterval = setInterval(async () => {
      await Haptics.vibrate({ duration: 500 });
    }, 2000);

    // TODO: Jouer son de sonnerie
    // const ringtone = new Audio('/sounds/ringtone.mp3');
    // ringtone.loop = true;
    // ringtone.play().catch(console.error);

    return () => {
      // Arrêter vibration et sonnerie au démontage
      clearInterval(vibrateInterval);
      // ringtone.pause();
    };
  }, []);

  const handleAnswer = async () => {
    setIsAnswering(true);
    try {
      await answerCall(call);
      onClose?.();
    } catch (error) {
      console.error('[IncomingCallModal] Error answering call:', error);
      setIsAnswering(false);
    }
  };

  const handleDecline = async () => {
    try {
      await declineCall(call.id);
      onClose?.();
    } catch (error) {
      console.error('[IncomingCallModal] Error declining call:', error);
    }
  };

  return (
    <div className="incoming-call-modal">
      <div className="incoming-call-content">
        {/* Avatar de l'appelant */}
        <img
          src={metadata.avatar || '/default-avatar.png'}
          alt={metadata.name}
          className="incoming-call-avatar"
        />

        {/* Nom de l'appelant */}
        <h2 className="incoming-call-name">{metadata.name}</h2>

        {/* Rôle et statut */}
        <p className="incoming-call-role">
          {metadata.role === 'driver' ? 'Chauffeur' : 'Client'} • Appel entrant
        </p>

        {/* Boutons de réponse */}
        <div className="incoming-call-button-container">
          {/* Bouton refuser */}
          <button
            onClick={handleDecline}
            className="incoming-call-button incoming-call-decline-button"
            aria-label="Refuser l'appel"
          >
            <MdCallEnd size={32} color="white" />
          </button>

          {/* Bouton répondre */}
          <button
            onClick={handleAnswer}
            disabled={isAnswering}
            className="incoming-call-button incoming-call-answer-button"
            aria-label="Répondre à l'appel"
          >
            {isAnswering ? (
              <div className="incoming-call-answering-indicator">
                <span>...</span>
              </div>
            ) : (
              <MdPhone size={32} color="white" />
            )}
          </button>
        </div>

        {/* Informations de course */}
        <div className="incoming-call-ride-info">
          <span className="incoming-call-ride-info-text">
            Course #{call.rideId.slice(-6)}
          </span>
        </div>
      </div>
    </div>
  );
}
