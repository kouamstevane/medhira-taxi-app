'use client';

import React from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { getAdminHeaderNavItemClassName } from './adminHeaderUi';

interface AdminHeaderProps {
  title: string;
  subtitle: string;
}

export default function AdminHeader({ title, subtitle }: AdminHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();

  const navItems = [
    { label: 'Utilisateurs', href: '/admin/users', icon: 'group' },
    { label: 'Chauffeurs', href: '/admin/drivers', icon: 'directions_car' },
    { label: 'Restaurants', href: '/admin/restaurants', icon: 'store' },
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/5 bg-background/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
              <MaterialIcon name="admin_panel_settings" className="text-primary text-[24px]" />
              {title}
            </h1>
            <p className="text-slate-500 text-xs font-medium uppercase tracking-wider mt-1">{subtitle}</p>
          </div>

          <div className="flex min-w-0 items-center gap-2">
            <button
              onClick={() => router.push('/dashboard')}
              aria-label="Retourner au dashboard client"
              className="group flex shrink-0 items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-slate-300 glass-card transition-all duration-300 hover:bg-white/5"
            >
              <MaterialIcon name="home" size="sm" className="group-hover:-translate-y-0.5 transition-transform" />
              <span className="text-sm font-medium">Dashboard</span>
            </button>
            <div data-testid="admin-navigation-scroll" className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pb-2 no-scrollbar md:pb-0">
              {navItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <button
                    key={item.href}
                    onClick={() => router.push(item.href)}
                    className={getAdminHeaderNavItemClassName(isActive)}
                  >
                    <MaterialIcon name={item.icon} size="sm" />
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
