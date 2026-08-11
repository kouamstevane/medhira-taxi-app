'use client';

import { deleteField, doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useRouter } from 'next/navigation';
import { auth, db, functions } from '@/config/firebase';
import { secureStorage } from '@/services/secureStorage.service';
import { AuthService } from '@/services';
import { DriverOnboardingDecision } from './DriverOnboardingDecision';

export function DriverOnboardingDecisionGate({
  registrationType = 'driver',
  resumePath,
  deleteAccountOnAbandon = true,
  restoreActiveRole = 'client',
}: {
  registrationType?: 'driver' | 'restaurant';
  resumePath?: string;
  deleteAccountOnAbandon?: boolean;
  restoreActiveRole?: 'client' | 'driver' | 'restaurant';
}) {
  const router = useRouter();

  const handleResume = () => {
    router.replace(resumePath ?? (
      registrationType === 'restaurant'
        ? '/restaurant/register?from=become-pro'
        : '/driver/register'
    ));
  };

  const handleLater = async () => {
    await AuthService.signOut();
    router.replace('/');
  };

  const handleAbandon = async () => {
    const user = auth.currentUser;
    const uid = user?.uid;

    if (deleteAccountOnAbandon) {
      const requestAccountDeletion = httpsCallable(functions, 'requestAccountDeletion');
      const deletionResult = await requestAccountDeletion({ confirm: 'DELETE_MY_ACCOUNT' });
      const deletionReport = deletionResult.data as { success?: boolean };
      if (deletionReport.success !== true) {
        throw new Error('La suppression du compte n’a pas pu être terminée. Réessayez.');
      }
      await secureStorage.clearLegacyDriverProgress();
      if (uid) {
        await secureStorage.removeItem(`driver_registration_progress_${uid}`);
      }
    } else {
      if (!user) throw new Error('Session expirée. Reconnectez-vous puis réessayez.');
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);
      const userData = userSnap.data();

      const finalRestoreRole = restoreActiveRole ?? userData?.lastActiveRole ?? 'client';

      await updateDoc(userRef, {
        draftRestaurant: deleteField(),
        'onboarding.driver': deleteField(),
        'onboarding.restaurant': deleteField(),
        accountState: 'active',
        activeRole: finalRestoreRole,
        updatedAt: serverTimestamp(),
      });

      await secureStorage.clearLegacyDriverProgress();
      await secureStorage.removeItem(`driver_registration_progress_${user.uid}`);
    }
    await AuthService.signOut();
    router.replace('/');
  };

  return (
    <DriverOnboardingDecision
      registrationType={registrationType}
      onResume={handleResume}
      onLater={handleLater}
      onAbandon={handleAbandon}
      deleteAccountOnAbandon={deleteAccountOnAbandon}
    />
  );
}
