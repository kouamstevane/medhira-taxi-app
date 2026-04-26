"use client";
import dynamic from 'next/dynamic';
import type React from 'react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/config/firebase';
import { functions } from '@/config/firebase';
import { httpsCallable } from 'firebase/functions';
import { CURRENCY_CODE, LIMITS, WALLET_PRESET_AMOUNTS, ACTIVE_MARKET } from '@/utils/constants';
import { formatCurrencyWithCode } from '@/utils/format';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { BottomNav } from '@/components/ui/BottomNav';
const StripePaymentElement = dynamic(() => import('@/components/stripe/StripePaymentElement').then(m => ({ default: m.StripePaymentElement })), { ssr: false, loading: () => <div className="w-full h-48 bg-gray-100 animate-pulse rounded-xl" /> })
import { STRIPE_CURRENCY_BY_MARKET } from '@/types/stripe';

type PaymentStep = 'select' | 'stripe_form';

export default function RechargerPage() {
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState<PaymentStep>('select');
  const [stripeClientSecret, setStripeClientSecret] = useState('');
  const router = useRouter();

  const stripeCurrency = STRIPE_CURRENCY_BY_MARKET[ACTIVE_MARKET] ?? 'cad';

  // ============================================================
  // Soumission : uniquement Stripe (carte bancaire)
  // ============================================================

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Vous devez être connecté pour recharger');

      const numericAmount = parseFloat(amount);
      if (isNaN(numericAmount) || numericAmount < LIMITS.MIN_WALLET_RECHARGE) {
        throw new Error(`Le montant minimum est de ${LIMITS.MIN_WALLET_RECHARGE} ${CURRENCY_CODE}`);
      }

      // Créer le PaymentIntent via l'API Stripe
      const rechargeFn = httpsCallable<{ amount: number }, { clientSecret: string }>(functions, 'stripeWalletRecharge');
      const result = await rechargeFn({ amount: numericAmount });
      const data = result.data;

      setStripeClientSecret(data.clientSecret);
      setStep('stripe_form');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue. Veuillez réessayer.');
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // Callback succès Stripe
  // ============================================================

  const handleStripeSuccess = async (_paymentIntentId: string) => {
    // Le solde est crédité par le webhook Stripe (payment_intent.succeeded →
    // Cloud Function stripeWebhookInstant). On redirige avec un message informatif.
    router.push(`/wallet?success=${encodeURIComponent('Recharge en cours de traitement. Votre solde sera mis à jour dans quelques instants.')}`);
  };

  const handleStripeError = (message: string) => {
    setError(message);
    setStep('select');
  };

  const presetAmounts = WALLET_PRESET_AMOUNTS;

  // ============================================================
  // Écran formulaire Stripe
  // ============================================================

  if (step === 'stripe_form') {
    const numericAmount = parseFloat(amount);
    return (
      <div className="min-h-screen bg-background font-sans text-slate-100 antialiased">
        <div className="max-w-[430px] mx-auto min-h-screen flex flex-col">
          <header className="sticky top-0 z-20 flex items-center p-4 bg-background/80 backdrop-blur-xl border-b border-white/5">
            <button
              onClick={() => { setStep('select'); setError(''); }}
              className="flex items-center justify-center size-10 rounded-full glass-card text-white active:scale-95 transition-transform"
            >
              <MaterialIcon name="arrow_back" size="md" />
            </button>
            <h1 className="flex-1 text-center text-lg font-bold text-white pr-10">Paiement par carte</h1>
          </header>

          <main className="flex-1 p-6">
            {error && (
              <div className="mb-4 p-3 bg-destructive/10 border border-destructive/30 rounded-xl flex items-start gap-2">
                <MaterialIcon name="error" size="md" className="text-destructive mt-0.5" />
                <span className="text-destructive text-sm">{error}</span>
              </div>
            )}
            <StripePaymentElement
              clientSecret={stripeClientSecret}
              amount={numericAmount}
              currency={stripeCurrency}
              onSuccess={handleStripeSuccess}
              onError={handleStripeError}
              submitLabel={`Recharger ${formatCurrencyWithCode(numericAmount)}`}
            />
          </main>
        </div>
      </div>
    );
  }

  // ============================================================
  // Écran principal (sélection montant)
  // ============================================================

  return (
    <div className="min-h-screen bg-background font-sans text-slate-100 antialiased">
      <div className="max-w-[430px] mx-auto min-h-screen flex flex-col">
        {/* Header */}
        <header className="sticky top-0 z-20 flex items-center p-4 bg-background/80 backdrop-blur-xl border-b border-white/5">
          <Link href="/wallet" className="flex items-center justify-center size-10 rounded-full glass-card text-white active:scale-95 transition-transform">
            <MaterialIcon name="arrow_back" size="md" />
          </Link>
          <h1 className="flex-1 text-center text-lg font-bold text-white pr-10">Recharger</h1>
        </header>

        <main className="flex-1 p-6 space-y-6">
          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-xl flex items-start gap-2">
              <MaterialIcon name="error" size="md" className="text-destructive mt-0.5" />
              <span className="text-destructive text-sm">{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Montant */}
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                Montant à recharger ({CURRENCY_CODE})
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <MaterialIcon name="payments" size="md" className="text-slate-500" />
                </div>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                  min={LIMITS.MIN_WALLET_RECHARGE}
                  className="glass-input w-full h-14 pl-12 pr-4 rounded-xl text-white text-lg font-bold placeholder:text-slate-500 focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all"
                  placeholder={String(LIMITS.MIN_WALLET_RECHARGE)}
                />
              </div>

              {/* Montants prédéfinis */}
              <div className="grid grid-cols-3 gap-2 mt-3">
                {presetAmounts.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setAmount(preset.toString())}
                    className={`py-3 rounded-xl text-sm font-bold transition-all active:scale-[0.98] ${
                      amount === preset.toString()
                        ? 'bg-primary text-white shadow-lg shadow-primary/20'
                        : 'glass-card text-slate-300 border border-white/10 hover:border-primary/50'
                    }`}
                  >
                    {preset.toLocaleString()}
                  </button>
                ))}
              </div>
            </div>

            {/* Méthode de paiement — uniquement carte bancaire (Canada) */}
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-3">
                Méthode de paiement
              </label>
              <div className="flex items-center gap-3 p-4 rounded-xl glass-card border-2 border-primary">
                <div className="bg-blue-600 text-white p-2 rounded-lg">
                  <MaterialIcon name="credit_card" size="md" />
                </div>
                <div className="flex-1">
                  <span className="text-white font-medium block">Carte bancaire</span>
                  <span className="text-slate-500 text-xs">Visa · Mastercard · Apple Pay · Google Pay</span>
                </div>
                <div className="flex items-center gap-1">
                  <MaterialIcon name="check_circle" size="md" className="text-primary" />
                  <MaterialIcon name="lock" size="sm" className="text-slate-500" />
                </div>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full h-14 bg-gradient-to-r from-primary to-[#ffae33] text-white font-bold rounded-2xl primary-glow active:scale-[0.98] transition-transform disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Traitement...
                </>
              ) : (
                <>
                  <MaterialIcon name="credit_card" size="md" />
                  Continuer vers le paiement
                </>
              )}
            </button>
          </form>

          {/* Info */}
          <div className="text-center text-xs text-slate-500 space-y-1">
            <p>Aucuns frais supplémentaires · Traitement sécurisé par Stripe</p>
            <p>Le solde est crédité via webhook Stripe après confirmation du paiement</p>
          </div>
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
