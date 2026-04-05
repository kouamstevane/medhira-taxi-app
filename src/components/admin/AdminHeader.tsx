'use client';

import React from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { MaterialIcon } from '@/components/ui/MaterialIcon';

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

          <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 no-scrollbar">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <button
                  key={item.href}
                  onClick={() => router.push(item.href)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 whitespace-nowrap ${
                    isActive
                      ? 'bg-primary text-white shadow-lg shadow-primary/20'
                      : 'glass-card text-slate-300 border border-white/10 hover:border-primary/50'
                  }`}
                >
                  <MaterialIcon name={item.icon} size="sm" />
                  {item.label}
                </button>
              );
            })}
            <div className="w-px h-6 bg-white/10 mx-2 hidden md:block" />
            <button
              onClick={() => router.push('/dashboard')}
              className="group flex items-center gap-2 px-4 py-2 glass-card hover:bg-white/5 border border-white/10 text-slate-300 rounded-xl transition-all duration-300 whitespace-nowrap"
            >
              <MaterialIcon name="chevron_left" size="sm" className="group-hover:-translate-x-1 transition-transform" />
              <span className="text-sm font-medium">Dashboard</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
