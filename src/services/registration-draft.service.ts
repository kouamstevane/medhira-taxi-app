import type { UserData } from '@/types/user';

export type IncompleteRegistrationType = 'driver' | 'restaurant';

type RegistrationDraftProfile = Pick<
  UserData,
  'accountState' | 'activeRole' | 'lastActiveRole' | 'roles' | 'onboarding' | 'draftRestaurant'
>;

export function getIncompleteRegistrationType(
  userData: RegistrationDraftProfile,
): IncompleteRegistrationType | null {
  if (
    userData.accountState === 'driver_onboarding'
    || userData.activeRole === 'driver_onboarding'
    || userData.onboarding?.driver?.status === 'draft'
  ) {
    return 'driver';
  }

  if (
    userData.accountState === 'restaurant_onboarding'
    || userData.activeRole === 'restaurant_onboarding'
    || (
      userData.roles?.restaurant == null
      && (
        userData.draftRestaurant != null
        || userData.onboarding?.restaurant?.status === 'draft'
      )
    )
  ) {
    return 'restaurant';
  }

  return null;
}

export function getRegistrationResumePath(userData: RegistrationDraftProfile): string {
  const registrationType = getIncompleteRegistrationType(userData);
  if (registrationType === 'driver') return '/driver/register';
  if (registrationType === 'restaurant' && userData.onboarding?.restaurant?.currentStep === 2) {
    return '/restaurant/register?resume=restaurant';
  }
  if (registrationType === 'restaurant') return '/restaurant/register?from=become-pro';
  return '/';
}

export function getRegistrationRestoreRole(
  userData: RegistrationDraftProfile,
): 'client' | 'driver' | 'restaurant' {
  const lastActiveRole = userData.lastActiveRole;
  if (
    (lastActiveRole === 'client' || lastActiveRole === 'driver' || lastActiveRole === 'restaurant')
    && userData.roles?.[lastActiveRole] != null
  ) {
    return lastActiveRole;
  }
  if (userData.roles?.client != null) return 'client';
  if (userData.roles?.driver != null) return 'driver';
  if (userData.roles?.restaurant != null) return 'restaurant';
  return 'client';
}
