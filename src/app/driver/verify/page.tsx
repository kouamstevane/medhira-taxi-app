"use client";
import { useEffect, useState, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { auth } from '@/config/firebase';
import { functions } from '@/config/firebase';
import { httpsCallable } from 'firebase/functions';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';

function DriverVerifyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const onboardingStatus = searchParams.get('onboarding');

  const [regenerating, setRegenerating] = useState(false);
  const [regenerateError, setRegenerateError] = useState('');
  const browserListenerRef = useRef<{ remove: () => void } | null>(null);

  useEffect(() => {
    return () => { browserListenerRef.current?.remove(); };
  }, []);

  // Cas standard : pas de paramètre onboarding → ancienne page de vérification
  const isStandardVerify = !onboardingStatus;

  // Cas "refresh" : le lien Stripe a expiré → régénérer un nouveau lien
  useEffect(() => {
    if (onboardingStatus === 'refresh') {
      handleRegenerateOnboardingLink();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onboardingStatus]);

  // Cas "success" : onboarding terminé → rediriger vers le dashboard après 3 secondes
  useEffect(() => {
    if (onboardingStatus === 'success') {
      const timer = setTimeout(() => {
        router.push('/driver/dashboard');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [onboardingStatus, router]);

  // Cas standard : rediriger vers login après 5 secondes
  useEffect(() => {
    if (isStandardVerify) {
      const timer = setTimeout(() => {
        router.push('/driver/login');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [isStandardVerify, router]);

  const handleRegenerateOnboardingLink = async () => {
    setRegenerating(true);
    setRegenerateError('');
    try {
      const user = auth.currentUser;
      if (!user) {
        router.push('/driver/login');
        return;
      }
      const createLinkFn = httpsCallable<{ returnUrl: string; refreshUrl: string }, { url: string }>(functions, 'createConnectOnboardLink');
      const result = await createLinkFn({
        returnUrl: `${process.env.NEXT_PUBLIC_APP_URL || window.location.origin}/driver/verify?onboarding=success`,
        refreshUrl: `${process.env.NEXT_PUBLIC_APP_URL || window.location.origin}/driver/verify?onboarding=refresh`,
      });

      const { url } = result.data;
      if (Capacitor.isNativePlatform()) {
        browserListenerRef.current?.remove();
        await Browser.open({ url });
        const listener = await Browser.addListener('browserFinished', () => {
          browserListenerRef.current = null;
          router.push('/driver/dashboard?stripe=pending');
        });
        browserListenerRef.current = listener;
      } else {
        window.location.href = url;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur lors de la régénération du lien';
      setRegenerateError(msg);
      setRegenerating(false);
    }
  };

  // === Rendu : Onboarding Stripe terminé ===
  if (onboardingStatus === 'success') {
    return (
      <div className="min-h-screen bg-background font-sans text-slate-100 antialiased">
        <div className="relative flex min-h-screen w-full flex-col items-center justify-center max-w-[430px] mx-auto overflow-hidden px-6">
          <div className="glass-card rounded-2xl p-8 text-center w-full">
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 bg-[#635bff]/10 border border-[#635bff]/30 rounded-full flex items-center justify-center">
                <MaterialIcon name="verified" className="text-[#635bff] text-[32px]" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Onboarding Stripe terminé</h2>
            <p className="text-slate-400 mb-6">
              Vos informations bancaires ont été soumises à Stripe pour vérification KYC.
              Vous recevrez une confirmation sous 1-2 jours ouvrés.
            </p>
            <div className="bg-white/5 rounded-xl p-4 mb-6 text-left space-y-2">
              <div className="flex items-center gap-2 text-sm text-slate-300">
                <MaterialIcon name="check" size="sm" className="text-green-400" />
                <span>Compte Stripe Connect créé</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-300">
                <MaterialIcon name="hourglass_empty" size="sm" className="text-yellow-400" />
                <span>Vérification KYC en cours</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-300">
                <MaterialIcon name="payments" size="sm" className="text-slate-400" />
                <span>Virements actifs après validation</span>
              </div>
            </div>
            <div className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <p className="text-sm text-slate-500">Redirection vers le tableau de bord...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // === Rendu : Lien expiré → régénération en cours ===
  if (onboardingStatus === 'refresh') {
    return (
      <div className="min-h-screen bg-background font-sans text-slate-100 antialiased">
        <div className="relative flex min-h-screen w-full flex-col items-center justify-center max-w-[430px] mx-auto overflow-hidden px-6">
          <div className="glass-card rounded-2xl p-8 text-center w-full">
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 bg-orange-500/10 border border-orange-500/20 rounded-full flex items-center justify-center">
                <MaterialIcon name="refresh" className="text-orange-400 text-[32px]" />
              </div>
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Lien expiré</h2>
            <p className="text-slate-400 mb-6">
              Le lien d&apos;onboarding Stripe a expiré. Génération d&apos;un nouveau lien...
            </p>

            {regenerateError ? (
              <div className="space-y-4">
                <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-xl text-destructive text-sm">
                  {regenerateError}
                </div>
                <button
                  onClick={handleRegenerateOnboardingLink}
                  disabled={regenerating}
                  className="w-full h-12 bg-primary text-white font-bold rounded-xl disabled:opacity-50"
                >
                  {regenerating ? 'Génération...' : 'Réessayer'}
                </button>
                <button
                  onClick={() => router.push('/driver/dashboard')}
                  className="w-full text-sm text-slate-400 underline"
                >
                  Aller au tableau de bord (compléter plus tard)
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <p className="text-sm text-slate-500">Génération du nouveau lien Stripe...</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // === Rendu par défaut : candidature soumise (ancienne page) ===
  return (
    <div className="min-h-screen bg-background font-sans text-slate-100 antialiased">
      <div className="relative flex min-h-screen w-full flex-col items-center justify-center max-w-[430px] mx-auto overflow-hidden px-6">
        <div className="glass-card rounded-2xl p-8 text-center w-full">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-green-500/10 border border-green-500/20 rounded-full flex items-center justify-center">
              <MaterialIcon name="check_circle" className="text-green-400 text-[32px]" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Candidature soumise avec succès</h2>
          <p className="text-slate-400 mb-6">
            Votre demande d&apos;inscription a été reçue. Notre équipe va vérifier vos documents et vous contactera sous 48h.
          </p>
          <div className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <p className="text-sm text-slate-500">
              Redirection vers la page de connexion...
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DriverVerify() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center">
        <svg className="animate-spin h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      </div>
    }>
      <DriverVerifyContent />
    </Suspense>
  );
}
