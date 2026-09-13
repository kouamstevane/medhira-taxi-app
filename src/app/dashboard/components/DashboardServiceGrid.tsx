'use client';

import Link from 'next/link';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { useTranslation } from '@/hooks/useTranslation';

type DashboardService = {
  icon: string;
  label: string;
  sub: string;
  subColor: string;
  route: string;
  highlight?: boolean;
  description?: string;
  cta?: string;
};

export function DashboardServiceGrid() {
  const { t } = useTranslation('client');

  const dashboardServices: DashboardService[] = [
    {
      icon: 'local_taxi',
      label: t('quickActions.taxi'),
      sub: t('serviceTaxiDesc'),
      subColor: 'text-emerald-500',
      route: '/taxi',
      highlight: true,
    },
    {
      icon: 'calendar_month',
      label: t('quickActions.personalDriver'),
      sub: t('servicePersonalDriverDesc'),
      description: t('servicePersonalDriverDetail'),
      subColor: 'text-primary',
      route: '/personal-driver',
    },
    {
      icon: 'lunch_dining',
      label: t('quickActions.food'),
      sub: t('serviceFoodDesc'),
      subColor: 'text-slate-400',
      route: '/food',
    },
    {
      icon: 'package_2',
      label: t('quickActions.colis'),
      sub: t('serviceColisDesc'),
      subColor: 'text-slate-400',
      route: '/colis',
    },
    {
      icon: 'favorite',
      label: t('serviceFavorites'),
      sub: t('serviceFavoritesDesc'),
      subColor: 'text-slate-400',
      route: '/profil',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4">
      {dashboardServices.map((service) => (
        <Link
          key={service.route}
          href={service.route}
          className={`bg-card p-5 rounded-2xl border border-white/5 flex flex-col gap-4 shadow-lg cursor-pointer active:scale-[0.98] transition-transform ${
            service.highlight ? 'border-b-4 border-b-primary' : ''
          }`}
        >
          <div className="size-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <MaterialIcon name={service.icon} className="text-primary text-3xl" />
          </div>
          <div>
            <p className="text-white font-bold text-[16px]">{service.label}</p>
            <p className={`${service.subColor} text-xs font-medium mt-0.5 flex items-center gap-1`}>
              {service.highlight && <span className="size-1.5 bg-emerald-500 rounded-full" />}
              {service.sub}
            </p>
            {service.description && (
              <p className="mt-2 text-xs leading-5 text-slate-400">{service.description}</p>
            )}
            {service.cta && (
              <p className="mt-3 text-xs font-bold text-primary">{service.cta}</p>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}
