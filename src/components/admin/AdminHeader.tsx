'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { MaterialIcon } from '@/components/ui/MaterialIcon';

interface AdminHeaderProps {
  title: string;
  subtitle: string;
}

export default function AdminHeader({ title, subtitle }: AdminHeaderProps) {
  const router = useRouter();

  return (
    <header className="sticky top-0 z-40 w-full bg-background/90 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 sm:py-4 lg:px-8">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-2 text-xl font-bold leading-tight tracking-tight text-white sm:text-2xl">
              <MaterialIcon name="admin_panel_settings" className="text-primary text-[24px]" />
              {title}
            </h1>
            <p className="mt-1 max-w-full break-words text-[11px] font-medium leading-4 text-slate-300 sm:text-xs">{subtitle}</p>
          </div>

          <button
            onClick={() => router.push('/dashboard')}
            aria-label="Retourner au dashboard client"
            title="Retourner au dashboard client"
            className="group inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-slate-300 transition-all duration-300 hover:border-primary/40 hover:bg-white/10 hover:text-white"
          >
            <MaterialIcon name="home" size="sm" className="transition-transform group-hover:-translate-y-0.5" />
            <span className="hidden text-sm font-medium sm:inline">Dashboard</span>
          </button>
        </div>
      </div>
    </header>
  );
}
