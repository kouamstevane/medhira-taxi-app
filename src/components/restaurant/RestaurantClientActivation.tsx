'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, auth, functions } from '@/config/firebase';
import { MaterialIcon } from '@/components/ui/MaterialIcon';

interface RestaurantClientActivationProps {
  hasClientRole?: boolean;
  className?: string;
}

export function RestaurantClientActivation({
  hasClientRole = false,
  className = '',
}: RestaurantClientActivationProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleActivateOrSwitch = async () => {
    setLoading(true);
    setError(null);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Utilisateur non connecté.');

      if (hasClientRole) {
        // Rôle client déjà activé, simple bascule
        await updateDoc(doc(db, 'users', user.uid), {
          activeRole: 'client',
          lastActiveRole: 'client',
          updatedAt: serverTimestamp(),
        });
      } else {
        // Activation du rôle client via Cloud Function
        const activateFn = httpsCallable(functions, 'activateClientRole');
        await activateFn();
        await updateDoc(doc(db, 'users', user.uid), {
          activeRole: 'client',
          lastActiveRole: 'client',
          updatedAt: serverTimestamp(),
        });
      }
      router.push('/dashboard');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l’activation de l’espace client.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`flex flex-col items-center justify-center gap-2 ${className}`}>
      {error && (
        <p className="text-xs text-red-400 bg-red-500/10 px-3 py-1 rounded-md text-center">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={handleActivateOrSwitch}
        disabled={loading}
        className="min-h-[44px] min-w-[44px] px-4 py-2 bg-white/10 hover:bg-white/20 active:scale-95 text-white font-medium rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
        aria-label="Basculer vers l'espace client"
      >
        {loading ? (
          <span className="animate-spin text-sm">⏳</span>
        ) : (
          <MaterialIcon name="person" size="sm" />
        )}
        <span>{hasClientRole ? 'Passer à l’espace client' : 'Activer l’espace client'}</span>
      </button>
    </div>
  );
}
