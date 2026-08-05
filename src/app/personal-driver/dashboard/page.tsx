import React from 'react';
import { PersonalDriverClientDashboard } from '../components/PersonalDriverClientDashboard';
import { RequireAuthenticatedPersonalDriver } from '@/components/auth/RequireAuthenticatedPersonalDriver';

export default function ClientDashboardPage() {
  return (
    <RequireAuthenticatedPersonalDriver role="client">
      <main className="min-h-screen py-8 px-4 bg-gray-50 dark:bg-gray-950">
        <PersonalDriverClientDashboard />
      </main>
    </RequireAuthenticatedPersonalDriver>
  );
}
