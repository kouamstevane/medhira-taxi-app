"use client";

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { app, auth } from '@/config/firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { Loader2, CheckCircle2, AlertTriangle, XCircle, RefreshCw, ArrowRight, Shield } from 'lucide-react';
import { ACTIVE_MARKET } from '@/utils/constants';

type AccountStatus = 'not_created' | 'pending' | 'active' | 'restricted' | 'disabled';

interface StatusResult {
  accountId: string | null;
  status: AccountStatus;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  disabledReason: string | null;
  requirements: {
    currently_due: string[];
    past_due: string[];
    eventually_due: string[];
    pending_verification: string[];
    current_deadline: number | null;
  };
}

const FUNCTIONS_REGION = process.env.NEXT_PUBLIC_FIREBASE_FUNCTIONS_REGION || 'europe-west1';

// Libellés FR pour les requirements Stripe (extensible — fallback = clé brute).
const REQUIREMENT_LABELS: Record<string, string> = {
  'individual.id_number': 'Numéro d\'identification (NAS / SIN)',
  'individual.verification.document': 'Pièce d\'identité (recto/verso)',
  'individual.verification.additional_document': 'Document complémentaire',
  'individual.address.line1': 'Adresse',
  'individual.address.city': 'Ville',
  'individual.address.postal_code': 'Code postal',
  'individual.address.state': 'Province / État',
  'individual.dob.day': 'Date de naissance',
  'individual.first_name': 'Prénom',
  'individual.last_name': 'Nom',
  'individual.phone': 'Téléphone',
  'individual.email': 'Email',
  'external_account': 'Coordonnées bancaires (RIB)',
  'tos_acceptance.date': 'Acceptation des conditions Stripe',
  'tos_acceptance.ip': 'Acceptation des conditions Stripe',
  'business_profile.url': 'URL du profil',
  'business_profile.mcc': 'Catégorie d\'activité',
};

function humanizeRequirement(key: string): string {
  return REQUIREMENT_LABELS[key] || key.replace(/[._]/g, ' ');
}

