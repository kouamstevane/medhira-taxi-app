import {
  DriverApplicationSubmissionSchema,
  buildDriverApplicationStoragePath,
} from '../driverApplication';

describe('driver application intake', () => {
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
