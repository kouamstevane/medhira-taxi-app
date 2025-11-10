declare module 'nodemailer' {
  export interface Transporter {
    verify(): Promise<boolean>;
    sendMail(mailOptions: MailOptions): Promise<SentMessageInfo>;
  }

  export interface MailOptions {
    from?: string;
    replyTo?: string;
    to: string | string[];
    subject: string;
    html?: string;
    text?: string;
  }

  export interface SentMessageInfo {
    messageId: string;
    accepted: string[];
    rejected: string[];
    pending: string[];
    response: string;
  }

  export interface TransportOptions {
    host: string;
    port: number;
    secure?: boolean;
    auth: {
      user: string;
      pass: string;
    };
    requireTLS?: boolean;
    tls?: {
      rejectUnauthorized?: boolean;
    };
  }

  export function createTransport(options: TransportOptions): Transporter;
}

