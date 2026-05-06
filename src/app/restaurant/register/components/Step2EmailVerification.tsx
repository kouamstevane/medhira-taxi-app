'use client';

import { useState, useCallback } from 'react';
import { httpsCallable } from 'firebase/functions';
import toast from 'react-hot-toast';
import OTPInput from '@/components/ui/OTPInput';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { functions } from '@/config/firebase';

interface Step2EmailVerificationProps {
  email: string;
  onVerified: () => void;
  loading: boolean;
  error: string | null;
}

export function Step2EmailVerification({ email, onVerified, loading: externalLoading, error: externalError }: Step2EmailVerificationProps) {
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const error = externalError || localError;

  const sendCode = useCallback(async () => {
    try {
      setLoading(true);
      setLocalError(null);
      const sendVerificationCode = httpsCallable(functions, 'sendVerificationCode');
      await sendVerificationCode({ email });
      return { success: true };
    } catch (err: unknown) {
      const mapped = err as { code?: string; message?: string };
      if (mapped.code === 'functions/resource-exhausted') {
        const msg = 'Trop de tentatives. Réessayez dans quelques minutes.';
        setLocalError(msg);
        toast.error(msg);
        return { success: false, error: 'Trop de tentatives.' };
      } else {
        const msg = mapped.message || 'Erreur lors de l\'envoi du code.';
        setLocalError(msg);
        toast.error(msg);
        return { success: false, error: msg };
      }
    } finally {
      setLoading(false);
    }
  }, [email]);

  const verifyCode = useCallback(async (code: string) => {
    try {
      const verifyCodeFn = httpsCallable(functions, 'verifyCode');
      const result = await verifyCodeFn({ code });
      return result.data as { success: boolean; error?: string; attemptsLeft?: number };
    } catch (err: unknown) {
      const mapped = err as { message?: string };
      return { success: false, error: mapped.message || 'Code incorrect.' };
    }
  }, []);

  const handleVerified = useCallback(() => {
    onVerified();
  }, [onVerified]);

  return (
    <div className="flex flex-col items-center px-4 py-6">
      <div className="w-full max-w-md">
        <h2 className="text-2xl font-bold mb-1 text-white">Vérifiez votre email</h2>
        <p className="text-gray-400 mb-6">Étape 2 sur 4 — Code de vérification envoyé à <strong>{email}</strong></p>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm" role="alert">
            {error}
          </div>
        )}

        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center">
            <MaterialIcon name="mail" size="xl" className="text-blue-500" />
          </div>
        </div>

        <OTPInput
          email={email}
          onVerify={verifyCode}
          onResend={sendCode}
          onSuccess={handleVerified}
          loading={loading}
        />
      </div>
    </div>
  );
}
