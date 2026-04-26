"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { getStripe } from '@/lib/stripe-client';
import { isNativeStripe } from '@/lib/stripe-adapters';
import { NativeStripeSetup } from '@/components/stripe/NativeStripeSetup';
import { auth, functions } from '@/config/firebase';
import { httpsCallable } from 'firebase/functions';
import { MaterialIcon } from '@/components/ui/MaterialIcon';

interface CreateSetupIntentResult {
  clientSecret: string;
  setupIntentId: string;
}

interface SetupFormProps {
  onSuccess: () => void;
  onError: (message: string) => void;
}

function SetupForm({ onSuccess, onError }: SetupFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setProcessing(true);
    setErrorMessage('');

    const { error } = await stripe.confirmSetup({
      elements,
      redirect: 'if_required',
      confirmParams: {
        return_url: typeof window !== 'undefined' ? window.location.href : undefined,
      },
    });

    if (error) {
      const msg = error.message ?? 'Erreur lors de la sauvegarde de la carte';
      setErrorMessage(msg);
      onError(msg);
      setProcessing(false);
      return;
    }

    setProcessing(false);
    onSuccess();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="rounded-xl overflow-hidden border border-white/10 bg-white/5 p-4">
        <PaymentElement
          options={{
            layout: 'tabs',
            wallets: { applePay: 'auto', googlePay: 'auto' },
          }}
        />
      </div>

      {errorMessage && (
        <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-xl flex items-start gap-2">
          <MaterialIcon name="error" size="md" className="text-destructive mt-0.5 flex-shrink-0" />
          <span className="text-destructive text-sm">{errorMessage}</span>
        </div>
      )}

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
            Vérification…
          </>
        ) : (
          <>
            <MaterialIcon name="credit_card" size="md" />
            Ajouter ma carte
          </>
        )}
      </button>

      <div className="flex items-center justify-center gap-1.5 text-xs text-slate-500">
        <MaterialIcon name="verified_user" size="sm" />
        <span>Paiement sécurisé par Stripe · PCI DSS Niveau 1</span>
      </div>
    </form>
  );
}

