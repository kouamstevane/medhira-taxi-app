import type { ActiveRole, AppAccountState } from '@/types/user';

export type ProfessionalOnboardingType = 'driver' | 'restaurant';

interface BuildProfessionalOnboardingUserDataInput {
  uid: string;
  type: ProfessionalOnboardingType;
  email?: string | null;
  firstName?: string;
  lastName?: string;
  profileImageUrl?: string | null;
  phoneNumber?: string | null;
  emailVerified?: boolean;
  currentStep: number;
  now: unknown;
}

export function buildProfessionalOnboardingUserData({
  uid,
  type,
  email,
  firstName = '',
  lastName = '',
  profileImageUrl = null,
  phoneNumber = null,
  emailVerified = false,
  currentStep,
  now,
}: BuildProfessionalOnboardingUserDataInput): Record<string, unknown> {
  const activeRole: ActiveRole = type === 'driver' ? 'driver_onboarding' : 'restaurant_onboarding';
  const accountState: AppAccountState = type === 'driver' ? 'driver_onboarding' : 'restaurant_onboarding';

  return {
    uid,
    email: email ?? null,
    phoneNumber,
    firstName,
    lastName,
    profileImageUrl,
    emailVerified,
    roles: {},
    activeRole,
    accountState,
    onboarding: type === 'driver'
      ? {
          driver: {
            status: 'draft',
            currentStep,
            startedAt: now,
            updatedAt: now,
          },
        }
      : {
          restaurant: {
            status: 'draft',
            currentStep,
            startedAt: now,
            updatedAt: now,
          },
        },
    createdAt: now,
    updatedAt: now,
  };
}
