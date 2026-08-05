import React from 'react';
import { PersonalDriverAdminPageClient } from './PersonalDriverAdminPageClient';
import { RequireAuthenticatedPersonalDriver } from '@/components/auth/RequireAuthenticatedPersonalDriver';

export default function AdminPersonalDriverPage() {
  return (
    <RequireAuthenticatedPersonalDriver role="admin">
      <main className="min-h-screen py-8 px-4 bg-gray-50 dark:bg-gray-950">
        <PersonalDriverAdminPageClient />
      </main>
    </RequireAuthenticatedPersonalDriver>
  );
}
