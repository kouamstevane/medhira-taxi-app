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

function RestaurantRegisterWizard() {
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
        <nav className="mb-4 flex items-center justify-between" aria-label="Navigation de l'inscription">
          <button
            type="button"
            onClick={() => void leaveRegistration('/')}
            disabled={isLeaving}
            className={cn(driverSecondaryButtonClassName, 'h-10 min-h-10 w-auto gap-2 rounded-xl px-3 text-sm')}
            aria-label="Accueil"
          >
            <MaterialIcon name="home" size="sm" />
            Accueil
          </button>
          <button
            type="button"
            onClick={() => void leaveRegistration('/login')}
            disabled={isLeaving}
            className={cn(driverSecondaryButtonClassName, 'h-10 min-h-10 w-auto gap-2 rounded-xl px-3 text-sm')}
            aria-label="Connexion"
          >
            <MaterialIcon name="login" size="sm" />
            Connexion
          </button>
        </nav>
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-xs text-gray-400">Étape {currentStep} / 4</span>
          {fromBecomePro && (
            <span className="text-xs text-primary font-medium">Ajout de rôle</span>
          )}
        </div>
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
