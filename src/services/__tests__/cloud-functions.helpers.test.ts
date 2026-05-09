import { mapHttpsError } from '@/services/cloud-functions.helpers';

describe('mapHttpsError', () => {
  test('maps unauthenticated', () => {
    const result = mapHttpsError({ code: 'unauthenticated' });
    expect(result.code).toBe('unauthenticated');
    expect(result.message).toContain('Session');
  });

  test('maps failed-precondition with custom message', () => {
    const result = mapHttpsError({ code: 'failed-precondition', message: 'Email non vérifié.' });
    expect(result.message).toBe('Email non vérifié.');
  });

  test('maps already-exists', () => {
    const result = mapHttpsError({ code: 'already-exists' });
    expect(result.message).toContain('déjà soumis');
  });

  test('maps resource-exhausted', () => {
    const result = mapHttpsError({ code: 'resource-exhausted' });
    expect(result.message).toContain('tentatives');
  });

  test('maps unknown error without code', () => {
    const result = mapHttpsError(new Error('oops'));
    expect(result.code).toBe('unknown');
  });

  test('maps internal', () => {
    const result = mapHttpsError({ code: 'internal' });
    expect(result.message).toContain('Erreur technique');
  });
});
