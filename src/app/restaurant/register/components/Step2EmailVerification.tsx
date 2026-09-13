'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { httpsCallable } from 'firebase/functions';
import toast from 'react-hot-toast';
import OTPInput from '@/components/ui/OTPInput';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { functions } from '@/config/firebase';
import { useTranslation } from '@/hooks/useTranslation';

interface Step2EmailVerificationProps {
  email: string;
  onVerified: () => void;
  loading: boolean;
  error: string | null;
}

export function Step2EmailVerification({ email, onVerified, loading: externalLoading, error: externalError }: Step2EmailVerificationProps) {
  const { t } = useTranslation('restaurant');
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const initialRequestEmail = useRef<string | null>(null);

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
        const msg = t('tooManyAttemptsError');
        setLocalError(msg);
        toast.error(msg);
        return { success: false, error: t('tooManyAttempts') };
      } else {
        const msg = mapped.message || t('codeSentError');
        setLocalError(msg);
        toast.error(msg);
        return { success: false, error: msg };
      }
    } finally {
      setLoading(false);
    }
  }, [email, t]);

  const verifyCode = useCallback(async (code: string) => {
    try {
      const verifyCodeFn = httpsCallable(functions, 'verifyCode');
      const result = await verifyCodeFn({ code });
      return result.data as { success: boolean; error?: string; attemptsLeft?: number };
    } catch (err: unknown) {
      const mapped = err as { message?: string };
      return { success: false, error: mapped.message || t('incorrectCodeError') };
    }
  }, [t]);

  useEffect(() => {
    if (!email || initialRequestEmail.current === email) return;
    initialRequestEmail.current = email;
    void sendCode();
  }, [email, sendCode]);

  const handleVerified = useCallback(() => {
    onVerified();
  }, [onVerified]);

  return (
    <div className="flex flex-col items-center px-4 py-6">
      <div className="w-full max-w-md">
        <h2 className="text-2xl font-bold mb-1 text-white">{t('step2Title')}</h2>
        <p className="text-gray-400 mb-6">{t('step2Subtitle')} <strong>{email}</strong></p>

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
          loading={externalLoading || loading}
        />
      </div>
    </div>
  );
}
