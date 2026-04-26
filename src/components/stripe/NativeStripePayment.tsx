"use client";

import { useState, useEffect } from 'react';
import { getStripeAdapter, type PaymentResult } from '@/lib/stripe-adapters';
import { MaterialIcon } from '@/components/ui/MaterialIcon';

interface NativeStripePaymentProps {
  clientSecret: string;
  amount: number;
  currency: string;
  onSuccess: (paymentIntentId: string) => void;
  onError: (message: string) => void;
  submitLabel?: string;
}

export function NativeStripePayment({
  clientSecret,
  amount,
  currency,
  onSuccess,
  onError,
  submitLabel = 'Confirmer le paiement',
}: NativeStripePaymentProps) {
  const [processing, setProcessing] = useState(false);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const adapter = getStripeAdapter();
    if (!adapter.isReady()) {
      adapter.init()
        .then(() => setInitialized(true))
        .catch((err: unknown) => {
          console.error('[NativeStripePayment] Init failed:', err);
          onError(err instanceof Error ? err.message : 'Erreur d\'initialisation Stripe');
        });
    } else {
      setInitialized(true);
    }
  }, [onError]);

  const handlePay = async () => {
    setProcessing(true);
    try {
      const adapter = getStripeAdapter();
      const result: PaymentResult = await adapter.pay({
        clientSecret,
        amount,
        currency,
      });

      if (result.status === 'succeeded' || result.status === 'requires_capture') {
        onSuccess(result.paymentIntentId);
      } else {
        onError('Paiement annulé');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur de paiement';
      onError(msg);
    } finally {
      setProcessing(false);
    }
  };

  const formattedAmount = new Intl.NumberFormat('fr-CA', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10">
        <span className="text-slate-400 text-sm">Montant à payer</span>
        <span className="text-white font-bold text-lg">{formattedAmount}</span>
      </div>

      <div className="rounded-xl overflow-hidden border border-white/10 bg-white/5 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <MaterialIcon name="lock" size="md" className="text-primary" />
          </div>
          <div>
            <p className="text-white font-medium text-sm">Paiement sécurisé</p>
            <p className="text-slate-500 text-xs">Stripe PaymentSheet · 3D Secure inclus</p>
          </div>
        </div>
        <p className="text-slate-400 text-sm text-center">
          Appuyez sur le bouton ci-dessous pour ouvrir le formulaire de paiement sécurisé.
        </p>
      </div>

      <button
        type="button"
        onClick={handlePay}
        disabled={!initialized || processing}
        className="w-full h-14 bg-gradient-to-r from-primary to-[#ffae33] text-white font-bold rounded-2xl primary-glow active:scale-[0.98] transition-transform disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {processing ? (
          <>
            <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Traitement…
          </>
        ) : (
          <>
            <MaterialIcon name="lock" size="md" />
            {submitLabel}
          </>
        )}
      </button>

      <div className="flex items-center justify-center gap-1.5 text-xs text-slate-500">
        <MaterialIcon name="verified_user" size="sm" />
        <span>Paiement sécurisé par Stripe · PCI DSS Niveau 1</span>
      </div>
    </div>
  );
}
