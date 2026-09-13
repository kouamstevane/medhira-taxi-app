'use client';

import Link from 'next/link';
import type { StripeConnectStatus } from '@/services/roles.service';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { useTranslation } from '@/hooks/useTranslation';

type Props = { status: StripeConnectStatus };

export function StripeConnectBanner({ status }: Props) {
  const { t } = useTranslation('restaurant');
  if (status === 'active') return null;

  if (status === 'not_started') {
    return (
      <div role="status" className="rounded-lg bg-orange-500/15 border border-orange-500/40 p-4 flex items-center gap-3">
        <MaterialIcon name="payments" className="text-orange-400" />
        <div className="flex-1">
          <p className="text-white font-semibold">{t('stripeConnectSetupTitle')}</p>
          <p className="text-slate-300 text-sm">{t('stripeConnectSetupDesc')}</p>
          <p className="text-slate-300 text-sm mt-1">{t('stripeConnectVisibilityMessage')}</p>
        </div>
        <Link href="/restaurant/onboarding/payments" className="min-h-[44px] bg-orange-500 text-white rounded-md px-4 py-2 text-sm font-semibold inline-flex items-center justify-center">{t('stripeConnectConfigure')}</Link>
      </div>
    );
  }

  if (status === 'in_progress') {
    return (
      <div role="status" className="rounded-lg bg-blue-500/15 border border-blue-500/40 p-4 flex items-center gap-3">
        <MaterialIcon name="hourglass_top" className="text-blue-400" />
        <div className="flex-1">
          <p className="text-white font-semibold">{t('stripeConnectInProgressTitle')}</p>
          <p className="text-slate-300 text-sm">{t('stripeConnectInProgressDesc')}</p>
          <p className="text-slate-300 text-sm mt-1">{t('stripeConnectVisibilityMessage')}</p>
        </div>
        <Link href="/restaurant/onboarding/payments" className="min-h-[44px] bg-blue-500 text-white rounded-md px-4 py-2 text-sm font-semibold inline-flex items-center justify-center">{t('stripeConnectResume')}</Link>
      </div>
    );
  }

  return (
    <div role="alert" className="rounded-lg bg-red-500/15 border border-red-500/40 p-4 flex items-center gap-3">
      <MaterialIcon name="error" className="text-red-400" />
      <div className="flex-1">
        <p className="text-white font-semibold">{t('stripeConnectActionRequiredTitle')}</p>
        <p className="text-slate-300 text-sm">{t('stripeConnectActionRequiredDesc')}</p>
        <p className="text-slate-300 text-sm mt-1">{t('stripeConnectVisibilityMessage')}</p>
      </div>
      <Link href="/restaurant/onboarding/payments?mode=update" className="min-h-[44px] bg-red-500 text-white rounded-md px-4 py-2 text-sm font-semibold inline-flex items-center justify-center">{t('stripeConnectFix')}</Link>
    </div>
  );
}
