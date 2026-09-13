'use client';

import Link from 'next/link';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { useTranslation } from '@/hooks/useTranslation';

export function RegistrationDraftBanner() {
  const { t } = useTranslation('restaurant');

  return (
    <div className="w-full max-w-md mx-auto mb-4 p-4 bg-orange-50 border border-orange-200 rounded-xl" role="alert">
      <div className="flex items-start gap-3">
        <MaterialIcon name="edit_note" size="lg" className="text-orange-500 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-medium text-orange-800">
            {t('registrationDraftTitle')}
          </p>
          <p className="text-xs text-orange-600 mt-1">
            {t('registrationDraftSubtitle')}
          </p>
        </div>
        <Link
          href="/restaurant/register?from=become-pro"
          className="min-h-[44px] px-4 bg-orange-500 text-white text-sm font-semibold rounded-lg inline-flex items-center justify-center hover:bg-orange-600 transition-colors"
          aria-label={t('registrationDraftAria')}
        >
          {t('registrationDraftResume')}
        </Link>
      </div>
    </div>
  );
}
