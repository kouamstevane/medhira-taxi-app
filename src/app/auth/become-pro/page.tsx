'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { BecomePartnerModal } from '@/components/role/BecomePartnerModal';
import { DriverOnboardingDecisionGate } from '@/components/auth/DriverOnboardingDecisionGate';
import { getIncompleteRegistrationType, getRegistrationRestoreRole, getRegistrationResumePath } from '@/services/registration-draft.service';
import type { ActiveRole } from '@/types/user';

export default function BecomeProPage() {
  const router = useRouter();
  const { currentUser, userData, loading } = useAuth();
  const [isOpen, setIsOpen] = useState(true);
  const registrationType = userData ? getIncompleteRegistrationType(userData) : null;

  const hasDriver = userData?.roles?.driver != null;
  const hasRestaurant = userData?.roles?.restaurant != null;

  useEffect(() => {
    if (loading) return;

    if (!currentUser) {
      router.replace('/login');
      return;
    }

    if (registrationType) return;

    if (userData?.accountState === 'driver_onboarding' || userData?.activeRole === 'driver_onboarding') {
      router.replace('/driver/register');
      return;
    }
    if (userData?.accountState === 'restaurant_onboarding' || userData?.activeRole === 'restaurant_onboarding') {
      router.replace('/restaurant/register?from=become-pro');
      return;
    }

    if (userData && hasDriver && hasRestaurant) {
      const role = (userData.lastActiveRole || userData.activeRole || 'client') as ActiveRole;
      router.replace(`/dashboard?role=${role}`);
    }
  }, [currentUser, userData, loading, hasDriver, hasRestaurant, registrationType, router]);

  if (currentUser && userData && registrationType) {
    return (
      <DriverOnboardingDecisionGate
        registrationType={registrationType}
        resumePath={getRegistrationResumePath(userData)}
        deleteAccountOnAbandon={Object.keys(userData.roles ?? {}).length === 0}
        restoreActiveRole={getRegistrationRestoreRole(userData)}
      />
    );
  }

  if (loading || !currentUser || !userData || (hasDriver && hasRestaurant)) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
      <BecomePartnerModal
        isOpen={isOpen}
        onClose={() => {
          setIsOpen(false);
          router.push('/dashboard');
        }}
        hasDriverRole={hasDriver}
        hasRestaurantRole={hasRestaurant}
      />
    </div>
  );
}
