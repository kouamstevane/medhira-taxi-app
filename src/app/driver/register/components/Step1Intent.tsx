"use client";
import React, { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

import { InputField } from '@/components/forms/InputField';
import { ERROR_MESSAGES } from '@/utils/constants';
import OTPInput from '@/components/ui/OTPInput';

const step1Schema = z.object({
  email: z.string().email(ERROR_MESSAGES.INVALID_EMAIL),
  password: z.string().min(6, "Le mot de passe doit contenir au moins 6 caractères"),
});

export type Step1FormData = z.infer<typeof step1Schema>;

interface Step1IntentProps {
  onNext: (data: Step1FormData) => void;
  onGoogleSignIn: () => void;
  initialData?: Partial<Step1FormData>;
  loading?: boolean;
  sendVerificationCode?: (email: string) => Promise<{ success: boolean; error?: string }>;
  verifyCode?: (code: string) => Promise<{ success: boolean; error?: string; attemptsLeft?: number }>;
  onVerified?: () => void;
  emailPreVerified?: boolean;
}

export default function Step1Intent({ onNext, onGoogleSignIn, initialData, loading, sendVerificationCode, verifyCode, onVerified, emailPreVerified = false }: Step1IntentProps) {
  const { register, handleSubmit, getValues, formState: { errors } } = useForm<Step1FormData>({
    resolver: zodResolver(step1Schema),
    defaultValues: {
      email: initialData?.email || '',
      password: '',
    }
  });

  const [verificationPhase, setVerificationPhase] = useState(false);
  const [codeVerified, setCodeVerified] = useState(emailPreVerified);
  const [formData, setFormData] = useState<Step1FormData | null>(null);
  const autoAdvancedRef = useRef(false);

  // Si l'email est déjà vérifié (utilisateur authentifié redirigé depuis login),
  // sauter entièrement Step1 et avancer à Step2 au montage.
  useEffect(() => {
    if (emailPreVerified && !autoAdvancedRef.current && onVerified) {
      autoAdvancedRef.current = true;
      onVerified();
    }
  }, [emailPreVerified, onVerified]);

  const handleFormSubmit = async (data: Step1FormData) => {
    if (sendVerificationCode) {
      setFormData(data);
      try {
        await onNext(data);
        setVerificationPhase(true);
      } catch {
        // Error already handled in hook
      }
    } else {
      try {
        await onNext(data);
      } catch {
        // Error already handled in hook
      }
    }
  };

  const handleCodeVerified = () => {
    setCodeVerified(true);
    onVerified?.();
  };

  // Phase B : vérification OTP
  if (verificationPhase && !codeVerified && sendVerificationCode && verifyCode) {
    const email = formData?.email ?? getValues('email');
    return (
      <div className="space-y-6" data-testid="otp-verification-screen">
        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 bg-[#f29200]/20 rounded-full flex items-center justify-center mb-4">
            <span className="text-3xl">✉️</span>
          </div>
          <h2 className="text-2xl font-bold text-white">Vérifiez votre email</h2>
          <p className="text-[#9CA3AF] mt-2">Entrez le code à 6 chiffres envoyé à votre adresse email.</p>
        </div>
        <OTPInput
          email={email}
          onVerify={verifyCode}
          onResend={() => sendVerificationCode(email)}
          onSuccess={handleCodeVerified}
          loading={loading}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="step1-registration-form">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-white">Gagnez de l'argent avec Medjira</h2>
        <p className="text-[#9CA3AF] mt-2">Rejoignez notre réseau de chauffeurs et commencez à rouler aujourd'hui.</p>
      </div>

      <div className="space-y-4">
        {/* Option A: Google */}
        <button
          type="button"
          onClick={onGoogleSignIn}
          disabled={loading}
          data-testid="google-signin-btn"
          className="w-full flex items-center justify-center gap-3 bg-white border border-white/10 rounded-xl p-4 text-[#101010] font-semibold hover:bg-gray-50 transition-colors shadow-sm active:scale-[0.98]"
        >
          <svg width="24" height="24" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
          Continuer avec Google
        </button>

        <div className="relative py-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-white/10"></div>
          </div>
          <div className="relative flex justify-center">
            <span className="bg-[#0F0F0F] px-4 text-sm text-[#9CA3AF]">ou inscription manuelle</span>
          </div>
        </div>

        {/* Option B: Manuel */}
        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
          <InputField
            {...register('email')}
            type="email"
            label="Email"
            placeholder="votre@email.com"
            error={errors.email?.message}
            required
          />

          <InputField
            {...register('password')}
            type="password"
            label="Mot de passe"
            placeholder="••••••••"
            error={errors.password?.message}
            required
          />

          <button
            type="submit"
            disabled={loading}
            data-testid="step1-submit-btn"
            className="w-full bg-gradient-to-r from-[#f29200] to-[#e68600] text-white font-bold py-4 rounded-[28px] hover:brightness-110 transition-all mt-6 flex justify-center items-center shadow-[0_0_20px_rgba(242,146,0,0.4)]"
          >
            {loading ? (
              <span className="animate-pulse">Chargement...</span>
            ) : (
              "Continuer l'inscription"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
