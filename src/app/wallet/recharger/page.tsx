"use client";
import dynamic from 'next/dynamic';
import type React from 'react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { auth, db } from '@/config/firebase';
import { doc, runTransaction, collection } from 'firebase/firestore';
import { CURRENCY_CODE, LIMITS, WALLET_FEES, WALLET_PRESET_AMOUNTS, ACTIVE_MARKET } from '@/utils/constants';
import { formatCurrencyWithCode } from '@/utils/format';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { BottomNav } from '@/components/ui/BottomNav';
const StripePaymentElement = dynamic(() => import('@/components/stripe/StripePaymentElement'), { ssr: false, loading: () => <div className="w-full h-48 bg-gray-100 animate-pulse rounded-xl" /> })
import { STRIPE_CURRENCY_BY_MARKET } from '@/types/stripe';

type PaymentStep = 'select' | 'stripe_form' | 'success';
type PaymentMethod = 'om' | 'momo' | 'card';

export default function RechargerPage() {
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('om');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState<PaymentStep>('select');
  const [stripeClientSecret, setStripeClientSecret] = useState('');
  const router = useRouter();

  const stripeSupported = STRIPE_CURRENCY_BY_MARKET[ACTIVE_MARKET] !== null;
  const stripeCurrency = STRIPE_CURRENCY_BY_MARKET[ACTIVE_MARKET] ?? 'cad';

  // ============================================================
  // Soumission principale
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

      if (paymentMethod === 'card') {
        if (!stripeSupported) {
          throw new Error(
            `Le paiement par carte n'est pas disponible pour le marché ${ACTIVE_MARKET}. Utilisez Orange Money ou MTN Money.`
          );
        }
        // Créer le PaymentIntent via l'API
        const token = await user.getIdToken();
        const res = await fetch('/api/stripe/wallet/recharge', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ amount: numericAmount }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Erreur lors de la création du paiement');

        setStripeClientSecret(data.clientSecret);
        setStep('stripe_form');
      } else {
        // Mobile Money (Orange Money / MTN) — simulation (à remplacer par l'API réelle)
        await simulateMobileMoneyAPI(numericAmount, paymentMethod);
        await processWalletUpdate(user.uid, numericAmount, paymentMethod);
        router.push(`/wallet?success=${encodeURIComponent(formatCurrencyWithCode(numericAmount) + ' ajoutés avec succès!')}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue. Veuillez réessayer.');
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // Callback succès Stripe
  // ============================================================

  const handleStripeSuccess = async (paymentIntentId: string) => {
    const user = auth.currentUser;
    if (!user) return;

    try {
      // Note : la mise à jour du solde est gérée de manière fiable par le webhook Stripe
      // (payment_intent.succeeded → /api/webhooks/stripe).
      // Ici on redirige simplement avec un message de confirmation.
      router.push(`/wallet?success=${encodeURIComponent('Recharge en cours de traitement...')}`);
    } catch {
      setError('Paiement reçu mais erreur lors de la mise à jour. Contactez le support.');
    }
  };

  const handleStripeError = (message: string) => {
    setError(message);
    setStep('select');
  };

  // ============================================================
  // Mise à jour Firestore du portefeuille (Mobile Money)
  // ============================================================

  const processWalletUpdate = async (userId: string, rechargeAmount: number, method: string) => {
    const fees = Math.max(rechargeAmount * WALLET_FEES.RECHARGE_RATE, WALLET_FEES.MIN_FEE);
    const netAmount = rechargeAmount - fees;
    const walletRef = doc(db, 'wallets', userId);
    const transactionRef = doc(collection(db, 'transactions'));

    await runTransaction(db, async (transaction) => {
      const walletDoc = await transaction.get(walletRef);
      if (!walletDoc.exists()) {
        transaction.set(walletRef, { balance: netAmount, currency: CURRENCY_CODE, updatedAt: new Date() });
      } else {
        const currentBalance = walletDoc.data().balance || 0;
        transaction.update(walletRef, { balance: currentBalance + netAmount, updatedAt: new Date() });
      }
      transaction.set(transactionRef, {
        userId, amount: rechargeAmount, fees, netAmount,
        method: method === 'om' ? 'Orange Money' : 'MTN Mobile Money',
        type: 'deposit', status: 'completed', createdAt: new Date(),
      });
    });
  };

  // ============================================================
  // Simulation Mobile Money (à remplacer par l'intégration réelle)
  // ============================================================

  const simulateMobileMoneyAPI = async (_amount: number, _method: string) => {
    await new Promise(resolve => setTimeout(resolve, 1500));
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
  // Écran principal (sélection montant + méthode)
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

            {/* Méthode de paiement */}
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-3">
                Méthode de paiement
              </label>
              <div className="space-y-3">
                {/* Orange Money */}
                <label className={`flex items-center gap-3 p-4 rounded-xl cursor-pointer transition-all ${
                  paymentMethod === 'om' ? 'glass-card border-2 border-primary' : 'glass-card border border-white/10'
                }`}>
                  <input type="radio" name="paymentMethod" value="om" checked={paymentMethod === 'om'} onChange={() => setPaymentMethod('om')} className="hidden" />
                  <div className="bg-orange-500 text-white p-2 rounded-lg">
                    <MaterialIcon name="phone_android" size="md" />
                  </div>
                  <span className="text-white font-medium">Orange Money</span>
                  {paymentMethod === 'om' && <MaterialIcon name="check_circle" size="md" className="text-primary ml-auto" />}
                </label>

                {/* MTN Mobile Money */}
                <label className={`flex items-center gap-3 p-4 rounded-xl cursor-pointer transition-all ${
                  paymentMethod === 'momo' ? 'glass-card border-2 border-primary' : 'glass-card border border-white/10'
                }`}>
                  <input type="radio" name="paymentMethod" value="momo" checked={paymentMethod === 'momo'} onChange={() => setPaymentMethod('momo')} className="hidden" />
                  <div className="bg-yellow-400 text-black p-2 rounded-lg">
                    <MaterialIcon name="phone_android" size="md" />
                  </div>
                  <span className="text-white font-medium">MTN Mobile Money</span>
                  {paymentMethod === 'momo' && <MaterialIcon name="check_circle" size="md" className="text-primary ml-auto" />}
                </label>

                {/* Carte bancaire (Stripe) — affiché seulement si le marché supporte Stripe */}
                {stripeSupported && (
                  <label className={`flex items-center gap-3 p-4 rounded-xl cursor-pointer transition-all ${
                    paymentMethod === 'card' ? 'glass-card border-2 border-primary' : 'glass-card border border-white/10'
                  }`}>
                    <input type="radio" name="paymentMethod" value="card" checked={paymentMethod === 'card'} onChange={() => setPaymentMethod('card')} className="hidden" />
                    <div className="bg-blue-600 text-white p-2 rounded-lg">
                      <MaterialIcon name="credit_card" size="md" />
                    </div>
                    <div className="flex-1">
                      <span className="text-white font-medium block">Carte bancaire</span>
                      <span className="text-slate-500 text-xs">Visa · Mastercard · Apple Pay · Google Pay</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {paymentMethod === 'card' && <MaterialIcon name="check_circle" size="md" className="text-primary" />}
                      <MaterialIcon name="lock" size="sm" className="text-slate-500" />
                    </div>
                  </label>
                )}
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
                  <MaterialIcon name={paymentMethod === 'card' ? 'credit_card' : 'check'} size="md" />
                  {paymentMethod === 'card' ? 'Continuer vers le paiement' : 'Confirmer la recharge'}
                </>
              )}
            </button>
          </form>

          {/* Info frais */}
          <div className="text-center text-xs text-slate-500 space-y-1">
            {paymentMethod !== 'card' && (
              <p>Frais de recharge: {(WALLET_FEES.RECHARGE_RATE * 100).toFixed(0)}% (min. {WALLET_FEES.MIN_FEE} {CURRENCY_CODE})</p>
            )}
            {paymentMethod === 'card' && (
              <p>Aucuns frais supplémentaires · Traitement sécurisé par Stripe</p>
            )}
            <p>Le solde sera crédité instantanément après paiement</p>
          </div>
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
