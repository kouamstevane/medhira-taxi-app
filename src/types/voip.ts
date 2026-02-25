export type CallStatus = 'idle' | 'calling' | 'ringing' | 'accepted' | 'ended' | 'failed' | 'declined';
export type CallDirection = 'outgoing' | 'incoming';

export interface CallParticipant {
  uid: string;
  name: string;
  avatar?: string | null;
  role: 'client' | 'chauffeur';
}

export interface VoipCallState {
  status: CallStatus;
  direction: CallDirection | null;
  callId: string | null;
  bookingId: string | null;
  channel: string | null;
  token: string | null;
  caller: CallParticipant | null;
  callee: CallParticipant | null;
  isMuted: boolean;
  isSpeakerOn: boolean;
  startTime: number | null;     // timestamp début appel
  duration: number;             // durée en secondes (live counter)
  error: string | null;
}

/**
 * Interface pour les moteurs VoIP (Agora, ZEGOCLOUD, etc.)
 * Permet de changer de fournisseur sans impacter le reste de l'app.
 */
export interface IVoipEngine {
  initialize(): Promise<void>;
  join(channel: string, token: string | null, uid: string): Promise<void>;
  leave(): Promise<void>;
  setMuted(muted: boolean): Promise<void>;
  setSpeaker(on: boolean): Promise<void>;
  cleanup(): void;
  
  // Callbacks
  onRemoteUserJoined: (uid: string) => void;
  onRemoteUserLeft: (uid: string) => void;
  onError: (message: string) => void;
}
