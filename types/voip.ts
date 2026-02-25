/**
 * Types pour la fonctionnalité VoIP (Voice over IP)
 * Permet les appels vocaux entre clients et chauffeurs
 */

/**
 * Statuts possibles d'un appel VoIP
 */
export type CallStatus = 'ringing' | 'accepted' | 'declined' | 'ended' | 'failed';

/**
 * Raisons possibles de fin d'appel
 */
export type CallEndReason =
  | 'user_ended'          // Utilisateur a terminé l'appel
  | 'no_answer'           // Pas de réponse après timeout
  | 'declined'            // Destinataire a refusé
  | 'connection_failed'   // Échec connexion technique
  | 'network_error'       // Erreur réseau
  | 'timeout'             // Timeout de l'appel
  | 'permission_denied';  // Permission refusée

/**
 * Métadonnées de l'appelant
 */
export interface CallerMetadata {
  /** Nom affiché de l'appelant */
  name: string;
  /** URL de l'avatar (optionnel) */
  avatar?: string;
  /** Rôle : client ou chauffeur */
  role: 'client' | 'driver';
  /** UID Firebase de l'appelant */
  uid: string;
}

/**
 * Document d'appel VoIP dans Firestore
 */
export interface VoipCall {
  /** ID unique du document (auto-généré) */
  id: string;
  /** UID Firebase de l'appelant */
  callerId: string;
  /** UID Firebase du destinataire */
  calleeId: string;
  /** ID de la course associée */
  rideId: string;
  /** Statut actuel de l'appel */
  status: CallStatus;
  /** Timestamp de début de l'appel */
  startTime: FirebaseFirestore.Timestamp;
  /** Timestamp de réponse (optionnel) */
  answerTime?: FirebaseFirestore.Timestamp;
  /** Timestamp de fin (optionnel) */
  endTime?: FirebaseFirestore.Timestamp;
  /** Raison de fin/échec (optionnel) */
  reason?: CallEndReason;
  /** Channel unique pour cet appel (Agora, ZEGOCLOUD, etc.) */
  channel: string;
  /** Token temporaire pour authentification (validité 1h) */
  token: string;
  /** Métadonnées de l'appelant */
  callerMetadata: CallerMetadata;
}

/**
 * Paramètres pour créer un appel
 */
export interface CreateCallParams {
  /** UID du destinataire (chauffeur ou client) */
  calleeId: string;
  /** ID de la course associée */
  rideId: string;
}

/**
 * Résultat de la création d'appel
 */
export interface CreateCallResult {
  /** ID du document d'appel créé */
  callId: string;
  /** Channel pour rejoindre l'appel (Agora, ZEGOCLOUD, etc.) */
  channel: string;
  /** Token pour authentification */
  token: string;
}

/**
 * État local d'un appel VoIP
 */
export interface LocalCallState {
  /** Document d'appel actif (si any) */
  currentCall: VoipCall | null;
  /** Statut local de l'appel */
  callStatus: CallStatus | null;
  /** Est-ce qu'on est actuellement en appel ? */
  isInCall: boolean;
  /** Est-ce que le micro est coupé ? */
  isMuted: boolean;
  /** Est-ce que le haut-parleur est activé ? */
  isSpeaker: boolean;
  /** Durée de l'appel en secondes */
  callDuration: number;
  /** Message d'erreur (si any) */
  error: string | null;
}

/**
 * Configuration Agora RTC
 */
export interface AgoraConfig {
  /** Mode de communication */
  mode: 'rtc' | 'live';
  /** Codec vidéo (Agora RTC utilise des codecs vidéo) */
  codec: 'vp8' | 'h264' | 'h265' | 'vp9' | 'av1';
  /** Scénario audio */
  audioScenario: 'DEFAULT' | 'MUSIC' | 'SPEECH';
  /** Activer l'indication de volume */
  enableAudioVolumeIndication?: boolean;
  /** Utilisation CPU */
  cpuUsage?: 'low' | 'standard' | 'high';
}

/**
 * Métriques de qualité d'appel
 */
export interface CallQualityMetrics {
  /** Débit en kbps */
  bitrate: number;
  /** Pourcentage de paquets perdus */
  packetLoss: number;
  /** Jitter en ms */
  jitter: number;
  /** Latence aller-retour en ms */
  rtt: number;
  /** Score MOS (Mean Opinion Score) 1-5 */
  mos?: number;
}

/**
 * Événements de cycle de vie d'appel
 */
export type CallLifecycleEvent =
  | { type: 'call_initiated'; callId: string; rideId: string }
  | { type: 'call_ringing'; callId: string }
  | { type: 'call_answered'; callId: string; ringTime: number }
  | { type: 'call_declined'; callId: string }
  | { type: 'call_ended'; callId: string; duration: number; reason: CallEndReason }
  | { type: 'call_failed'; callId: string; error: string };

/**
 * Configuration de timeout pour les appels
 */
export interface CallTimeoutConfig {
  /** Délai avant auto-annulation si pas de réponse (ms) */
  ringTimeout: number;
  /** Délai avant échec si connexion échoue (ms) */
  connectionTimeout: number;
  /** Délai avant timeout inactivité (ms) */
  inactivityTimeout: number;
}

/**
 * Configuration par défaut des timeouts
 */
export const DEFAULT_CALL_TIMEOUTS: CallTimeoutConfig = {
  ringTimeout: 30000,        // 30 secondes
  connectionTimeout: 15000,  // 15 secondes
  inactivityTimeout: 60000   // 60 secondes
};

/**
 * Permissions requises pour VoIP
 */
export interface VoipPermissions {
  /** Accès microphone */
  microphone: boolean;
  /** État réseau */
  network: boolean;
  /** Notifications push */
  notifications: boolean;
}

/**
 * Statut de permission VoIP
 */
export type VoipPermissionStatus = 'granted' | 'denied' | 'prompt' | 'not_requested';
