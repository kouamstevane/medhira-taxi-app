'use client';

import { signOut } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { useRouter } from 'next/navigation';
import { auth, functions } from '@/config/firebase';
import { secureStorage } from '@/services/secureStorage.service';
import { DriverOnboardingDecision } from './DriverOnboardingDecision';

export function DriverOnboardingDecisionGate() {
  const router = useRouter();

  const handleResume = () => {
    router.replace('/driver/register');
  };

  const handleLater = async () => {
    await signOut(auth);
    router.replace('/');
  };

  const handleAbandon = async () => {
    const requestAccountDeletion = httpsCallable(functions, 'requestAccountDeletion');
    const deletionResult = await requestAccountDeletion({ confirm: 'DELETE_MY_ACCOUNT' });
    const deletionReport = deletionResult.data as { success?: boolean };
    if (deletionReport.success !== true) {
      throw new Error('La suppression du compte n’a pas pu être terminée. Réessayez.');
    }
    await secureStorage.removeItem('driver_registration_progress');
    await signOut(auth);
    router.replace('/');
  };

  return (
    <DriverOnboardingDecision
      onResume={handleResume}
      onLater={handleLater}
      onAbandon={handleAbandon}
    />
  );
}
