import { sendDriverApplicationNotification } from '../email-service.js';

export interface DriverApplicationNotificationRecord {
  email: string;
  fullName?: string;
  phone?: string;
  city?: string;
  role?: 'chauffeur' | 'livreur' | 'les_deux';
  cv: {
    path: string;
    fileName: string;
    contentType?: string;
  };
}

type NotificationResult = { messageId?: string };

export interface ProcessDriverApplicationNotificationInput {
  applicationId: string;
  record: DriverApplicationNotificationRecord;
  downloadCv: (path: string) => Promise<Buffer>;
  sendNotification: (input: Parameters<typeof sendDriverApplicationNotification>[0]) => Promise<NotificationResult>;
  updateStatus: (status: 'sent' | 'failed', details: { messageId?: string; error?: string }) => Promise<void>;
}

export async function processDriverApplicationNotification({
  applicationId,
  record,
  downloadCv,
  sendNotification,
  updateStatus,
}: ProcessDriverApplicationNotificationInput): Promise<void> {
  try {
    const cvBuffer = await downloadCv(record.cv.path);
    const result = await sendNotification({
      to: 'medjiraservices@gmail.com',
      applicationId,
      fullName: record.fullName,
      email: record.email,
      phone: record.phone,
      city: record.city,
      role: record.role,
      fileName: record.cv.fileName,
      cvBuffer,
    });
    await updateStatus('sent', { messageId: result.messageId });
  } catch (error) {
    await updateStatus('failed', { error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}
