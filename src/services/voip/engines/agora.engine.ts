import { IVoipEngine } from '@/types/voip';
import { logger } from '@/utils/logger';

const AGORA_APP_ID = process.env.NEXT_PUBLIC_AGORA_APP_ID || '';

// Import dynamique d'AgoraRTC pour éviter les erreurs SSR
let AgoraRTC: any = null;

// Types pour AgoraRTC (chargés dynamiquement)
type IAgoraRTCClient = any;
type IMicrophoneAudioTrack = any;
type IRemoteAudioTrack = any;

/**
 * Charge dynamiquement le SDK AgoraRTC uniquement côté client
 */
async function loadAgoraRTC(): Promise<void> {
  if (typeof window === 'undefined') {
    throw new Error('AgoraRTC ne peut être chargé que côté client');
  }
  
  if (!AgoraRTC) {
    try {
      AgoraRTC = await import('agora-rtc-sdk-ng');
      logger.info('AgoraRTC chargé avec succès');
    } catch (error) {
      logger.error('Erreur lors du chargement d\'AgoraRTC', { error });
      throw error;
    }
  }
}

export class AgoraVoipEngine implements IVoipEngine {
  private client: IAgoraRTCClient | null = null;
  private localAudioTrack: IMicrophoneAudioTrack | null = null;
  private remoteAudioTrack: IRemoteAudioTrack | null = null;

  onRemoteUserJoined = (uid: string) => {};
  onRemoteUserLeft = (uid: string) => {};
  onError = (message: string) => {};

  async initialize(): Promise<void> {
    if (typeof window === 'undefined') return;
    
    // Validate AGORA_APP_ID is configured
    if (!AGORA_APP_ID) {
      throw new Error(
        'AGORA_APP_ID non configuré. Veuillez définir NEXT_PUBLIC_AGORA_APP_ID dans votre fichier .env'
      );
    }
    
    // Charger AgoraRTC dynamiquement avant de l'utiliser
    await loadAgoraRTC();
    
    if (!AgoraRTC) {
      throw new Error('AgoraRTC n\'a pas pu être chargé');
    }
    
    this.client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
    this.setupListeners();
  }

  private setupListeners() {
    if (!this.client) return;

    this.client.on('user-published', async (user: any, mediaType: any) => {
      if (mediaType === 'audio') {
        await this.client?.subscribe(user, mediaType);
        this.remoteAudioTrack = user.audioTrack || null;
        this.remoteAudioTrack?.play();
        this.onRemoteUserJoined(user.uid.toString());
      }
    });

    this.client.on('user-unpublished', (user: any) => {
      if (this.remoteAudioTrack) {
        this.remoteAudioTrack.stop();
        this.remoteAudioTrack = null;
      }
      this.onRemoteUserLeft(user.uid.toString());
    });

    this.client.on('connection-state-change', (curState: any, revState: any, reason: any) => {
      if (curState === 'DISCONNECTED' && reason !== 'LEAVE') {
        this.onError('Connexion perdue avec le serveur vocal Agora');
      }
    });
  }

  async join(channel: string, token: string | null, uid: string): Promise<void> {
    if (!this.client) {
      throw new Error('SDK Agora non initialisé');
    }

    try {
      await this.client.join(AGORA_APP_ID, channel, token || null, uid);
      this.localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
      await this.client.publish([this.localAudioTrack]);
      logger.info('Agora engine joined and published');
    } catch (error: any) {
      logger.error('Agora join error', { error });
      throw error;
    }
  }

  async leave(): Promise<void> {
    try {
      if (this.localAudioTrack) {
        this.localAudioTrack.stop();
        this.localAudioTrack.close();
        this.localAudioTrack = null;
      }
      if (this.remoteAudioTrack) {
        this.remoteAudioTrack.stop();
        this.remoteAudioTrack = null;
      }
      if (this.client) {
        await this.client.leave();
      }
    } catch (error) {
      logger.error('Agora leave error', { error });
    }
  }

  async setMuted(muted: boolean): Promise<void> {
    if (this.localAudioTrack) {
      await this.localAudioTrack.setEnabled(!muted);
    }
  }

  async setSpeaker(on: boolean): Promise<void> {
    if (this.remoteAudioTrack) {
      if (on) {
        this.remoteAudioTrack.play();
      } else {
        this.remoteAudioTrack.stop();
      }
    }
  }

  cleanup(): void {
    this.leave();
  }
}
