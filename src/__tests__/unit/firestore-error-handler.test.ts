import {
  isFirestorePermissionError,
  isFirestoreNotFoundError,
  isFirestoreNetworkError,
  getFirestoreErrorMessage,
  getFirestoreErrorDetails,
  logFirestoreError,
} from '@/utils/firestore-error-handler';

describe('isFirestorePermissionError', () => {
  it('détecte un Error avec message "missing or insufficient permissions"', () => {
    const error = new Error('Missing or insufficient permissions.');
    expect(isFirestorePermissionError(error)).toBe(true);
  });

  it('détecte un Error avec code "permission-denied"', () => {
    const error = new Error('denied') as Error & { code: string };
    error.code = 'permission-denied';
    expect(isFirestorePermissionError(error)).toBe(true);
  });

  it('détecte un objet avec code "permission_denied"', () => {
    expect(isFirestorePermissionError({ code: 'permission_denied' })).toBe(true);
  });

  it('retourne false pour une erreur non liée aux permissions', () => {
    expect(isFirestorePermissionError(new Error('something else'))).toBe(false);
  });

  it('retourne false pour null', () => {
    expect(isFirestorePermissionError(null)).toBe(false);
  });
});

describe('isFirestoreNotFoundError', () => {
  it('détecte un Error avec message "not found"', () => {
    expect(isFirestoreNotFoundError(new Error('Document not found'))).toBe(true);
  });

  it('détecte un Error avec code "not-found"', () => {
    const error = new Error('not found') as Error & { code: string };
    error.code = 'not-found';
    expect(isFirestoreNotFoundError(error)).toBe(true);
  });

  it('retourne false pour une erreur non liée', () => {
    expect(isFirestoreNotFoundError(new Error('other error'))).toBe(false);
  });
});

describe('isFirestoreNetworkError', () => {
  it('détecte un Error avec message "network"', () => {
    expect(isFirestoreNetworkError(new Error('network request failed'))).toBe(true);
  });

  it('détecte un Error avec code "unavailable"', () => {
    const error = new Error('unavailable') as Error & { code: string };
    error.code = 'unavailable';
    expect(isFirestoreNetworkError(error)).toBe(true);
  });

  it('détecte un Error avec message "offline"', () => {
    expect(isFirestoreNetworkError(new Error('Client is offline'))).toBe(true);
  });
});

describe('getFirestoreErrorMessage', () => {
  it('retourne un message de permission avec contexte', () => {
    const error = new Error('missing or insufficient permissions');
    const msg = getFirestoreErrorMessage(error, 'mise à jour du profil');
    expect(msg).toContain('permissions nécessaires');
    expect(msg).toContain('mise à jour du profil');
  });

  it('retourne un message "not found"', () => {
    const error = new Error('not found');
    const msg = getFirestoreErrorMessage(error);
    expect(msg).toContain('n\'existe pas');
  });

  it('retourne un message réseau', () => {
    const error = new Error('network error');
    const msg = getFirestoreErrorMessage(error);
    expect(msg).toContain('connexion');
  });

  it('retourne un message générique pour une erreur inconnue', () => {
    const msg = getFirestoreErrorMessage(new Error('random'));
    expect(msg).toContain('erreur est survenue');
  });

  it('inclut le contexte dans le message', () => {
    const msg = getFirestoreErrorMessage(new Error('random'), 'sauvegarde');
    expect(msg).toContain('sauvegarde');
  });
});

describe('getFirestoreErrorDetails', () => {
  it('extrait les détails d\'une instance Error', () => {
    const error = new Error('test error') as Error & { code: string };
    error.code = 'permission-denied';
    const details = getFirestoreErrorDetails(error);

    expect(details.type).toBe('Error');
    expect(details.message).toBe('test error');
    expect(details.code).toBe('permission-denied');
    expect(details.isPermissionError).toBe(true);
  });

  it('extrait les détails d\'un objet simple avec code', () => {
    const details = getFirestoreErrorDetails({ code: 'not-found' });

    expect(details.type).toBe('ObjectError');
    expect(details.code).toBe('not-found');
    expect(details.isNotFoundError).toBe(true);
  });

  it('gère une erreur de type string', () => {
    const details = getFirestoreErrorDetails('some string error');

    expect(details.type).toBe('StringError');
    expect(details.message).toBe('some string error');
  });

  it('gère null en retournant les valeurs par défaut', () => {
    const details = getFirestoreErrorDetails(null);

    expect(details.type).toBe('UnknownError');
    expect(details.message).toBe('Erreur inconnue');
    expect(details.isPermissionError).toBe(false);
  });

  it('gère undefined en retournant les valeurs par défaut', () => {
    const details = getFirestoreErrorDetails(undefined);

    expect(details.type).toBe('UnknownError');
  });
});

describe('logFirestoreError', () => {
  it('appelle console.group, console.error et console.groupEnd', () => {
    const groupSpy = jest.spyOn(console, 'group').mockImplementation();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation();
    const groupEndSpy = jest.spyOn(console, 'groupEnd').mockImplementation();

    logFirestoreError(new Error('test'), 'test context');

    expect(groupSpy).toHaveBeenCalledWith(expect.stringContaining('test context'));
    expect(errorSpy).toHaveBeenCalled();
    expect(groupEndSpy).toHaveBeenCalled();

    groupSpy.mockRestore();
    errorSpy.mockRestore();
    groupEndSpy.mockRestore();
  });
});
