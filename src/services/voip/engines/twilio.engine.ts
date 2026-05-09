import { IVoipEngine } from '@/types/voip';
import { logger } from '@/utils/logger';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';

interface TwilioDevice {
  connect(options: Record<string, unknown>): TwilioConnection;
  destroy(): void;
  on(event: string, callback: (...args: unknown[]) => void): void;
  register(): Promise<void>;
  updateToken(token: string): void;
}

interface TwilioConnection {
  on(event: string, callback: (...args: unknown[]) => void): void;
  mute(isMuted: boolean): void;
  disconnect(): void;
}

export class TwilioVoipEngine implements IVoipEngine {
  private device: TwilioDevice | null = null;
  private connection: TwilioConnection | null = null;

  onRemoteUserJoined = (uid: string) => {};
  onRemoteUserLeft = (uid: string) => {};
  onError = (message: string) => {};

  async initialize(): Promise<void> {
    if (typeof window === 'undefined') return;

    try {
      const getTwilioToken = httpsCallable(functions, 'getCallToken');
      const result = await (getTwilioToken({}) as Promise<{ data: { token: string } }>);
      const token = result.data.token;

      if (!token) {
        throw new Error('Twilio access token non reçu depuis le serveur');
      }

      const { Device } = await import('@twilio/voice-sdk');

      this.device = new Device(token, {
        codecPreferences: ['opus', 'pcmu'] as unknown as undefined,
      } as unknown as undefined) as unknown as TwilioDevice;

      this.setupListeners();

      await this.device.register();
      logger.info('TwilioVoipEngine initialisé avec succès');
    } catch (error) {
      logger.error('Erreur initialisation TwilioVoipEngine', { error });
      throw error;
    }
  }

  private setupListeners(): void {
    if (!this.device) return;

    this.device.on('connect', (conn: unknown) => {
      this.connection = conn as TwilioConnection;
      this.onRemoteUserJoined('remote');
    });

    this.device.on('disconnect', () => {
      this.connection = null;
      this.onRemoteUserLeft('remote');
    });

    this.device.on('error', (error: unknown) => {
      const msg = error instanceof Error ? error.message : String(error);
      this.onError(`Twilio error: ${msg}`);
    });

    this.device.on('offline', () => {
      this.onError('Périphérique Twilio hors ligne');
    });

    this.device.on('tokenWillExpire', async () => {
      try {
        const getTokenFn = httpsCallable(functions, 'getCallToken');
        const result = await getTokenFn({}) as { data: { token: string } };
        const newToken = result.data.token;
        if (this.device && newToken) {
          this.device.updateToken(newToken);
          logger.info('Twilio token rafraîchi avec succès');
        }
      } catch (e) {
        logger.error('Failed to refresh Twilio token', { e });
      }
    });
  }

  async join(channel: string, token: string | null, uid: string): Promise<void> {
    if (!this.device) {
      throw new Error('Twilio non initialisé');
    }

    try {
      this.connection = this.device.connect({
        To: channel,
        callerId: uid,
      });
      logger.info('Twilio engine joined', { channel, uid });
    } catch (error) {
      logger.error('Twilio join error', { error });
      throw error;
    }
  }

  async leave(): Promise<void> {
    try {
      if (this.connection) {
        this.connection.disconnect();
        this.connection = null;
      }
    } catch (error) {
      logger.error('Twilio leave error', { error });
    }
  }

  async setMuted(muted: boolean): Promise<void> {
    if (this.connection) {
      this.connection.mute(muted);
    }
  }

  async setSpeaker(_on: boolean): Promise<void> {
    // Twilio manages speaker through the connection audio output
  }

  cleanup(): void {
    if (this.connection) {
      this.connection.disconnect();
      this.connection = null;
    }
    if (this.device) {
      this.device.destroy();
      this.device = null;
    }
  }
}
