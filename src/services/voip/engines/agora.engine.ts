import { IVoipEngine } from '@/types/voip';
import { logger } from '@/utils/logger';

const AGORA_APP_ID = process.env.NEXT_PUBLIC_AGORA_APP_ID || '';

interface IAgoraUser {
  uid: string | number;
  audioTrack: IRemoteAudioTrack | null;
  videoTrack: unknown;
  hasAudio: boolean;
  hasVideo: boolean;
}

interface IAgoraRTCClient {
  on(event: string, callback: (...args: unknown[]) => void): void;
  join(appId: string, channel: string, token: string | null, uid: string | number): Promise<void>;
  leave(): Promise<void>;
  publish(tracks: unknown[]): Promise<void>;
  subscribe(user: IAgoraUser, mediaType: string): Promise<void>;
}

interface IMicrophoneAudioTrack {
  stop(): void;
  close(): void;
  setEnabled(enabled: boolean): Promise<void>;
}

interface IRemoteAudioTrack {
  play(): void;
  stop(): void;
}

interface IAgoraRTCStatic {
  createClient(config: { mode: string; codec: string }): IAgoraRTCClient;
  createMicrophoneAudioTrack(): Promise<IMicrophoneAudioTrack>;
}

let AgoraRTC: IAgoraRTCStatic | null = null;

/**
 * Charge dynamiquement le SDK AgoraRTC uniquement côté client
 */
async function loadAgoraRTC(): Promise<void> {
  if (typeof window === 'undefined') {
    throw new Error('AgoraRTC ne peut être chargé que côté client');
  }
  
  if (!AgoraRTC) {
    try {
      AgoraRTC = (await import('agora-rtc-sdk-ng')) as unknown as IAgoraRTCStatic;
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

    this.client.on('user-published', async (user: unknown, mediaType: unknown) => {
      const agoraUser = user as IAgoraUser;
      const mediaTypeStr = mediaType as string;
      if (mediaTypeStr === 'audio') {
        await this.client?.subscribe(agoraUser, mediaTypeStr);
        this.remoteAudioTrack = agoraUser.audioTrack || null;
        this.remoteAudioTrack?.play();
        this.onRemoteUserJoined(agoraUser.uid.toString());
      }
    });

    this.client.on('user-unpublished', (user: unknown) => {
      const agoraUser = user as IAgoraUser;
      if (this.remoteAudioTrack) {
        this.remoteAudioTrack.stop();
        this.remoteAudioTrack = null;
      }
      this.onRemoteUserLeft(agoraUser.uid.toString());
    });

    this.client.on('connection-state-change', (curState: unknown, _revState: unknown, reason: unknown) => {
      if ((curState as string) === 'DISCONNECTED' && (reason as string) !== 'LEAVE') {
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
      if (!AgoraRTC) {
        throw new Error('AgoraRTC non initialisé');
      }
      this.localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
      await this.client.publish([this.localAudioTrack]);
      logger.info('Agora engine joined and published');
    } catch (error: unknown) {
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
