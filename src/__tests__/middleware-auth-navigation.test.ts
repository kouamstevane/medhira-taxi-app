import { shouldRedirectAuthenticatedPublicRoute } from '@/utils/authenticated-public-navigation';

describe('authenticated public navigation', () => {
  it('keeps the login page reachable for an authenticated user', () => {
    expect(shouldRedirectAuthenticatedPublicRoute('/login')).toBe(false);
  });

  it.each(['/restaurant/register', '/driver/register'])('keeps %s reachable for onboarding', (pathname) => {
    expect(shouldRedirectAuthenticatedPublicRoute(pathname)).toBe(false);
  });
});
