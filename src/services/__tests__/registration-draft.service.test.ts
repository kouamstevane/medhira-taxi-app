import { Timestamp } from 'firebase/firestore';
import type { UserData } from '@/types/user';
import { getIncompleteRegistrationType, getRegistrationResumePath } from '@/services/registration-draft.service';

const baseUser = {
  uid: 'u1',
  emailVerified: true,
  firstName: 'A',
  lastName: 'B',
  roles: { client: { enabled: true, joinedAt: Timestamp.now() } },
  activeRole: 'client' as const,
  createdAt: Timestamp.now(),
  updatedAt: Timestamp.now(),
} satisfies UserData;

describe('getIncompleteRegistrationType', () => {
  it('detects a driver onboarding account', () => {
    expect(getIncompleteRegistrationType({
      ...baseUser,
      roles: {},
      activeRole: 'driver_onboarding',
      accountState: 'driver_onboarding',
    })).toBe('driver');
  });

  it('detects a restaurant onboarding draft', () => {
    expect(getIncompleteRegistrationType({
      ...baseUser,
      draftRestaurant: {
        currentStep: 3,
        data: { name: 'Chez A' },
        updatedAt: Timestamp.now(),
      },
    })).toBe('restaurant');
  });

  it('detects a restaurant draft before restaurant data exists', () => {
    expect(getIncompleteRegistrationType({
      ...baseUser,
      onboarding: {
        restaurant: {
          status: 'draft',
          currentStep: 2,
          startedAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        },
      },
    })).toBe('restaurant');
  });

  it('detects a roleless restaurant onboarding account', () => {
    const userData = {
      ...baseUser,
      roles: {},
      activeRole: 'restaurant_onboarding' as const,
      accountState: 'restaurant_onboarding' as const,
      onboarding: {
        restaurant: {
          status: 'draft' as const,
          currentStep: 2 as const,
          startedAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        },
      },
    };

    expect(getIncompleteRegistrationType(userData)).toBe('restaurant');
    expect(getRegistrationResumePath(userData)).toBe('/restaurant/register?resume=restaurant');
  });

  it('ignores a completed restaurant account', () => {
    expect(getIncompleteRegistrationType({
      ...baseUser,
      roles: {
        ...baseUser.roles,
        restaurant: { restaurantId: 'r1', joinedAt: Timestamp.now() },
      },
    })).toBeNull();
  });

  it('resumes a restaurant account at email verification when step two is pending', () => {
    expect(getRegistrationResumePath({
      ...baseUser,
      onboarding: {
        restaurant: {
          status: 'draft',
          currentStep: 2,
          startedAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        },
      },
    })).toBe('/restaurant/register?resume=restaurant');
  });
});
