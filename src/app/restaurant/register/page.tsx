'use client';

import { Suspense, useCallback } from 'react';
import Link from 'next/link';
import { useRestaurantRegistration } from '@/hooks/useRestaurantRegistration';
import type { Step3Data } from '@/hooks/useRestaurantRegistration';
import { Step1Account } from './components/Step1Account';
import { Step2EmailVerification } from './components/Step2EmailVerification';
import { Step3Restaurant } from './components/Step3Restaurant';
import { Step4Hours } from './components/Step4Hours';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { MaterialIcon } from '@/components/ui/MaterialIcon';

function RestaurantRegisterWizard() {
  const {
    currentStep,
    loading,
    error,
    isSubmitting,
    fromBecomePro,
    restoringDraft,
    alreadyHasRestaurant,
    step1Data,
    step3Data,
    step4Data,
    goToStep,
    handleStep1Submit,
    handleStep2Verified,
    handleDraftSave,
    handleSubmit,
  } = useRestaurantRegistration();

  const progress = (currentStep / 4) * 100;

  const handleStep3Next = useCallback((data: Step3Data) => {
    handleDraftSave(data, 3);
    goToStep(4);
  }, [handleDraftSave, goToStep]);

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

  if (alreadyHasRestaurant) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-md text-center glass-card rounded-3xl p-8 border border-white/5">
          <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center mx-auto mb-4">
            <MaterialIcon name="store" size="xl" className="text-orange-500" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Vous avez déjà un restaurant</h2>
          <p className="text-gray-400 text-sm mb-6">
            Un seul restaurant par compte est autorisé. Contactez le support si nécessaire.
          </p>
          <Link href="/dashboard" className="inline-block h-[48px] px-6 glass-card border border-white/10 text-slate-300 font-semibold rounded-xl leading-[48px]">
            Retour au dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <div className="w-full max-w-md mx-auto px-4 pt-4">
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
          onBack={() => goToStep(3)}
          initialData={step4Data as Partial<import('@/hooks/useRestaurantRegistration').Step4Data> | undefined}
          loading={loading || isSubmitting}
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
