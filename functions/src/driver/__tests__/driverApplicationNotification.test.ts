import { processDriverApplicationNotification } from '../driverApplicationNotification';

describe('driver application notification processing', () => {
  test('downloads the stored CV, sends the notification, and marks it sent', async () => {
    const downloadCv = jest.fn().mockResolvedValue(Buffer.from('cv'));
    const sendNotification = jest.fn().mockResolvedValue({ messageId: 'email-1' });
    const updateStatus = jest.fn().mockResolvedValue(undefined);

    await processDriverApplicationNotification({
      applicationId: 'application-456',
      record: {
        email: 'jean@example.com',
        cv: {
          path: 'driverApplications/anon/application-456/cv/cv.pdf',
          fileName: 'cv.pdf',
          contentType: 'application/pdf',
        },
      },
      downloadCv,
      sendNotification,
      updateStatus,
    });

    expect(downloadCv).toHaveBeenCalledWith('driverApplications/anon/application-456/cv/cv.pdf');
    expect(sendNotification).toHaveBeenCalledWith(expect.objectContaining({
      applicationId: 'application-456',
      email: 'jean@example.com',
      cvBuffer: Buffer.from('cv'),
    }));
    expect(updateStatus).toHaveBeenCalledWith('sent', { messageId: 'email-1' });
  });

  test('marks the notification failed and rethrows when Resend fails', async () => {
    const error = new Error('Resend unavailable');
    const updateStatus = jest.fn().mockResolvedValue(undefined);

    await expect(processDriverApplicationNotification({
      applicationId: 'application-456',
      record: {
        email: 'jean@example.com',
        cv: { path: 'cv.pdf', fileName: 'cv.pdf', contentType: 'application/pdf' },
      },
      downloadCv: jest.fn().mockResolvedValue(Buffer.from('cv')),
      sendNotification: jest.fn().mockRejectedValue(error),
      updateStatus,
    })).rejects.toBe(error);

    expect(updateStatus).toHaveBeenCalledWith('failed', { error: 'Resend unavailable' });
  });
});
