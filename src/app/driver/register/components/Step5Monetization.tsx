"use client";
import React from 'react';
import { Loader2, ShieldCheck, Lock } from 'lucide-react';
import { ACTIVE_MARKET } from '@/utils/constants';

/**
 * Step5Monetization — Paiement & Monétisation
 *
 * Informe le chauffeur que ses informations bancaires seront collectées
 * de manière sécurisée via le formulaire Stripe Connect après l'inscription.
 *
 * ❌ SUPPRIMÉ : formulaire IBAN/BIC (non-conforme PCI DSS)
 * ✅ REMPLACÉ : message d'information + redirection Stripe onboarding
 */

// Les données bancaires ne sont plus collectées ici — Stripe les collecte via onboarding
export type Step5FormData = {
  country: string;
};

interface Step5MonetizationProps {
  onSubmitFinal: (data: Step5FormData) => void;
  onBack: () => void;
  initialData?: Partial<Step5FormData>;
  loading?: boolean;
  disabled?: boolean;
}

export default function Step5Monetization({
  onSubmitFinal,
  onBack,
  loading = false,
  disabled = false,
}: Step5MonetizationProps) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmitFinal({ country: ACTIVE_MARKET });
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-white">Paiement & Monétisation</h2>
        <p className="text-[#9CA3AF] mt-2">Configuration de vos virements</p>
      </div>

      {/* Bannière Stripe */}
      <div className="bg-[#635bff]/10 border border-[#635bff]/30 p-5 rounded-xl flex items-start gap-4">
        <div className="w-10 h-10 rounded-full bg-[#635bff]/20 flex items-center justify-center flex-shrink-0">
          <Lock className="w-5 h-5 text-[#635bff]" />
        </div>
        <div>
          <p className="font-semibold text-white text-sm">Coordonnées bancaires sécurisées par Stripe</p>
          <p className="text-xs text-[#9CA3AF] mt-1 leading-relaxed">
            Pour votre sécurité et conformité <strong>PCI DSS</strong>, vos informations bancaires
            sont collectées directement via le formulaire sécurisé de Stripe — jamais stockées
            sur nos serveurs.
          </p>
        </div>
      </div>

      <div className="flex justify-center">
        <div className="bg-[#1A1A1A] rounded-xl p-3 text-center border border-white/[0.06] w-32">
          <ShieldCheck className="w-6 h-6 text-green-600 mx-auto mb-1" />
          <p className="text-xs font-medium text-[#9CA3AF]">PCI DSS</p>
          <p className="text-xs text-[#4B5563]">Certifié</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex gap-4 pt-2">
        <button
          type="button"
          onClick={onBack}
          disabled={loading || disabled}
          className="w-1/3 bg-[#1A1A1A] border border-white/10 text-white font-bold py-4 rounded-xl hover:bg-white/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Retour
        </button>

        <button
          type="submit"
          disabled={loading || disabled}
          className="w-2/3 bg-green-600 text-white font-bold py-4 rounded-[28px] hover:bg-green-700 transition-colors flex justify-center items-center shadow-lg hover:shadow-green-600/20 shadow-[0_0_20px_rgba(16,185,129,0.4)] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? <Loader2 className="animate-spin mr-2 w-5 h-5" /> : null}
          Soumettre ma candidature
        </button>
      </form>
    </div>
  );
}
