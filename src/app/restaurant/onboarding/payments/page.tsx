'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { httpsCallable } from 'firebase/functions';
import { doc, getDoc } from 'firebase/firestore';
import { db, functions } from '@/config/firebase';
import { useAuth } from '@/hooks/useAuth';
import { mapHttpsError } from '@/services/cloud-functions.helpers';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import toast from 'react-hot-toast';

type CallResult = { onboardingUrl: string; mode: string };

function PaymentsOnboardingContent() {
  const router = useRouter();
  const params = useSearchParams();
  const requestedMode = params.get('mode') === 'update' ? 'update' : 'onboarding';
  const { currentUser, userData, loading: authLoading } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [restaurantApproved, setRestaurantApproved] = useState<boolean | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!currentUser) {
      router.replace('/login');
      return;
    }
    const restaurantId = userData?.roles?.restaurant?.restaurantId;
    if (!restaurantId) {
      router.replace('/dashboard');
      return;
    }
    getDoc(doc(db, 'restaurants', restaurantId)).then((snap) => {
      const s = snap.data()?.status;
      setRestaurantApproved(s === 'approved');
      if (s !== 'approved') router.replace('/restaurant/pending');
    });
  }, [authLoading, currentUser, userData, router]);

  async function handleClick() {
    const restaurantId = userData?.roles?.restaurant?.restaurantId;
    if (!restaurantId) return;
    setSubmitting(true);
    try {
      const call = httpsCallable<unknown, CallResult>(functions, 'createStripeConnectAccount');
      const res = await call({ restaurantId, mode: requestedMode });
      window.location.href = res.data.onboardingUrl;
    } catch (err) {
      const mapped = mapHttpsError(err);
      toast.error(mapped.message);
      setSubmitting(false);
    }
  }

  if (authLoading || restaurantApproved !== true) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const title = requestedMode === 'update' ? 'Réparer votre compte Stripe' : 'Configurez vos paiements';
  const description = requestedMode === 'update'
    ? 'Stripe demande des informations supplémentaires pour réactiver votre compte.'
    : 'Stripe traite les paiements de vos clients. La configuration prend 2 minutes.';

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md glass-card p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-3 rounded-xl">
            <MaterialIcon name="payments" className="text-primary text-2xl" />
          </div>
          <h1 className="text-2xl font-bold text-white">{title}</h1>
        </div>
        <p className="text-slate-300 text-sm">{description}</p>
        <button
          type="button"
          onClick={handleClick}
          disabled={submitting}
          className="w-full h-14 bg-gradient-to-r from-primary to-[#ffae33] text-white font-bold rounded-2xl active:scale-[0.98] transition-transform disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {submitting ? (
            <>
              <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
              Redirection...
            </>
          ) : (
            'Continuer vers Stripe'
          )}
        </button>
      </div>
    </div>
  );
}

export default function RestaurantPaymentsOnboardingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    }>
      <PaymentsOnboardingContent />
    </Suspense>
  );
}
