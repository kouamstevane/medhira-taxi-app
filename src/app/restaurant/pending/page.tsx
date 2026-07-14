'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuth } from '@/hooks/useAuth';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import Link from 'next/link';

type RestaurantStatus = 'pending_approval' | 'approved' | 'rejected' | 'suspended';

function RestaurantPendingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const idFromParams = searchParams.get('id');
  const { currentUser, userData, loading: authLoading } = useAuth();
  const restaurantId = idFromParams || userData?.roles?.restaurant?.restaurantId;
  const [status, setStatus] = useState<RestaurantStatus | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!currentUser || !userData) {
      router.replace('/login');
      return;
    }
  }, [currentUser, userData, authLoading, router]);

  useEffect(() => {
    if (authLoading) return;
    if (!restaurantId) {
      setLoading(false);
      return;
    }
    const unsub = onSnapshot(doc(db, 'restaurants', restaurantId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setStatus(data.status as RestaurantStatus);
        if (data.status === 'rejected') {
          setRejectionReason(data.rejectionReason || 'Documents incomplets ou non conformes.');
        }
        if (data.status === 'approved') {
          router.replace('/restaurant/dashboard?welcome=1');
        }
        if (data.status === 'suspended') {
          router.replace('/restaurant/suspended');
        }
      } else {
        setLoading(false);
      }
      setLoading(false);
    });
    return () => unsub();
  }, [restaurantId, authLoading, router]);

  const handleBackToClient = useCallback(async () => {
    if (currentUser) {
      try {
        await updateDoc(doc(db, 'users', currentUser.uid), {
          activeRole: 'client',
          updatedAt: serverTimestamp(),
        });
      } catch {
        // non-blocking — redirect anyway
      }
    }
    router.replace('/dashboard');
  }, [currentUser, router]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-md text-center">
        {status === 'rejected' ? (
          <>
            <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
              <MaterialIcon name="close" size="xl" className="text-red-400" />
            </div>
            <h1 className="text-2xl font-bold mb-2 text-white">Dossier non approuvé</h1>
            <p className="text-slate-400 mb-4">Votre restaurant n&apos;a pas été approuvé.</p>
            {rejectionReason && (
              <div className="p-4 glass-card border border-red-500/20 rounded-xl text-red-400 text-sm mb-6">
                <strong>Motif :</strong> {rejectionReason}
              </div>
            )}
            <Link href={`/restaurant/register?from=become-pro&resubmit=${restaurantId}`} className="inline-block h-[48px] px-6 glass-card border-2 border-primary/60 text-primary font-bold rounded-xl leading-[48px]">
              Modifier et resoumettre
            </Link>
          </>
        ) : (
          <>
            <div className="w-20 h-20 rounded-full bg-orange-500/10 flex items-center justify-center mx-auto mb-4 animate-pulse">
              <MaterialIcon name="schedule" size="xl" className="text-orange-400" />
            </div>
            <h1 className="text-2xl font-bold mb-2 text-white">Dossier en cours de validation</h1>
            <p className="text-slate-400 mb-6">
              Votre dossier est en cours d&apos;examen par notre équipe. Vous recevrez un email dès qu&apos;il sera approuvé.
            </p>
          </>
        )}

        <button onClick={handleBackToClient} className="text-primary font-medium hover:underline text-sm bg-transparent border-none cursor-pointer">
          Retour à mon espace client
        </button>
      </div>
    </div>
  );
}

export default function RestaurantPendingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><LoadingSpinner /></div>}>
      <RestaurantPendingContent />
    </Suspense>
  );
}
