import type { FirebaseError } from 'firebase/app';

export function isFirebaseError(e: unknown): e is FirebaseError {
  return (
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    typeof (e as { code: unknown }).code === 'string' &&
    'message' in e &&
    typeof (e as { message: unknown }).message === 'string'
  );
}

export function getErrorMessage(err: unknown, fallback = 'Une erreur est survenue'): string {
  if (isFirebaseError(err)) return err.message;
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return fallback;
}

export function getErrorCode(err: unknown): string | null {
  if (isFirebaseError(err)) return err.code;
  return null;
}