export default function SetupPaymentContent() {
  const router = useRouter();
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [setupIntentId, setSetupIntentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const redirectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const useNative = isNativeStripe();

  useEffect(() => {
    return () => {
      if (redirectTimeoutRef.current) {
        clearTimeout(redirectTimeoutRef.current);
      }
    };
  }, []);

  const fetchSetupIntent = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) {
      router.push('/login');
      return;
    }

    try {
      setLoading(true);

      const callable = httpsCallable<unknown, CreateSetupIntentResult>(
        functions,
        'createSetupIntent'
      );
      const result = await callable();
      const data = result.data;

      setClientSecret(data.clientSecret);
      setSetupIntentId(data.setupIntentId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur lors du chargement';
      console.error('[SetupPayment] Erreur:', msg);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchSetupIntent();
  }, [fetchSetupIntent]);

  const handleSetupSuccess = () => {
    if (redirectTimeoutRef.current) return;
    setSuccess(true);
    redirectTimeoutRef.current = setTimeout(() => {
      router.push('/dashboard');
    }, 1500);
  };

  const handleSetupError = (message: string) => {
    setError(message);
  };

  const handleSkip = () => {
    router.push('/dashboard');
  };

  const handleRetry = () => {
    setError(null);
    setClientSecret(null);
    setSetupIntentId(null);
    fetchSetupIntent();
  };

  const resolvedLocale = typeof navigator !== 'undefined' && navigator.language?.startsWith('en') ? 'en' : 'fr';

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

  const stripePromise = useMemo(() => getStripe(), []);

  if (success) {
    return (
      <div className="min-h-screen bg-background font-sans text-slate-100 antialiased">
        <div className="relative flex min-h-screen w-full flex-col max-w-[430px] mx-auto overflow-hidden items-center justify-center px-6">
          <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mb-6">
            <MaterialIcon name="check_circle" className="text-emerald-500 text-[40px]" />
          </div>
          <h1 className="text-white text-[28px] font-bold leading-tight mb-2 text-center">
            Carte ajoutée !
          </h1>
          <p className="text-slate-400 text-base text-center">
            Votre moyen de paiement a été enregistré avec succès.
          </p>
          <p className="text-slate-500 text-sm mt-4 animate-pulse">
            Redirection vers le tableau de bord…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background font-sans text-slate-100 antialiased">
      <div className="relative flex min-h-screen w-full flex-col max-w-[430px] mx-auto overflow-hidden">
        <div className="h-12 w-full" />

        <div className="px-6">
          <button
            onClick={handleSkip}
            className="inline-flex items-center text-slate-400 hover:text-primary transition-colors"
          >
            <MaterialIcon name="close" size="md" className="mr-2" />
            Passer cette étape
          </button>
        </div>

        <div className="flex flex-col items-center justify-center pt-8 pb-6">
          <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center">
            <MaterialIcon name="credit_card" className="text-primary text-[40px]" />
          </div>
        </div>

        <div className="px-6 text-center">
          <h1 className="text-white text-[28px] font-bold leading-tight mb-2">
            Ajoutez votre carte
          </h1>
          <p className="text-slate-400 text-base font-normal">
            Enregistrez une carte bancaire pour payer vos courses facilement et en toute sécurité.
          </p>
        </div>

        {error && !clientSecret && (
          <div className="mx-6 mt-6">
            <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-xl flex items-start gap-2">
              <MaterialIcon name="error" size="md" className="text-destructive mt-0.5 flex-shrink-0" />
              <span className="text-destructive text-sm">{error}</span>
            </div>
            <button
              onClick={handleRetry}
              className="mt-3 w-full h-12 flex items-center justify-center gap-2 rounded-xl border border-primary/30 text-primary font-medium active:scale-[0.98] transition-transform hover:bg-primary/5"
            >
              <MaterialIcon name="refresh" size="md" />
              Réessayer
            </button>
          </div>
        )}

        {loading && (
          <div className="flex-1 flex items-center justify-center px-6">
            <div className="text-center">
              <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-primary mx-auto mb-4" />
              <p className="text-slate-400 text-sm">Chargement du formulaire sécurisé…</p>
            </div>
          </div>
        )}

        {!loading && clientSecret && (
          <div className="mt-8 px-6">
            {useNative ? (
              <NativeStripeSetup
                clientSecret={clientSecret}
                onSuccess={handleSetupSuccess}
                onError={handleSetupError}
              />
            ) : (
              <Elements
                stripe={stripePromise}
                options={{
                  clientSecret,
                  appearance,
                  locale: resolvedLocale,
                }}
              >
                <SetupForm
                  onSuccess={handleSetupSuccess}
                  onError={handleSetupError}
                />
              </Elements>
            )}
          </div>
        )}

        {!loading && (
          <div className="px-6 mt-6">
            <button
              onClick={handleSkip}
              className="w-full h-14 flex items-center justify-center gap-2 rounded-2xl border border-white/10 text-slate-400 font-medium active:scale-[0.98] transition-transform hover:text-slate-300 hover:border-white/20"
            >
              <MaterialIcon name="schedule" size="md" />
              Plus tard
            </button>
          </div>
        )}

        <div className="px-6 mt-6 text-center text-xs text-slate-500 space-y-1">
          <p>Vous pourrez ajouter votre carte plus tard depuis votre profil.</p>
          <p>Aucun montant ne sera débité lors de cette étape.</p>
        </div>

        <div className="mt-auto pb-10 pt-8 text-center px-6">
          <p className="text-slate-500 text-xs">
            En ajoutant une carte, vous acceptez nos{' '}
            <a href="/legal/terms" className="text-primary hover:underline">Conditions d&apos;utilisation</a>
            {' '}&amp;{' '}
            <a href="/legal/privacy" className="text-primary hover:underline">Politique de confidentialité</a>
          </p>
        </div>
      </div>
    </div>
  );
}
