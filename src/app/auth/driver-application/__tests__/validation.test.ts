import { getDriverApplicationErrorMessage, validateDriverApplicationForm } from '../validation';

describe('driver application form validation', () => {
  test('requires an email and a CV before submitting', () => {
    expect(validateDriverApplicationForm('', null)).toEqual({
      type: 'error',
      text: 'Renseignez votre adresse e-mail et joignez votre CV.',
    });
  });

  test('explains when anonymous Firebase authentication is disabled', () => {
    expect(getDriverApplicationErrorMessage({ code: 'auth/admin-restricted-operation' })).toBe(
      'Le service de candidature est temporairement indisponible. Activez la connexion anonyme dans Firebase, puis réessayez.',
    );
  });
});
