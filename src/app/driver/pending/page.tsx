'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { AuthService } from '@/services';
import { MaterialIcon } from '@/components/ui/MaterialIcon';

export default function DriverPendingPage() {
  const router = useRouter();
  const { currentUser, loading: authLoading, authStatus } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    if (authLoading || authStatus === 'loading') return;
    if (!currentUser || authStatus === 'unauthenticated') {
      router.replace('/login');
    }
  }, [authLoading, authStatus, currentUser, router]);

  const handleReturnHome = async () => {
    setIsSigningOut(true);
    try {
      await AuthService.signOut();
      router.replace('/?from=driver-pending');
    } catch {
      setIsSigningOut(false);
    }
  };

  if (authLoading || authStatus === 'loading' || !currentUser) {
    return <div className="min-h-screen bg-[#0a0a0a]" />;
  }

  return (
    <main className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center px-4 py-8 text-center">
      <div className="w-full max-w-md">
        <div className="w-20 h-20 rounded-full bg-orange-500/10 flex items-center justify-center mx-auto mb-4 animate-pulse">
          <MaterialIcon name="schedule" size="xl" className="text-orange-400" />
        </div>
        <h1 className="text-2xl font-bold mb-2 text-white">Dossier en cours de validation</h1>
        <p className="text-slate-400 mb-6">
          Votre dossier est en cours d&apos;examen par notre équipe. Vous recevrez un email dès qu&apos;il sera approuvé.
        </p>
        <button
          type="button"
          onClick={handleReturnHome}
          disabled={isSigningOut}
          className="inline-flex h-[48px] items-center justify-center px-6 mt-2 glass-card border border-white/10 text-slate-300 font-semibold rounded-xl hover:bg-white/5 disabled:opacity-60"
        >
          {isSigningOut ? 'Déconnexion…' : "Retour à l'accueil"}
        </button>
      </div>
    </main>
  );
}
