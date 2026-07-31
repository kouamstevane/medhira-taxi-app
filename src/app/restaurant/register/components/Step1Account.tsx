'use client';

import { useState, FormEvent } from 'react';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import type { Step1Data } from '@/hooks/useRestaurantRegistration';

interface Step1AccountProps {
  onSubmit: (data: Step1Data) => Promise<void>;
  onGoogleSignIn?: () => Promise<void>;
  loading: boolean;
  error: string | null;
}

function isValidPassword(p: string): boolean {
  return p.length >= 8;
}

export function Step1Account({ onSubmit, onGoogleSignIn, loading, error: externalError }: Step1AccountProps) {
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

        {onGoogleSignIn && (
          <div className="mb-6">
            <button
              type="button"
              onClick={onGoogleSignIn}
              disabled={loading}
              aria-label="Continuer avec Google"
              className="glass-card w-full h-14 flex items-center justify-center gap-3 rounded-xl border border-white/10 text-white font-semibold hover:bg-white/5 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              <svg fill="none" height="20" viewBox="0 0 24 24" width="20">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              <span>Continuer avec Google</span>
            </button>

            <div className="flex items-center my-6 space-x-4">
              <div className="flex-1 h-[1px] bg-slate-800" />
              <span className="text-slate-500 text-sm font-medium">ou créer manuellement</span>
              <div className="flex-1 h-[1px] bg-slate-800" />
            </div>
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
