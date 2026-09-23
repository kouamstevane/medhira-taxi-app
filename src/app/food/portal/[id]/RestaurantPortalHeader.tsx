'use client';

import Image from 'next/image';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { RoleSwitcher } from '@/components/role/RoleSwitcher';
import { useTranslation } from '@/hooks/useTranslation';

interface RestaurantPortalHeaderProps {
  restaurantName: string;
  logoUrl?: string | null;
}

export function RestaurantPortalHeader({ restaurantName, logoUrl }: RestaurantPortalHeaderProps) {
  const { t } = useTranslation('restaurant');

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-white/5 bg-background/80 px-4 py-4 backdrop-blur-xl sm:px-8">
      <div className="flex min-w-0 items-center gap-3">
        {logoUrl ? (
          <Image src={logoUrl} alt={t('restaurantLogoAlt', { name: restaurantName })} width={40} height={40} className="size-10 shrink-0 rounded-xl object-cover" />
        ) : (
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <MaterialIcon name="shopping_bag" size="lg" className="text-primary" />
          </div>
        )}
        <h1 className="truncate text-base font-bold text-white sm:text-xl">{restaurantName}</h1>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <RoleSwitcher allowClientActivation />
      </div>
    </header>
  );
}
