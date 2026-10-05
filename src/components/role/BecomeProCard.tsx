'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { useTranslation } from '@/hooks/useTranslation';
import { BecomePartnerModal } from './BecomePartnerModal';

export function BecomeProCard() {
  const { t } = useTranslation();
  const { userData } = useAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const hasDriver = userData?.roles?.driver != null;
  const hasRestaurant = userData?.roles?.restaurant != null;
  if (hasDriver && hasRestaurant) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setIsModalOpen(true)}
        className="w-full text-left block glass-card p-4 rounded-xl hover:bg-white/5 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-2.5 rounded-lg shrink-0">
            <MaterialIcon name="rocket_launch" className="text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold">{t('auth.becomeProTitle')}</p>
            <p className="text-slate-400 text-sm truncate">{t('auth.driverOrRestaurant')}</p>
          </div>
          <MaterialIcon name="chevron_right" className="text-slate-500 shrink-0" />
        </div>
      </button>

      <BecomePartnerModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        hasDriverRole={hasDriver}
        hasRestaurantRole={hasRestaurant}
      />
    </>
  );
}