export default function PaymentSetupPage() {
  const router = useRouter();
  const params = useSearchParams();
  const onboardingState = params.get('onboarding'); // 'success' | 'refresh' | null

  const [statusData, setStatusData] = useState<StatusResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const browserListenerRef = useRef<{ remove: () => void } | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      browserListenerRef.current?.remove();
    };
  }, []);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const user = auth.currentUser;
      if (!user) {
        router.push('/driver/login');
        return;
      }
      await user.getIdToken(true);
      const fn = getFunctions(app, FUNCTIONS_REGION);
      const call = httpsCallable<unknown, StatusResult>(fn, 'getStripeAccountStatus');
      const res = await call({});
      if (!mountedRef.current) return;
      setStatusData(res.data);
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      console.error('[PaymentSetup] fetch failed', err);
      if (mountedRef.current) {
        setError(err.message || 'Impossible de récupérer le statut Stripe.');
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Auto-redirect vers dashboard si tout est OK + bandeau succès affiché 3s.
  useEffect(() => {
    if (statusData?.status === 'active') {
      const t = setTimeout(() => {
        if (mountedRef.current) router.push('/driver/dashboard');
      }, 3000);
      return () => clearTimeout(t);
    }
  }, [statusData?.status, router]);

  const handleResume = useCallback(async () => {
    setRetrying(true);
    setError(null);
    try {
      const user = auth.currentUser;
      if (!user) {
        router.push('/driver/login');
        return;
      }
      await user.getIdToken(true);
      const fn = getFunctions(app, FUNCTIONS_REGION);

      // Si pas de compte, on en crée un (ré-entrant côté serveur grâce à idempotencyKey).
      if (!statusData?.accountId) {
        const create = httpsCallable<{ country: string }, { accountId: string }>(fn, 'createConnectAccount');
        await create({ country: ACTIVE_MARKET });
      }

      const origin = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
      const linkFn = httpsCallable<{ returnUrl: string; refreshUrl: string }, { url: string }>(fn, 'createConnectOnboardLink');
      const linkRes = await linkFn({
        returnUrl: `${origin}/driver/payments/setup?onboarding=success`,
        refreshUrl: `${origin}/driver/payments/setup?onboarding=refresh`,
      });
      const url = linkRes.data?.url;
      if (!url) throw new Error('URL d\'onboarding manquante.');

      if (Capacitor.isNativePlatform()) {
        browserListenerRef.current?.remove();
        const listener = await Browser.addListener('browserFinished', () => {
          browserListenerRef.current?.remove();
          browserListenerRef.current = null;
          if (mountedRef.current) fetchStatus();
        });
        browserListenerRef.current = listener;
        await Browser.open({ url, presentationStyle: 'popover' });
      } else {
        window.location.href = url;
      }
    } catch (e: unknown) {
      const err = e as { message?: string };
      console.error('[PaymentSetup] resume failed', err);
      if (mountedRef.current) setError(err.message || 'Impossible de relancer la configuration.');
    } finally {
      if (mountedRef.current) setRetrying(false);
    }
  }, [statusData?.accountId, fetchStatus, router]);

  // États UI ----------------------------------------------------------------

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] text-white flex flex-col items-center justify-center px-6">
        <Loader2 className="w-10 h-10 animate-spin text-[#635bff]" />
        <p className="mt-4 text-[#9CA3AF]">Vérification de votre compte Stripe…</p>
      </div>
    );
  }

  if (error && !statusData) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] text-white flex flex-col items-center justify-center px-6">
        <XCircle className="w-12 h-12 text-red-500" />
        <h1 className="text-xl font-bold mt-4">Erreur</h1>
        <p className="mt-2 text-[#9CA3AF] text-center">{error}</p>
        <button
          onClick={fetchStatus}
          className="mt-6 bg-[#635bff] text-white font-bold py-3 px-6 rounded-xl flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" /> Réessayer
        </button>
      </div>
    );
  }

  const status = statusData!.status;
  const reqs = statusData!.requirements;
  const allDue = Array.from(new Set([...reqs.past_due, ...reqs.currently_due]));
  const pendingVerif = reqs.pending_verification;

  // ✅ Active
  if (status === 'active') {
    return (
      <div className="min-h-screen bg-[#0A0A0A] text-white flex flex-col items-center justify-center px-6">
        <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
          <CheckCircle2 className="w-10 h-10 text-green-400" />
        </div>
        <h1 className="text-2xl font-bold mt-6 text-center">Configuration terminée !</h1>
        <p className="mt-2 text-[#9CA3AF] text-center max-w-sm">
          Votre compte Stripe est actif. Vous pouvez recevoir des paiements et virements.
        </p>
        <button
          onClick={() => router.push('/driver/dashboard')}
          className="mt-8 bg-green-600 text-white font-bold py-4 px-8 rounded-[28px] flex items-center gap-2 shadow-lg shadow-green-600/30"
        >
          Continuer vers le tableau de bord <ArrowRight className="w-5 h-5" />
        </button>
        <p className="mt-4 text-xs text-[#4B5563]">Redirection automatique dans 3s…</p>
      </div>
    );
  }

  // ❌ Disabled / Restricted
  if (status === 'disabled' || (status === 'restricted' && !allDue.length)) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] text-white flex flex-col items-center justify-center px-6">
        <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
          <XCircle className="w-10 h-10 text-red-400" />
        </div>
        <h1 className="text-2xl font-bold mt-6 text-center">Compte désactivé</h1>
        <p className="mt-2 text-[#9CA3AF] text-center max-w-sm">
          Votre compte Stripe est actuellement désactivé{statusData!.disabledReason ? ` (${statusData!.disabledReason})` : ''}.
          Contactez le support pour débloquer la situation.
        </p>
        <button
          onClick={() => router.push('/driver/dashboard')}
          className="mt-8 bg-[#1A1A1A] border border-white/10 text-white font-bold py-3 px-6 rounded-xl"
        >
          Retour au tableau de bord
        </button>
      </div>
    );
  }

  // ⚠️ Pending / Restricted avec items à compléter / Not created
  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white px-6 py-8 pb-24">
      <div className="max-w-md mx-auto">
        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center">
            <AlertTriangle className="w-10 h-10 text-amber-400" />
          </div>
          <h1 className="text-2xl font-bold mt-6">Configuration des paiements à terminer</h1>
          <p className="mt-3 text-[#9CA3AF]">
            {status === 'not_created'
              ? "Vous n'avez pas encore configuré votre compte Stripe pour recevoir vos virements."
              : 'Stripe a besoin d\'informations supplémentaires avant de pouvoir vous payer.'}
          </p>
        </div>

        {onboardingState === 'success' && (
          <div className="mt-6 bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 text-sm text-blue-300">
            Vous êtes revenu de Stripe — la configuration n'est pas encore complète. Voici ce qu'il manque :
          </div>
        )}

        {allDue.length > 0 && (
          <div className="mt-6 bg-[#1A1A1A] border border-white/[0.06] rounded-xl p-5">
            <p className="text-sm font-semibold text-white mb-3">Informations manquantes</p>
            <ul className="space-y-2">
              {allDue.map((key) => (
                <li key={key} className="flex items-start gap-2 text-sm text-[#D1D5DB]">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                  <span>{humanizeRequirement(key)}</span>
                </li>
              ))}
            </ul>
            {reqs.current_deadline && (
              <p className="mt-3 text-xs text-amber-300">
                À fournir avant le {new Date(reqs.current_deadline * 1000).toLocaleDateString('fr-FR')}
              </p>
            )}
          </div>
        )}

        {pendingVerif.length > 0 && (
          <div className="mt-4 bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 text-sm text-blue-300">
            <span className="font-semibold">Vérification en cours</span> chez Stripe — généralement quelques minutes.
          </div>
        )}

        {error && (
          <div className="mt-4 bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        <button
          onClick={handleResume}
          disabled={retrying}
          className="mt-8 w-full bg-[#635bff] text-white font-bold py-4 rounded-[28px] flex items-center justify-center gap-2 shadow-lg shadow-[#635bff]/30 disabled:opacity-50"
        >
          {retrying ? <Loader2 className="w-5 h-5 animate-spin" /> : <Shield className="w-5 h-5" />}
          {retrying ? 'Ouverture de Stripe…' : 'Reprendre la configuration Stripe'}
        </button>

        <button
          onClick={fetchStatus}
          disabled={loading || retrying}
          className="mt-3 w-full bg-[#1A1A1A] border border-white/10 text-white font-medium py-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <RefreshCw className="w-4 h-4" /> Actualiser le statut
        </button>

        <button
          onClick={() => router.push('/driver/dashboard')}
          className="mt-3 w-full text-[#9CA3AF] text-sm py-2"
        >
          Plus tard — aller au tableau de bord
        </button>

        <p className="mt-6 text-xs text-[#4B5563] text-center">
          Tant que la configuration n'est pas complète, vous ne pourrez pas recevoir de virements.
        </p>
      </div>
    </div>
  );
}
