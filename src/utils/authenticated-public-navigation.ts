const PUBLIC_ROUTES_AVAILABLE_TO_AUTHENTICATED_USERS = new Set([
  '/',
  '/login',
  '/restaurant/register',
  '/driver/register',
]);

export function shouldRedirectAuthenticatedPublicRoute(pathname: string): boolean {
  return !PUBLIC_ROUTES_AVAILABLE_TO_AUTHENTICATED_USERS.has(pathname);
}
