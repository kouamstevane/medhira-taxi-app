import { useState, useRef, useCallback, useEffect } from 'react';
import { validateMenuImageUrl, validateExternalImageLoad } from '@/utils/menu-image';

export interface UseMenuImageUrlValidationReturn {
  isValidating: boolean;
  validationError: string | null;
  validateUrl: (url: string, timeoutMs?: number) => Promise<boolean>;
  resetValidation: () => void;
}

export function useMenuImageUrlValidation(): UseMenuImageUrlValidationReturn {
  const [isValidating, setIsValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const resetValidation = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsValidating(false);
    setValidationError(null);
  }, []);

  const validateUrl = useCallback(
    async (url: string, timeoutMs = 5000): Promise<boolean> => {
      // Annuler toute validation précédente en cours
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }

      // 1. Validation synchrone du format et des domaines interdits
      const formatResult = validateMenuImageUrl(url);
      if (!formatResult.valid) {
        setValidationError(formatResult.error ?? 'URL invalide');
        setIsValidating(false);
        return false;
      }

      setIsValidating(true);
      setValidationError(null);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        await validateExternalImageLoad(url, {
          timeoutMs,
          signal: controller.signal,
        });

        if (!controller.signal.aborted) {
          setIsValidating(false);
          setValidationError(null);
          return true;
        }
        return false;
      } catch (err) {
        if (!controller.signal.aborted) {
          setIsValidating(false);
          const errorMsg =
            err instanceof Error ? err.message : 'Impossible de charger l image depuis cette URL';
          setValidationError(errorMsg);
        }
        return false;
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
      }
    },
    []
  );

  // Nettoyage au démontage du composant
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    isValidating,
    validationError,
    validateUrl,
    resetValidation,
  };
}
