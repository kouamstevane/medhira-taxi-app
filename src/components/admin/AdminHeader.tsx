'use client';

import React from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { 
  Users, 
  Car, 
  Store, 
  ChevronLeft,
  ShieldCheck
} from 'lucide-react';

interface AdminHeaderProps {
  title: string;
  subtitle: string;
}

export default function AdminHeader({ title, subtitle }: AdminHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();

  const navItems = [
    { label: 'Utilisateurs', href: '/admin/users', icon: Users },
    { label: 'Chauffeurs', href: '/admin/drivers', icon: Car },
    { label: 'Restaurants', href: '/admin/restaurants', icon: Store },
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-gray-200 bg-white/90 backdrop-blur-xl shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-6 h-6 text-[#f29200]" />
              {title}
            </h1>
            <p className="text-gray-500 text-xs font-medium uppercase tracking-wider mt-1">{subtitle}</p>
          </div>
          
          <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 no-scrollbar">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <button
                  key={item.href}
                  onClick={() => router.push(item.href)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 whitespace-nowrap ${
                    isActive 
                      ? 'bg-[#f29200] text-white shadow-lg shadow-[#f29200]/20' 
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </button>
              );
            })}
            <div className="w-px h-6 bg-gray-200 mx-2 hidden md:block" />
            <button
              onClick={() => router.push('/dashboard')}
              className="group flex items-center gap-2 px-4 py-2 bg-white hover:bg-gray-50 border border-gray-200 text-slate-700 rounded-xl transition-all duration-300 shadow-sm whitespace-nowrap"
            >
              <ChevronLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
              <span className="text-sm font-medium">Dashboard</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
