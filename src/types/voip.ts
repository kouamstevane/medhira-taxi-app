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

export type CallEndReason = 'user_ended' | 'no_answer' | 'declined' | 'failed' | 'timeout' | 'connection_failed';

export interface CallerMetadata {
  name: string;
  avatar?: string;
  role: 'client' | 'driver' | 'chauffeur';
  uid: string;
}

export interface VoipCall {
  id: string;
  callerId: string;
  calleeId: string;
  rideId: string;
  status: CallStatus;
  startTime: { seconds: number; nanoseconds: number } | Date;
  channel: string;
  token: string | null;
  callerMetadata: CallerMetadata;
}

export interface CreateCallParams {
  calleeId: string;
  rideId: string;
}

export interface CreateCallResult {
  callId: string;
  channel: string;
  token: string;
}

export interface LocalCallState {
  isMuted: boolean;
  isSpeaker: boolean;
  isInCall: boolean;
  duration: number;
}

export interface AgoraConfig {
  mode: string;
  codec: string;
  audioScenario?: string;
  enableAudioVolumeIndication?: boolean;
  cpuUsage?: string;
}

export interface CallQualityMetrics {
  delay: number;
  packetLoss: number;
}

export interface CallLifecycleEvent {
  type: string;
  timestamp: number;
  payload?: unknown;
}

export const DEFAULT_CALL_TIMEOUTS = {
  ringTimeout: 30000, // 30 seconds
  connectionTimeout: 15000 // 15 seconds
};

export interface VoipPermissions {
  microphone: boolean;
  camera: boolean;
}

export type VoipPermissionStatus = 'granted' | 'denied' | 'prompt';

