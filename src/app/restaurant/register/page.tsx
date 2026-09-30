'use client';

import { Suspense, useCallback } from 'react';
import { useRestaurantRegistration } from '@/hooks/useRestaurantRegistration';
import type { Step3Data } from '@/hooks/useRestaurantRegistration';
import { Step1Account } from './components/Step1Account';
import { Step2EmailVerification } from './components/Step2EmailVerification';
import { Step3Restaurant } from './components/Step3Restaurant';
import { Step4Hours } from './components/Step4Hours';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { cn } from '@/lib/utils';
import { driverSecondaryButtonClassName } from '@/app/driver/register/components/driverOnboardingStyles';
import { useTranslation } from '@/hooks/useTranslation';

function RestaurantRegisterWizard() {
  const { t } = useTranslation('restaurant');
  const {
    currentStep,
    loading,
    isLeaving,
    error,
    isSubmitting,
    fromBecomePro,
    restoringDraft,
    step1Data,
    step3Data,
    step4Data,
    setStepData,
    goToStep,
    handleStep1Submit,
    handleGoogleSignIn,
    handleStep2Verified,
    handleDraftSave,
    saveDraftDebounced,
    handleSubmit,
    leaveRegistration,
  } = useRestaurantRegistration();

  const progress = (currentStep / 4) * 100;

  const handleStep3Next = useCallback((data: Step3Data) => {
    setStepData(3, data as unknown as Record<string, unknown>);
    handleDraftSave(data, 3);
    goToStep(4);
  }, [goToStep, handleDraftSave, setStepData]);

  const handleStep3Back = useCallback(() => {
    goToStep(2);
  }, [goToStep]);

  if (restoringDraft) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <div className="w-full max-w-md mx-auto px-4 pt-4">
        <nav className="mb-4 flex items-center justify-between" aria-label={t('navLabel')}>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void leaveRegistration('/')}
              disabled={isLeaving}
              className={cn(driverSecondaryButtonClassName, 'h-9 min-h-9 w-auto gap-2 rounded-xl px-3 text-xs bg-white/[0.03] border-white/10 text-gray-300 hover:bg-white/[0.06] hover:text-white transition-all')}
              aria-label={t('homeNav')}
            >
              <MaterialIcon name="home" size="sm" />
              {t('homeNav')}
            </button>
            <button
              type="button"
              onClick={() => void leaveRegistration('/login')}
              disabled={isLeaving}
              className={cn(driverSecondaryButtonClassName, 'h-9 min-h-9 w-auto gap-2 rounded-xl px-3 text-xs bg-white/[0.03] border-white/10 text-gray-300 hover:bg-white/[0.06] hover:text-white transition-all')}
              aria-label={t('loginNav')}
            >
              <MaterialIcon name="login" size="sm" />
              {t('loginNav')}
            </button>
          </div>
          <span className="text-xs font-semibold text-primary/90 bg-primary/10 border border-primary/20 px-2.5 py-1 rounded-full">
            {t('stepIndicator', { step: currentStep })}
          </span>
        </nav>
        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-amber-500 to-[#f29200] rounded-full transition-all duration-300 shadow-[0_0_10px_rgba(242,146,0,0.4)]"
            style={{ width: `${progress}%` }}
          />
        </div>
        {fromBecomePro && (
          <div className="flex justify-end mt-1.5">
            <span className="text-xs text-primary font-medium">{t('addingRoleBadge')}</span>
          </div>
        )}
      </div>

      {currentStep === 1 && (
        <Step1Account
          onSubmit={handleStep1Submit}
          onGoogleSignIn={handleGoogleSignIn}
          loading={loading}
          error={error}
        />
      )}

      {currentStep === 2 && step1Data.email && (
        <Step2EmailVerification
          email={step1Data.email}
          onVerified={handleStep2Verified}
          loading={loading}
          error={error}
        />
      )}

      {currentStep === 3 && (
        <Step3Restaurant
          onNext={handleStep3Next}
          onBack={handleStep3Back}
          initialData={step3Data as Partial<Step3Data> | undefined}
          loading={loading}
        />
      )}

      {currentStep === 4 && (
        <Step4Hours
          onSubmit={handleSubmit}
          onChange={(hours) => {
            setStepData(4, { openingHours: hours });
            saveDraftDebounced({ openingHours: hours }, 4);
          }}
          onBack={() => goToStep(3)}
          initialData={step4Data as Partial<import('@/hooks/useRestaurantRegistration').Step4Data> | undefined}
          loading={loading || isSubmitting}
          error={error}
        />
      )}
    </div>
  );
}

export default function RestaurantRegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><LoadingSpinner /></div>}>
      <RestaurantRegisterWizard />
    </Suspense>
  );
}
