"use client";

/**
 * Composant Stripe Payment Element — Réutilisable
 *
 * Affiche le formulaire de paiement Stripe sécurisé (Payment Element)
 * dans un style cohérent avec le design glass/dark de l'application.
 *
 * Utilisation :
 * ```tsx
 * <StripePaymentElement
 *   clientSecret="pi_xxx_secret_yyy"
 *   amount={15.50}
 *   currency="CAD"
 *   onSuccess={(paymentIntentId) => console.log('Payé :', paymentIntentId)}
 *   onError={(msg) => console.error(msg)}
 * />
 * ```
 *
 * @module components/stripe/StripePaymentElement
 */

import React, { useState } from 'react';
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { getStripe } from '@/lib/stripe-client';
import { MaterialIcon } from '@/components/ui/MaterialIcon';

// ============================================================================
// Sous-composant interne du formulaire (doit être enfant de <Elements>)
// ============================================================================

interface PaymentFormProps {
  amount: number;
  currency: string;
  onSuccess: (paymentIntentId: string) => void;
  onError: (message: string) => void;
  submitLabel?: string;
}

function PaymentForm({
  amount,
  currency,
  onSuccess,
  onError,
  submitLabel = 'Confirmer le paiement',
}: PaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setProcessing(true);
    setErrorMessage('');

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
      confirmParams: {
      },
    });

    if (error) {
      const msg = error.message ?? 'Erreur de paiement';
      setProcessing(false);
      setErrorMessage(msg);
      onError(msg);
      return;
    }

    if (!paymentIntent) {
      setProcessing(false);
      return;
    }

    switch (paymentIntent.status) {
      case 'succeeded':
      case 'requires_capture':
        setProcessing(false);
        onSuccess(paymentIntent.id);
        break;
      case 'requires_action': {
        if (!paymentIntent.client_secret) {
          setProcessing(false);
          setErrorMessage('Erreur interne: client_secret manquant');
          onError('Erreur interne: client_secret manquant');
          return;
        }

        const { error: actionError, paymentIntent: updatedPi } =
          await stripe.handleNextAction({
            clientSecret: paymentIntent.client_secret,
          });

        setProcessing(false);

        if (actionError) {
          const actionMsg = actionError.message ?? 'Authentification échouée';
          setErrorMessage(actionMsg);
          onError(actionMsg);
        } else if (updatedPi) {
          if (updatedPi.status === 'succeeded' || updatedPi.status === 'requires_capture') {
            onSuccess(updatedPi.id);
          } else {
            setErrorMessage('Paiement non abouti après authentification');
            onError('Paiement non abouti après authentification');
          }
        }
        break;
      }
      case 'processing':
        setProcessing(false);
        setErrorMessage('Paiement en cours de traitement');
        onError('Paiement en cours de traitement');
        break;
      default:
        setProcessing(false);
        setErrorMessage('Paiement non abouti');
        onError('Paiement non abouti');
    }
  };

  const formattedAmount = new Intl.NumberFormat('fr-CA', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount);

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Récapitulatif du montant */}
      <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10">
        <span className="text-slate-400 text-sm">Montant à payer</span>
        <span className="text-white font-bold text-lg">{formattedAmount}</span>
      </div>

      {/* Payment Element Stripe (thème night) */}
      <div className="rounded-xl overflow-hidden border border-white/10 bg-white/5 p-4">
        <PaymentElement
          options={{
            layout: 'tabs',
            wallets: { applePay: 'auto', googlePay: 'auto' },
          }}
        />
      </div>

      {/* Message d'erreur */}
      {errorMessage && (
        <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-xl flex items-start gap-2">
          <MaterialIcon name="error" size="md" className="text-destructive mt-0.5 flex-shrink-0" />
          <span className="text-destructive text-sm">{errorMessage}</span>
        </div>
      )}

      {/* Bouton de confirmation */}
      <button
        type="submit"
        disabled={!stripe || processing}
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

      {/* Badge sécurité */}
      <div className="flex items-center justify-center gap-1.5 text-xs text-slate-500">
        <MaterialIcon name="verified_user" size="sm" />
        <span>Paiement sécurisé par Stripe · PCI DSS Niveau 1</span>
      </div>
    </form>
  );
}

// ============================================================================
// Composant exporté — inclut le Provider Elements
// ============================================================================

interface StripePaymentElementProps {
  /** Client secret du PaymentIntent (obtenu via votre API route) */
  clientSecret: string;
  /** Montant affiché à l'utilisateur */
  amount: number;
  /** Code ISO de la devise (ex: 'CAD', 'EUR') */
  currency: string;
  /** Callback appelé si le paiement réussit */
  onSuccess: (paymentIntentId: string) => void;
  /** Callback appelé si une erreur survient */
  onError: (message: string) => void;
  /** Texte du bouton de confirmation */
  submitLabel?: string;
}

export function StripePaymentElement({
  clientSecret,
  amount,
  currency,
  onSuccess,
  onError,
  submitLabel,
}: StripePaymentElementProps) {
  const appearance = {
    theme: 'night' as const,
    variables: {
      colorPrimary: '#f29200',
      colorBackground: '#1a1a2e',
      colorText: '#f1f5f9',
      colorDanger: '#ef4444',
      fontFamily: 'Inter, system-ui, sans-serif',
      spacingUnit: '4px',
      borderRadius: '12px',
    },
    rules: {
      '.Input': {
        backgroundColor: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.1)',
        color: '#f1f5f9',
      },
      '.Input:focus': {
        border: '1px solid #f29200',
        boxShadow: '0 0 0 1px #f29200',
      },
      '.Label': {
        color: '#94a3b8',
      },
    },
  };

  return (
    <Elements
      stripe={getStripe()}
      options={{
        clientSecret,
        appearance,
        locale: 'fr',
      }}
    >
      <PaymentForm
        amount={amount}
        currency={currency}
        onSuccess={onSuccess}
        onError={onError}
        submitLabel={submitLabel}
      />
    </Elements>
  );
}
