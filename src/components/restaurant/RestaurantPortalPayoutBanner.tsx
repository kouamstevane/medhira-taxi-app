'use client';

import type { RestaurantStatus } from '@/types/food-delivery';
import type { StripeConnectStatus } from '@/services/roles.service';
import { StripeConnectBanner } from './StripeConnectBanner';

interface RestaurantPortalPayoutBannerProps {
  status: RestaurantStatus;
  stripeConnectStatus: StripeConnectStatus;
}

export function RestaurantPortalPayoutBanner({
  status,
  stripeConnectStatus,
}: RestaurantPortalPayoutBannerProps) {
  if (status !== 'approved' || stripeConnectStatus === 'active') return null;

  return (
    <div className="mb-8">
      <StripeConnectBanner status={stripeConnectStatus} />
    </div>
  );
}
