'use client';

import React from 'react';
import { PersonalDriverAdminPageClient } from './PersonalDriverAdminPageClient';
import AdminHeader from '@/components/admin/AdminHeader';
import { BottomNav, adminNavItems } from '@/components/ui/BottomNav';
import { useAdminAuth } from '@/hooks/useAdminAuth';

export default function AdminPersonalDriverPage() {
  const isAdmin = useAdminAuth();

  if (isAdmin === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950 text-slate-300">
        <p className="text-sm font-medium">Vérification des accès en cours...</p>
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <AdminHeader
        title="Administration Personal Driver"
        subtitle="Gestion des forfaits et opérations Personal Driver"
      />
      <main className="py-8 px-4">
        <PersonalDriverAdminPageClient />
      </main>
      <BottomNav items={adminNavItems} />
    </div>
  );
}
