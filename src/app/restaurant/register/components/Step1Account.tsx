'use client';

import { useState, useEffect, FormEvent } from 'react';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { InputField } from '@/components/forms/InputField';
import { cn } from '@/lib/utils';
import { driverPrimaryButtonClassName } from '@/app/driver/register/components/driverOnboardingStyles';
import type { Step1Data } from '@/hooks/useRestaurantRegistration';
import { useTranslation } from '@/hooks/useTranslation';

interface Step1AccountProps {
  onSubmit: (data: Step1Data) => Promise<void>;
  onGoogleSignIn?: () => Promise<void>;
  loading: boolean;
  error: string | null;
}

function isValidPassword(p: string): boolean {
  return p.length >= 8;
}

export function Step1Account({ onSubmit, onGoogleSignIn, loading, error: externalError }: Step1AccountProps) {
  const { t } = useTranslation('restaurant');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [phone, setPhone] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const error = externalError || localError;

  useEffect(() => {
    if (!localError) return;
    const timer = setTimeout(() => setLocalError(null), 5000);
    return () => clearTimeout(timer);
  }, [localError]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (!firstName.trim() || !lastName.trim()) {
      const msg = t('requiredNamesError');
      setLocalError(msg);
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      const msg = t('invalidEmailError');
      setLocalError(msg);
      return;
    }
    if (!isValidPassword(password)) {
      const msg = t('passwordMinLengthError');
      setLocalError(msg);
      return;
    }

    await onSubmit({ firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim(), password, phoneNumber: phone.trim() || undefined });
  };

  return (
    <div className="flex flex-col items-center px-4 py-6">
      <div className="w-full max-w-md">
        <h2 className="text-2xl font-bold mb-1 text-white">{t('step1Title')}</h2>
        <p className="text-gray-400 mb-6">{t('step1Subtitle')}</p>

        {error && (
          <div
            className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm flex items-center justify-between gap-2 transition-all duration-300 animate-in fade-in"
            role="alert"
          >
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setLocalError(null)}
              className="p-1 rounded-lg text-red-400 hover:text-white hover:bg-white/10 transition-colors shrink-0"
              aria-label={t('common.close')}
            >
              <MaterialIcon name="close" size="sm" />
            </button>
          </div>
        )}

        {onGoogleSignIn && !showForm && (
          <div className="space-y-3">
            <button
              type="button"
              onClick={onGoogleSignIn}
              disabled={loading}
              aria-label={t('continueWithGoogle')}
              className="w-full flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left transition-colors hover:bg-white/[0.06] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-white/[0.06]">
                <svg fill="none" height="24" viewBox="0 0 24 24" width="24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
              </span>
              <span className="font-bold text-white">{t('continueWithGoogle')}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowForm(true)}
              disabled={loading}
              aria-label={t('continueWithEmail')}
              className="w-full flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left transition-colors hover:bg-white/[0.06] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-white">
                <MaterialIcon name="mail" />
              </span>
              <span className="font-bold text-white">{t('continueWithEmail')}</span>
            </button>
          </div>
        )}

        {onGoogleSignIn && showForm && (
          <button
            type="button"
            onClick={() => setShowForm(false)}
            className="mb-4 flex items-center gap-1 text-sm font-medium text-gray-400 transition-colors hover:text-white"
          >
            <MaterialIcon name="arrow_back" size="sm" />
            {t('changeMethod')}
          </button>
        )}

        {(!onGoogleSignIn || showForm) && (
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <InputField id="firstName" type="text" label={t('firstName')} aria-label={t('firstName')} value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder={t('placeholderFirstName')} required aria-required="true" containerClassName="min-w-0" />
            </div>
            <div>
              <InputField id="lastName" type="text" label={t('lastName')} aria-label={t('lastName')} value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder={t('placeholderLastName')} required aria-required="true" containerClassName="min-w-0" />
            </div>
          </div>

          <div>
            <InputField id="email" type="email" label={t('email')} aria-label={t('email')} value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('placeholderEmail')} required aria-required="true" autoComplete="email" />
          </div>

          <div>
            <InputField
              id="password"
              type={showPassword ? 'text' : 'password'}
              label={t('password')}
              aria-label={t('password')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('passwordPlaceholder')}
              required
              aria-required="true"
              autoComplete="new-password"
              minLength={8}
              rightIcon={(
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? t('hidePassword') : t('showPassword')}
                  aria-pressed={showPassword}
                  className="flex size-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <MaterialIcon name={showPassword ? 'visibility_off' : 'visibility'} size="sm" />
                </button>
              )}
            />
          </div>

          <div>
            <InputField id="phone" type="tel" label={t('phone')} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+33 6 12 34 56 78" autoComplete="tel" />
          </div>

          <button type="submit" disabled={loading} className={cn(driverPrimaryButtonClassName, 'mt-6')} aria-label={t('createAccountAndContinue')}>
            {loading ? <span className="animate-spin">⏳</span> : <MaterialIcon name="arrow_forward" />}
            {loading ? t('creating') : t('continue')}
          </button>
        </form>
        )}
      </div>
    </div>
  );
}
