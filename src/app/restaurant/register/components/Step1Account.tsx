'use client';

import { useState, FormEvent } from 'react';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import type { Step1Data } from '@/hooks/useRestaurantRegistration';

interface Step1AccountProps {
  onSubmit: (data: Step1Data) => Promise<void>;
  loading: boolean;
  error: string | null;
}

function isValidPassword(p: string): boolean {
  return p.length >= 8;
}

export function Step1Account({ onSubmit, loading, error: externalError }: Step1AccountProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const error = externalError || localError;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (!firstName.trim() || !lastName.trim()) {
      setLocalError('Prénom et nom sont requis.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setLocalError('Adresse email invalide.');
      return;
    }
    if (!isValidPassword(password)) {
      setLocalError('Le mot de passe doit contenir au moins 8 caractères.');
      return;
    }

    await onSubmit({ firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim(), password, phoneNumber: phone.trim() || undefined });
  };

  return (
    <div className="flex flex-col items-center px-4 py-6">
      <div className="w-full max-w-md">
        <h2 className="text-2xl font-bold mb-1 text-white">Créer votre compte</h2>
        <p className="text-gray-400 mb-6">Étape 1 sur 4 — Informations du gérant</p>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="firstName" className="block text-sm font-medium text-gray-300 mb-1">Prénom</label>
              <input id="firstName" type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} className="glass-input w-full text-white placeholder:text-slate-500" placeholder="Marc" required aria-required="true" />
            </div>
            <div>
              <label htmlFor="lastName" className="block text-sm font-medium text-gray-300 mb-1">Nom</label>
              <input id="lastName" type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} className="glass-input w-full text-white placeholder:text-slate-500" placeholder="Lefèvre" required aria-required="true" />
            </div>
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1">Email</label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="glass-input w-full text-white placeholder:text-slate-500" placeholder="marc@bistro.fr" required aria-required="true" autoComplete="email" />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-1">Mot de passe</label>
            <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="glass-input w-full text-white placeholder:text-slate-500" placeholder="Minimum 8 caractères" required aria-required="true" autoComplete="new-password" minLength={8} />
          </div>

          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-gray-300 mb-1">Téléphone (optionnel)</label>
            <input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="glass-input w-full text-white placeholder:text-slate-500" placeholder="+33 6 12 34 56 78" autoComplete="tel" />
          </div>

          <button type="submit" disabled={loading} className="h-[56px] w-full glass-card border-2 border-primary/60 text-primary font-bold text-lg rounded-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2" aria-label="Créer le compte et continuer">
            {loading ? <span className="animate-spin">⏳</span> : <MaterialIcon name="arrow_forward" />}
            {loading ? 'Création...' : 'Continuer'}
          </button>
        </form>
      </div>
    </div>
  );
}
