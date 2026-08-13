const STRIPE_RETURN_ROUTE = '/stripe-return';

export function getStripeReturnPathFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const isNativeDeepLink = parsed.protocol === 'medjira:'
      && parsed.hostname === 'stripe-return';
    const isHttpsAppLink = parsed.protocol === 'https:'
      && parsed.pathname.replace(/\/+$/, '') === STRIPE_RETURN_ROUTE;

    if (!isNativeDeepLink && !isHttpsAppLink) return null;

    const role = parsed.searchParams.get('role');
    const status = parsed.searchParams.get('status') || parsed.searchParams.get('onboarding') || 'success';
    if (!['driver', 'restaurant'].includes(role || '') || !['success', 'refresh'].includes(status)) {
      return null;
    }

    const route = role === 'restaurant'
      ? '/restaurant/onboarding/payments'
      : '/driver/payments/setup';

    return `${route}?onboarding=${status}`;
  } catch {
    return null;
  }
}
