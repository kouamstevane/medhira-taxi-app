/**
 * Service Agora RTC pour la gestion des appels VoIP
 * Utilise agora-rtc-sdk-ng (version 4.x)
 */

import AgoraRTC, {
  IAgoraRTCClient,
  IAgoraRTCRemoteUser,
  ILocalAudioTrack,
  IMicrophoneAudioTrack,
  NetworkQuality
} from 'agora-rtc-sdk-ng';
import { AgoraConfig, CallQualityMetrics } from '../../types/voip';

/**
 * ID de l'application Agora (à configurer via variable d'environnement)
 */
const AGORA_APP_ID = process.env.NEXT_PUBLIC_AGORA_APP_ID || '';

if (!AGORA_APP_ID) {
  console.warn('Agora App ID not configured. Set NEXT_PUBLIC_AGORA_APP_ID environment variable.');
}

/**
 * Service singleton pour gérer les connexions Agora RTC
 */
export class AgoraService {
  private client: IAgoraRTCClient | null = null;
  private localAudioTrack: IMicrophoneAudioTrack | null = null;
  private remoteUsers: Map<string, IAgoraRTCRemoteUser> = new Map();
  private isInitialized = false;
  private currentChannel = '';
  private currentUid = '';

  // Event handlers
  private onUserJoinedCallbacks: Array<(user: IAgoraRTCRemoteUser) => void> = [];
  private onUserLeftCallbacks: Array<(user: IAgoraRTCRemoteUser) => void> = [];
  private onErrorCallbacks: Array<(error: Error) => void> = [];
  private onNetworkQualityCallbacks: Array<(quality: NetworkQuality) => void> = [];

