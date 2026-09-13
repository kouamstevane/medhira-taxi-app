"use client";
import React, { useState } from 'react';
import { Loader2, Lock } from 'lucide-react';
import { ACTIVE_MARKET } from '@/utils/constants';
import { InputField } from '@/components/forms/InputField';
import { useToast } from '@/hooks/useToast';
import { useTranslation } from '@/hooks/useTranslation';
import { cn } from '@/lib/utils';
import {
  driverInfoBannerClassName,
  driverPrimaryButtonClassName,
  driverSecondaryButtonClassName,
  driverSectionCardClassName,
  driverSectionTitleClassName,
} from './driverOnboardingStyles';

export type Step5FormData = {
  country: string;
  taxId?: string;
};

interface Step5MonetizationProps {
  onSubmitFinal: (data: Step5FormData) => void;
  onBack: () => void;
  initialData?: Partial<Step5FormData>;
  loading?: boolean;
  disabled?: boolean;
  driverType?: 'chauffeur' | 'livreur' | 'les_deux';
}

export default function Step5Monetization({
  onSubmitFinal,
  onBack,
  initialData,
  loading = false,
  disabled = false,
  driverType = 'chauffeur',
}: Step5MonetizationProps) {
  const { t } = useTranslation();
  const { showError } = useToast();
  const [taxId, setTaxId] = useState(initialData?.taxId || '');

  const isChauffeur = driverType === 'chauffeur' || driverType === 'les_deux';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isChauffeur && taxId.trim().length < 5) {
      showError(t('driver.taxIdRequired'));
      return;
    }
    onSubmitFinal({
      country: ACTIVE_MARKET,
      taxId: isChauffeur ? taxId.trim() : undefined,
    });
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-white">{t('driver.paymentMonetizationTitle')}</h2>
        <p className="text-[#9CA3AF] mt-2">{t('driver.paymentMonetizationSubtitle')}</p>
      </div>

      {/* Informations Fiscales (VTC uniquement) */}
      {isChauffeur && (
        <div className={driverSectionCardClassName}>
          <h3 className={driverSectionTitleClassName}>{t('driver.taxInfoSection')}</h3>
          <InputField
            label={t('driver.taxIdLabel')}
            value={taxId}
            onChange={(e) => setTaxId(e.target.value)}
            placeholder={t('driver.taxIdPlaceholder')}
            helperText={t('driver.taxIdHelper')}
            required
          />
        </div>
      )}

      {/* Stripe banner */}
      <div className={cn(driverInfoBannerClassName, 'bg-white/[0.03] border-white/[0.08] flex items-start gap-4')}>
        <div className="w-10 h-10 rounded-full bg-white/[0.06] flex items-center justify-center flex-shrink-0">
          <Lock className="w-5 h-5 text-[#f29200]" />
        </div>
        <div>
          <p className="font-semibold text-white text-sm">{t('driver.stripeSecuredTitle')}</p>
          <p className="text-xs text-[#9CA3AF] mt-1 leading-relaxed">
            {t('driver.stripeSecuredDesc')}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex gap-4 pt-2">
        <button
          type="button"
          onClick={onBack}
          disabled={loading || disabled}
          className={cn(driverSecondaryButtonClassName, 'w-1/3')}
        >
          {t('common.back')}
        </button>

        <button
          type="submit"
          disabled={loading || disabled}
          className={cn(driverPrimaryButtonClassName, 'w-2/3')}
        >
          {loading ? <Loader2 className="animate-spin mr-2 w-5 h-5" /> : null}
          {t('driver.submitApplication')}
        </button>
      </form>
    </div>
  );
}
