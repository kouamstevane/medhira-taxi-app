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
    .pipe(z.string().regex(/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/, "IBAN invalide")),
  bic: z.string()
    .transform(v => v.replace(/[\s]/g, '').toUpperCase())
    .pipe(z.string().regex(/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/, "BIC/SWIFT invalide")),
});

export type Step5FormData = z.infer<typeof step5Schema>;

interface Step5MonetizationProps {
  onSubmitFinal: (data: Step5FormData) => void;
  onBack: () => void;
  initialData?: Partial<Step5FormData>;
  loading?: boolean;
}

export default function Step5Monetization({ onSubmitFinal, onBack, initialData, loading }: Step5MonetizationProps) {
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
              <label className="block text-sm font-medium text-gray-700 mb-1">IBAN</label>
              <input 
                {...register('iban')} 
                type="text"
                placeholder="FR76 1234 5678 9012 3456 7890 123" 
                className="w-full p-3 border border-gray-300 rounded-lg text-[#101010] outline-none focus:ring-2 focus:ring-[#f29200] font-mono tracking-wider" 
              />
              {errors.iban && <p className="text-red-500 text-xs mt-1">{errors.iban.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">BIC/SWIFT</label>
              <input 
                {...register('bic')} 
                placeholder="BKPAFR2X" 
                className="w-full p-3 border border-gray-300 rounded-lg text-[#101010] outline-none focus:ring-2 focus:ring-[#f29200] font-mono tracking-wider uppercase" 
              />
              {errors.bic && <p className="text-red-500 text-xs mt-1">{errors.bic.message}</p>}
            </div>
        </div>

        <div className="flex gap-4 pt-4">
           <button type="button" onClick={onBack} disabled={loading} className="w-1/3 bg-gray-200 text-[#101010] font-bold py-4 rounded-xl hover:bg-gray-300 transition-colors">
            Retour
          </button>
          <button type="submit" disabled={loading} className="w-2/3 bg-green-600 text-white font-bold py-4 rounded-xl hover:bg-green-700 transition-colors flex justify-center items-center shadow-lg hover:shadow-green-600/20">
             {loading ? <Loader2 className="animate-spin mr-2" /> : null} Soumettre ma candidature
          </button>
        </div>
      </form>
    </div>
  );
}
