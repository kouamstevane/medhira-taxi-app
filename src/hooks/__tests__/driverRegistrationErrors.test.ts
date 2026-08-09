import { getDriverSubmissionErrorMessage } from '../driverRegistrationErrors';

describe('driver registration errors', () => {
  it('shows a clear 10 minute wait message for final submission rate limits', () => {
    expect(getDriverSubmissionErrorMessage({
      code: 'functions/resource-exhausted',
      message: 'Trop de requêtes (driver:submit). Réessayez plus tard.',
    })).toBe('Trop de tentatives de soumission. Veuillez réessayer dans 10 minutes.');
  });

  it('shows a reconnect message for callable permission errors', () => {
    expect(getDriverSubmissionErrorMessage({
      code: 'functions/permission-denied',
      message: 'Email mismatch.',
    })).toBe('Session expirée. Veuillez vous reconnecter puis reprendre votre inscription.');
  });
});
