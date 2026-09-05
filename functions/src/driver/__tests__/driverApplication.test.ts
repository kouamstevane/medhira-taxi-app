import {
  DriverApplicationSubmissionSchema,
  DRIVER_APPLICATION_CALLABLE_OPTIONS,
  buildDriverApplicationStoragePath,
  buildDriverApplicationRecord,
  notifyDriverApplicationOnCreate,
} from '../driverApplication';

describe('driver application intake', () => {
  test('allows browser callable requests from the public application', () => {
    expect(DRIVER_APPLICATION_CALLABLE_OPTIONS.cors).toBe(true);
  });

  test('exports the asynchronous notification trigger', () => {
    expect(notifyDriverApplicationOnCreate).toBeDefined();
  });

  test('builds a private storage path scoped to the anonymous applicant', () => {
    expect(buildDriverApplicationStoragePath('anon-123', 'application-456', 'CV Jean Dupont.pdf'))
      .toBe('driverApplications/anon-123/application-456/cv/CV_Jean_Dupont.pdf');
  });

  test('accepts the public application fields and CV metadata', () => {
    const result = DriverApplicationSubmissionSchema.safeParse({
      applicationId: 'application-456',
      fullName: 'Jean Dupont',
      email: 'jean@example.com',
      phone: '+33612345678',
      city: 'Paris',
      role: 'chauffeur',
      fileName: 'cv-jean.pdf',
      contentType: 'application/pdf',
      size: 1024,
    });

    expect(result.success).toBe(true);
  });

  test('allows the city to be omitted because the CV can contain it', () => {
    const result = DriverApplicationSubmissionSchema.safeParse({
      applicationId: 'application-456',
      fullName: 'Jean Dupont',
      email: 'jean@example.com',
      phone: '+33612345678',
      role: 'chauffeur',
      fileName: 'cv-jean.pdf',
      contentType: 'application/pdf',
      size: 1024,
    });

    expect(result.success).toBe(true);
  });

  test('accepts the minimal application with only email, role and CV', () => {
    const result = DriverApplicationSubmissionSchema.safeParse({
      applicationId: 'application-456',
      email: 'jean@example.com',
      role: 'chauffeur',
      fileName: 'cv-jean.pdf',
      contentType: 'application/pdf',
      size: 1024,
    });

    expect(result.success).toBe(true);
  });

  test('accepts the final application with only email and CV', () => {
    const result = DriverApplicationSubmissionSchema.safeParse({
      applicationId: 'application-456',
      email: 'jean@example.com',
      fileName: 'cv-jean.pdf',
      contentType: 'application/pdf',
      size: 1024,
    });

    expect(result.success).toBe(true);
  });

  test('omits optional fields that are not provided before writing to Firestore', () => {
    const record = buildDriverApplicationRecord('anon-123', {
      applicationId: 'application-456',
      email: 'jean@example.com',
      fileName: 'cv-jean.pdf',
      contentType: 'application/pdf',
      size: 1024,
    }, 'driverApplications/anon-123/application-456/cv/cv-jean.pdf', { size: '1024', contentType: 'application/pdf' });

    expect(record).not.toHaveProperty('fullName');
    expect(record).not.toHaveProperty('phone');
    expect(record).not.toHaveProperty('city');
    expect(record).not.toHaveProperty('role');
    expect(record).toHaveProperty('notificationStatus', 'pending');
  });

  test('rejects unsupported CV formats and oversized files', () => {
    const result = DriverApplicationSubmissionSchema.safeParse({
      applicationId: 'application-456',
      fullName: 'Jean Dupont',
      email: 'jean@example.com',
      phone: '+33612345678',
      city: 'Paris',
      role: 'chauffeur',
      fileName: 'cv-jean.exe',
      contentType: 'application/octet-stream',
      size: 6 * 1024 * 1024,
    });

    expect(result.success).toBe(false);
  });
});
