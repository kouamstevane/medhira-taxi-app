"use client";
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { FcGoogle } from 'react-icons/fc';
import { InputField } from '@/components/forms/InputField';
import { ERROR_MESSAGES } from '@/utils/constants';
import OTPInput from '@/components/ui/OTPInput';

const step1Schema = z.object({
  email: z.string().email(ERROR_MESSAGES.INVALID_EMAIL),
  phone: z.string().regex(/^\+?[1-9]\d{1,14}$/, ERROR_MESSAGES.INVALID_PHONE),
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
      phone: initialData?.phone || '',
      password: '',
    }
  });

  const [verificationPhase, setVerificationPhase] = useState(false);
  const [codeVerified, setCodeVerified] = useState(emailPreVerified);
  const [formData, setFormData] = useState<Step1FormData | null>(null);

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
      <div className="space-y-6">
        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mb-4">
            <span className="text-3xl">✉️</span>
          </div>
          <h2 className="text-2xl font-bold text-[#101010]">Vérifiez votre email</h2>
          <p className="text-gray-500 mt-2">Entrez le code à 6 chiffres envoyé à votre adresse email.</p>
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
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-[#101010]">Gagnez de l'argent avec Medjira</h2>
        <p className="text-gray-500 mt-2">Rejoignez notre réseau de chauffeurs et commencez à rouler aujourd'hui.</p>
      </div>

      <div className="space-y-4">
        {/* Option A: Google */}
        <button
          type="button"
          onClick={onGoogleSignIn}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 bg-white border border-gray-300 rounded-xl p-4 text-[#101010] font-semibold hover:bg-gray-50 transition-colors shadow-sm active:scale-[0.98]"
        >
          <FcGoogle size={24} />
          Continuer avec Google
        </button>

        <div className="relative py-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300"></div>
          </div>
          <div className="relative flex justify-center">
            <span className="bg-white px-4 text-sm text-gray-500">ou inscription manuelle</span>
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
            {...register('phone')}
            type="tel"
            label="Téléphone"
            placeholder="+33612345678"
            error={errors.phone?.message}
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
            className="w-full bg-[#f29200] text-white font-bold py-4 rounded-xl hover:bg-[#e68600] transition-colors mt-6 flex justify-center items-center"
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
