'use client';

import { useState } from 'react';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { useTranslation } from '@/hooks/useTranslation';

interface DriverOnboardingDecisionProps {
  registrationType?: 'driver' | 'restaurant';
  onResume: () => void;
  onLater: () => Promise<void>;
  onAbandon: () => Promise<void>;
  deleteAccountOnAbandon?: boolean;
}

export function DriverOnboardingDecision({
  registrationType = 'driver',
  onResume,
  onLater,
  onAbandon,
  deleteAccountOnAbandon = true,
}: DriverOnboardingDecisionProps) {
  const { t } = useTranslation();
  const isRestaurant = registrationType === 'restaurant';
  const [isConfirmingAbandonment, setIsConfirmingAbandonment] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runAction = async (action: () => Promise<void>) => {
    setIsProcessing(true);
    setError(null);
    try {
      await action();
    } catch (actionError: unknown) {
      setError(actionError instanceof Error ? actionError.message : 'Une erreur est survenue. Réessayez.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background font-sans text-slate-100 antialiased flex items-center justify-center p-4">
      <div className="glass-card rounded-2xl w-full max-w-lg p-8 text-center">
        <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-primary/10 border border-primary/30 mb-6">
          <MaterialIcon name="edit_note" className="text-primary text-[32px]" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-3">
          {isRestaurant ? t('auth.restaurantOnboardingInProgress') : t('auth.driverOnboardingInProgress')}
        </h1>
        <p className="text-slate-400 leading-6 mb-8">
          {t('auth.onboardingIncompleteDesc', { role: isRestaurant ? (t('auth.restaurantRole') || 'restaurateur') : (t('common.roles.driver') || 'chauffeur') })}
        </p>

        {error && (
          <div className="mb-5 p-4 bg-destructive/10 border border-destructive/30 rounded-xl text-left text-sm text-destructive" role="alert">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <button
            type="button"
            onClick={onResume}
            disabled={isProcessing}
            aria-label={t('auth.resumeRegistration')}
            className="w-full h-14 flex items-center justify-center gap-2 bg-gradient-to-r from-primary to-[#ffae33] text-white font-bold rounded-2xl primary-glow active:scale-[0.98] transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <MaterialIcon name="play_arrow" size="md" />
            {t('auth.resumeRegistration')}
          </button>
          <button
            type="button"
            onClick={() => void runAction(onLater)}
            disabled={isProcessing}
            aria-label={t('auth.later')}
            className="w-full h-14 flex items-center justify-center gap-2 glass-card border border-white/10 text-slate-200 font-bold rounded-2xl active:scale-[0.98] transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <MaterialIcon name="schedule" size="md" />
            {t('auth.later')}
          </button>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setIsConfirmingAbandonment(true);
            }}
            disabled={isProcessing}
            aria-label={t('auth.abandonRegistration')}
            className="w-full h-14 flex items-center justify-center gap-2 border border-destructive/40 text-destructive font-bold rounded-2xl active:scale-[0.98] transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <MaterialIcon name="delete_forever" size="md" />
            {t('auth.abandonRegistration')}
          </button>
        </div>
      </div>

      {isConfirmingAbandonment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="abandon-driver-title">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-950 p-6 shadow-2xl">
            <h2 id="abandon-driver-title" className="text-xl font-bold text-white">{t('auth.abandonRegistrationTitle')}</h2>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              {deleteAccountOnAbandon ? t('auth.abandonAccountWarning') : t('auth.abandonRoleWarning')}
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row-reverse">
              <button
                type="button"
                onClick={() => void runAction(onAbandon)}
                disabled={isProcessing}
                className="h-12 flex-1 rounded-xl bg-destructive px-4 font-bold text-white transition-opacity disabled:opacity-50"
              >
                {isProcessing ? (t('common.saving') || 'Suppression…') : t('auth.confirmAbandon')}
              </button>
              <button
                type="button"
                onClick={() => setIsConfirmingAbandonment(false)}
                disabled={isProcessing}
                className="h-12 flex-1 rounded-xl border border-white/10 px-4 font-semibold text-slate-300 transition-colors hover:bg-white/5 disabled:opacity-50"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
