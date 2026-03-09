"use client";
import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Loader2, ShieldCheck } from 'lucide-react';

const step5Schema = z.object({
  accountHolder: z.string().min(2, "Nom du titulaire requis"),
  iban: z.string()
    .transform(v => v.replace(/[\s]/g, '').toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9]{5,34}$/, "Numéro de compte / IBAN invalide")),
  bic: z.string()
    .transform(v => v.replace(/[\s]/g, '').toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9]{3,15}$/, "Code banque / BIC invalide")),
});

export type Step5FormData = z.infer<typeof step5Schema>;

/**
 * Props pour le composant Step5Monetization
 * @property onSubmitFinal - Callback appelé lors de la soumission finale du formulaire
 * @property onBack - Callback pour revenir à l'étape précédente
 * @property initialData - Données initiales pour pré-remplir le formulaire
 * @property loading - État de chargement pour désactiver les boutons pendant les opérations asynchrones
 * @property disabled - État de désactivation supplémentaire (ex: après soumission réussie)
 */
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
  initialData, 
  loading = false,
  disabled = false 
}: Step5MonetizationProps) {
  const { register, handleSubmit, formState: { errors } } = useForm<Step5FormData>({
    resolver: zodResolver(step5Schema),
    defaultValues: {
      accountHolder: initialData?.accountHolder || '',
      iban: initialData?.iban || '',
      bic: initialData?.bic || '',
    }
  });

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-[#101010]">Paiement & Monétisation</h2>
        <p className="text-gray-500 mt-2">Où souhaitez-vous recevoir vos gains ?</p>
      </div>

      <div className="bg-green-50 text-green-800 p-4 rounded-xl flex items-start gap-3 border border-green-200 mb-6">
          <ShieldCheck className="w-6 h-6 shrink-0 mt-0.5" />
          <div>
              <p className="font-semibold text-sm">Paiements Sécurisés</p>
              <p className="text-xs mt-1">Vos informations bancaires sont chiffrées de bout en bout et conservées en toute sécurité. Seuls les virements vers ce compte seront autorisés.</p>
          </div>
      </div>

      <form onSubmit={handleSubmit(onSubmitFinal)} className="space-y-6">
        
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
            <h3 className="text-lg font-semibold text-[#101010] border-b pb-2">Coordonnées Bancaires</h3>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Titulaire du compte</label>
              <input 
                {...register('accountHolder')} 
                placeholder="Prénom et NOM identiques à la pièce d'identité" 
                className="w-full p-3 border border-gray-300 rounded-lg text-[#101010] outline-none focus:ring-2 focus:ring-[#f29200]" 
              />
              <p className="text-xs text-gray-500 mt-1">Doit correspondre exactement au nom indiqué lors de l'inscription.</p>
              {errors.accountHolder && <p className="text-red-500 text-xs mt-1">{errors.accountHolder.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">IBAN / Numéro de compte</label>
              <input 
                {...register('iban')} 
                type="text"
                placeholder="Ex: FR76 1234... ou 0123456789" 
                className="w-full p-3 border border-gray-300 rounded-lg text-[#101010] outline-none focus:ring-2 focus:ring-[#f29200] font-mono tracking-wider" 
              />
              {errors.iban && <p className="text-red-500 text-xs mt-1">{errors.iban.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">BIC / SWIFT / Code banque</label>
              <input 
                {...register('bic')} 
                placeholder="Ex: BKPAFR2X ou 12345" 
                className="w-full p-3 border border-gray-300 rounded-lg text-[#101010] outline-none focus:ring-2 focus:ring-[#f29200] font-mono tracking-wider uppercase" 
              />
              {errors.bic && <p className="text-red-500 text-xs mt-1">{errors.bic.message}</p>}
            </div>
        </div>

        <div className="flex gap-4 pt-4">
           {/* 
             Bouton Retour : Désactivé si chargement en cours ou si le formulaire est désactivé
             Touch target minimum 44x44px respecté (py-4 = ~48px de hauteur)
           */}
           <button 
            type="button" 
            onClick={onBack} 
            disabled={loading || disabled}
            className="w-1/3 bg-gray-200 text-[#101010] font-bold py-4 rounded-xl hover:bg-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Retour
          </button>
          
          {/* 
             Bouton Soumettre : Désactivé si chargement en cours ou si le formulaire est désactivé
             Affiche un spinner pendant le chargement
             Touch target minimum 44x44px respecté (py-4 = ~48px de hauteur)
           */}
          <button 
            type="submit" 
            disabled={loading || disabled}
            className="w-2/3 bg-green-600 text-white font-bold py-4 rounded-xl hover:bg-green-700 transition-colors flex justify-center items-center shadow-lg hover:shadow-green-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
             {loading ? <Loader2 className="animate-spin mr-2" /> : null} Soumettre ma candidature
          </button>
        </div>
      </form>
    </div>
  );
}
