import { buildProfessionalOnboardingUserData } from '../professional-onboarding.service';

describe('buildProfessionalOnboardingUserData', () => {
  test.each([
    ['driver', 'driver_onboarding', 'driver_onboarding'],
    ['restaurant', 'restaurant_onboarding', 'restaurant_onboarding'],
  ] as const)('%s drafts never receive the client role', (type, activeRole, accountState) => {
    const now = Symbol('serverTimestamp');

    const userData = buildProfessionalOnboardingUserData({
      uid: 'professional-1',
      type,
      email: 'pro@example.com',
      firstName: 'Pro',
      lastName: 'User',
      currentStep: type === 'restaurant' ? 2 : 1,
      now,
    });

    expect(userData.roles).toEqual({});
    expect(userData.activeRole).toBe(activeRole);
    expect(userData.accountState).toBe(accountState);
  });
});
