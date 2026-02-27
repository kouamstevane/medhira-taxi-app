"use client";
import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { FcGoogle } from 'react-icons/fc';

const step1Schema = z.object({
  email: z.string().email("Adresse email invalide"),
  phone: z.string().regex(/^\+?[1-9]\d{1,14}$/, "Numéro de téléphone invalide"),
  password: z.string().min(6, "Le mot de passe doit contenir au moins 6 caractères"),
});

export type Step1FormData = z.infer<typeof step1Schema>;

interface Step1IntentProps {
  onNext: (data: Step1FormData) => void;
  onGoogleSignIn: () => void;
  initialData?: Partial<Step1FormData>;
  loading?: boolean;
}

export default function Step1Intent({ onNext, onGoogleSignIn, initialData, loading }: Step1IntentProps) {
  const { register, handleSubmit, formState: { errors } } = useForm<Step1FormData>({
    resolver: zodResolver(step1Schema),
    defaultValues: {
      email: initialData?.email || '',
      phone: initialData?.phone || '',
      password: '',
    }
  });

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-[#101010]">Gagnez de l'argent avec Medjira</h2>
        <p className="text-gray-500 mt-2">Rejoignez notre réseau de chauffeurs et commencez à rouler aujourd'hui.</p>
      </div>

      <div className="space-y-4">
        {/* Option A: Google */}
        <button
          type="button"
          onClick={onGoogleSignIn}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 bg-white border border-gray-300 rounded-xl p-4 text-[#101010] font-semibold hover:bg-gray-50 transition-colors"
        >
          <FcGoogle size={24} />
          Continuer avec Google
        </button>

        <div className="relative py-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300"></div>
          </div>
          <div className="relative flex justify-center">
            <span className="bg-white px-4 text-sm text-gray-500">ou inscription manuelle</span>
          </div>
        </div>

        {/* Option B: Manuel */}
        <form onSubmit={handleSubmit(onNext)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              {...register('email')}
              type="email"
              placeholder="votre@email.com"
              className="w-full p-3 border border-gray-300 rounded-lg text-[#101010] bg-white focus:ring-2 focus:ring-[#f29200] focus:border-transparent outline-none"
            />
            {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone</label>
            <input
              {...register('phone')}
              type="tel"
              placeholder="+33612345678"
              className="w-full p-3 border border-gray-300 rounded-lg text-[#101010] bg-white focus:ring-2 focus:ring-[#f29200] focus:border-transparent outline-none"
            />
            {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mot de passe</label>
            <input
              {...register('password')}
              type="password"
              placeholder="••••••••"
              className="w-full p-3 border border-gray-300 rounded-lg text-[#101010] bg-white focus:ring-2 focus:ring-[#f29200] focus:border-transparent outline-none"
            />
            {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#f29200] text-white font-bold py-4 rounded-xl hover:bg-[#e68600] transition-colors mt-6 flex justify-center items-center"
          >
            {loading ? (
              <span className="animate-pulse">Chargement...</span>
            ) : (
              "Continuer l'inscription"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