  /**
   * Initialise le client Agora RTC
   */
  async initialize(config: Partial<AgoraConfig> = {}): Promise<void> {
    if (this.isInitialized) {
      console.warn('[AgoraService] Already initialized');
      return;
    }

    if (!AGORA_APP_ID) {
      throw new Error('Agora App ID not configured');
    }

    const defaultConfig: AgoraConfig = {
      mode: 'rtc',
      codec: 'vp8',
      audioScenario: 'SPEECH',
      enableAudioVolumeIndication: true,
      cpuUsage: 'low'
    };

    const finalConfig = { ...defaultConfig, ...config };

    try {
      // Créer le client RTC
      this.client = AgoraRTC.createClient({
        mode: finalConfig.mode,
        codec: finalConfig.codec as "vp8" | "h264"
      });

      // Note: setAudioProfile n'est plus disponible dans agora-rtc-sdk-ng 4.x
      // La configuration audio se fait maintenant via createMicrophoneAudioTrack

      // Configurer l'indication de volume audio
      if (finalConfig.enableAudioVolumeIndication) {
        this.client.enableAudioVolumeIndicator();
      }

      // Configurer les handlers d'événements
      this.setupEventHandlers();

      this.isInitialized = true;
      console.log('[AgoraService] Initialized successfully');
    } catch (error) {
      console.error('[AgoraService] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Rejoint un channel Agora
   */
  async joinChannel(channel: string, token: string, uid: string): Promise<void> {
    if (!this.isInitialized || !this.client) {
      throw new Error('AgoraService not initialized. Call initialize() first.');
    }

    try {
      // Créer le track audio local (microphone)
      this.localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack({
        encoderConfig: {
          sampleRate: 48000,
          stereo: false,
          bitrate: 32, // 32 kbps pour optimiser bande passante
        },
        AEC: true,  // Acoustic Echo Cancellation
        ANS: true,  // Automatic Noise Suppression
        AGC: true   // Automatic Gain Control
      });

      // Rejoindre le channel
      await this.client.join(AGORA_APP_ID, channel, token, uid);

      // Publier le track audio local
      await this.client.publish(this.localAudioTrack);

      this.currentChannel = channel;
      this.currentUid = uid;

      console.log(`[AgoraService] Joined channel: ${channel} as ${uid}`);
    } catch (error) {
      console.error('[AgoraService] Failed to join channel:', error);
      throw error;
    }
  }

  /**
   * Quitte le channel actuel
   */
  async leave(): Promise<void> {
    try {
      // Arrêter et fermer le track local
      if (this.localAudioTrack) {
        await this.localAudioTrack.stop();
        await this.localAudioTrack.close();
        this.localAudioTrack = null;
      }

      // Quitter le channel
      if (this.client && this.currentChannel) {
        await this.client.leave();
      }

      // Nettoyer les utilisateurs distants
      this.remoteUsers.clear();

      this.currentChannel = '';
      this.currentUid = '';

      console.log('[AgoraService] Left channel');
    } catch (error) {
      console.error('[AgoraService] Error leaving channel:', error);
      throw error;
    }
  }

  /**
   * Coupe/réactive le micro local
   */
  async muteLocalAudio(muted: boolean): Promise<void> {
    if (this.localAudioTrack) {
      if (muted) {
        await this.localAudioTrack.setMuted(true);
        console.log('[AgoraService] Microphone muted');
      } else {
        await this.localAudioTrack.setMuted(false);
        console.log('[AgoraService] Microphone unmuted');
      }
    }
  }

  /**
   * Active/désactive le haut-parleur
   */
  async setEnableSpeakerphone(enabled: boolean): Promise<void> {
    if (this.localAudioTrack) {
      await this.localAudioTrack.setPlaybackDevice(enabled ? 'speakerphone' : 'earpiece');
      console.log(`[AgoraService] Playback device set to: ${enabled ? 'speakerphone' : 'earpiece'}`);
    }
  }

  /**
   * Récupère les métriques de qualité d'appel
   */
  async getCallQuality(): Promise<CallQualityMetrics | null> {
    if (!this.client || !this.currentChannel) {
      return null;
    }

    try {
      const stats = await this.client.getRemoteNetworkQuality();
      const remoteUid = Array.from(this.remoteUsers.keys())[0];

      if (!remoteUid) {
        return null;
      }

      const remoteStats = await this.client.getRemoteAudioStats();
      const userStats = remoteStats[remoteUid];

      return {
        bitrate: userStats?.receiveBitrate || 0,
        packetLoss: userStats?.packetLossRate || 0,
        jitter: 0, // jitter non disponible dans RemoteAudioTrackStats
        rtt: 0 // delay non disponible dans NetworkQuality de cette façon
      };
    } catch (error) {
      console.error('[AgoraService] Error getting call quality:', error);
      return null;
    }
  }

  /**
   * Configure les handlers d'événements Agora
   */
  private setupEventHandlers(): void {
    if (!this.client) return;

    // Utilisateur distant publié (rejoint le channel)
    this.client.on('user-published', async (user: IAgoraRTCRemoteUser, mediaType: 'audio' | 'video' | 'datachannel') => {
      if (mediaType === 'audio') {
        await this.client!.subscribe(user, mediaType);
        this.remoteUsers.set(String(user.uid), user);
        console.log(`[AgoraService] Remote user ${user.uid} joined`);

        // Notifier les callbacks
        this.onUserJoinedCallbacks.forEach(callback => callback(user));
      }
    });

    // Utilisateur distant unpublished (quitté le channel)
    this.client.on('user-unpublished', (user: IAgoraRTCRemoteUser) => {
      this.remoteUsers.delete(String(user.uid));
      console.log(`[AgoraService] Remote user ${user.uid} left`);

      // Notifier les callbacks
      this.onUserLeftCallbacks.forEach(callback => callback(user));
    });

    // Erreur de connexion
    this.client.on('error', (error: Error) => {
      console.error('[AgoraService] Agora error:', error);

      // Notifier les callbacks
      this.onErrorCallbacks.forEach(callback => callback(error));
    });

    // Qualité réseau
    this.client.on('network-quality', (quality: NetworkQuality) => {
      console.log('[AgoraService] Network quality:', quality);

      // Notifier les callbacks
      this.onNetworkQualityCallbacks.forEach(callback => callback(quality));
    });

    // Avertissement
    this.client.on('warning', (warning: number) => {
      console.warn('[AgoraService] Agora warning:', warning);
    });
  }

  /**
   * Abonne à l'événement user-joined
   */
  onUserJoined(callback: (user: IAgoraRTCRemoteUser) => void): void {
    this.onUserJoinedCallbacks.push(callback);
  }

  /**
   * Abonne à l'événement user-left
   */
  onUserLeft(callback: (user: IAgoraRTCRemoteUser) => void): void {
    this.onUserLeftCallbacks.push(callback);
  }

  /**
   * Abonne à l'événement error
   */
  onError(callback: (error: Error) => void): void {
    this.onErrorCallbacks.push(callback);
  }

  /**
   * Abonne à l'événement network-quality
   */
  onNetworkQuality(callback: (quality: NetworkQuality) => void): void {
    this.onNetworkQualityCallbacks.push(callback);
  }

  /**
   * Retire tous les abonnements
   */
  removeAllListeners(): void {
    this.onUserJoinedCallbacks = [];
    this.onUserLeftCallbacks = [];
    this.onErrorCallbacks = [];
    this.onNetworkQualityCallbacks = [];
  }

  /**
   * Nettoie toutes les ressources
   */
  async cleanup(): Promise<void> {
    await this.leave();
    this.removeAllListeners();
    this.isInitialized = false;
    this.client = null;
    console.log('[AgoraService] Cleaned up');
  }

  /**
   * Vérifie si le service est initialisé
   */
  get initialized(): boolean {
    return this.isInitialized;
  }

  /**
   * Vérifie si on est dans un channel
   */
  get inChannel(): boolean {
    return this.currentChannel !== '';
  }

  /**
   * Récupère le channel actuel
   */
  get channel(): string {
    return this.currentChannel;
  }

  /**
   * Récupère l'UID actuel
   */
  get uid(): string {
    return this.currentUid;
  }
}

/**
 * Instance singleton du service Agora
 */
export const agoraService = new AgoraService();
