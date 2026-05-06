'use client';

import { useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuth } from '@/hooks/useAuth';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export default function RestaurantSuspendedPage() {
  const router = useRouter();
  const { currentUser, userData, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!currentUser || !userData) {
      router.replace('/login');
    }
  }, [currentUser, userData, loading, router]);

  const handleBackToClient = useCallback(async () => {
    if (currentUser) {
      try {
        await updateDoc(doc(db, 'users', currentUser.uid), {
          activeRole: 'client',
          updatedAt: serverTimestamp(),
        });
      } catch {
        // non-blocking
      }
    }
    router.replace('/dashboard');
  }, [currentUser, router]);

  if (loading || !currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-md text-center">
        <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
          <MaterialIcon name="block" size="xl" className="text-red-400" />
        </div>
        <h1 className="text-2xl font-bold mb-2 text-white">Restaurant suspendu</h1>
        <p className="text-slate-400 mb-6">
          Votre restaurant a été suspendu. Contactez le support pour plus d&apos;informations.
        </p>
        <p className="text-sm text-slate-500 mb-4">
          Email : <a href="mailto:support@medjira.com" className="text-primary hover:underline">support@medjira.com</a>
        </p>
        <button onClick={handleBackToClient} className="inline-block h-[48px] px-6 glass-card border border-white/10 text-slate-300 font-semibold rounded-xl leading-[48px] bg-transparent cursor-pointer">
          Retour à mon espace client
        </button>
      </div>
    </div>
  );
}
