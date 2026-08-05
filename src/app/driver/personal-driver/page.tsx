import React from 'react';
import { PersonalDriverDriverPageClient } from './PersonalDriverDriverPageClient';
import { RequireAuthenticatedPersonalDriver } from '@/components/auth/RequireAuthenticatedPersonalDriver';

export default function DriverPersonalDriverPage() {
  return (
    <RequireAuthenticatedPersonalDriver role="driver">
      <main className="min-h-screen py-8 px-4 bg-gray-50 dark:bg-gray-950">
        <PersonalDriverDriverPageClient />
      </main>
    </RequireAuthenticatedPersonalDriver>
  );
}
