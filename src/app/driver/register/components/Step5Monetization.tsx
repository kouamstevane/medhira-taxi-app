"use client";
import React, { useState } from 'react';
import { Loader2, Lock } from 'lucide-react';
import { ACTIVE_MARKET } from '@/utils/constants';
import { InputField } from '@/components/forms/InputField';
import { useToast } from '@/hooks/useToast';
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
  const { showError } = useToast();
  const [taxId, setTaxId] = useState(initialData?.taxId || '');

  const isChauffeur = driverType === 'chauffeur' || driverType === 'les_deux';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isChauffeur && taxId.trim().length < 5) {
      showError("Le numéro d'enregistrement fiscal est obligatoire pour le service VTC.");
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
        <h2 className="text-2xl font-bold text-white">Paiement & Monétisation</h2>
        <p className="text-[#9CA3AF] mt-2">Configuration de vos virements</p>
      </div>

      {/* Informations Fiscales (VTC uniquement) */}
      {isChauffeur && (
        <div className={driverSectionCardClassName}>
          <h3 className={driverSectionTitleClassName}>Informations Fiscales</h3>
          <InputField
            label="Numéro fiscal ou d'entreprise (TPS-TVH, TVA, SIRET)"
            value={taxId}
            onChange={(e) => setTaxId(e.target.value)}
            placeholder="Ex: 123456789 RT0001 (Canada) ou SIRET (France)"
            helperText="Requis réglementairement pour émettre les factures des trajets VTC."
            required
          />
        </div>
      )}

      {/* Bannière Stripe */}
      <div className={cn(driverInfoBannerClassName, 'bg-white/[0.03] border-white/[0.08] flex items-start gap-4')}>
        <div className="w-10 h-10 rounded-full bg-white/[0.06] flex items-center justify-center flex-shrink-0">
          <Lock className="w-5 h-5 text-[#f29200]" />
        </div>
        <div>
          <p className="font-semibold text-white text-sm">Coordonnées bancaires sécurisées par Stripe</p>
          <p className="text-xs text-[#9CA3AF] mt-1 leading-relaxed">
            Pour votre sécurité et la conformité <strong>PCI DSS</strong>, vous serez redirigé vers
            le formulaire sécurisé de Stripe pour renseigner vos informations bancaires après la
            soumission de votre candidature. Elles ne sont jamais stockées sur nos serveurs.
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
          Retour
        </button>

        <button
          type="submit"
          disabled={loading || disabled}
          className={cn(driverPrimaryButtonClassName, 'w-2/3')}
        >
          {loading ? <Loader2 className="animate-spin mr-2 w-5 h-5" /> : null}
          Soumettre ma candidature
        </button>
      </form>
    </div>
  );
}
