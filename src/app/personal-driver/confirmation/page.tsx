import React, { Suspense } from 'react';
import { PersonalDriverConfirmation } from '../components/PersonalDriverConfirmation';

export default function ConfirmationPage() {
  return (
    <main className="min-h-screen py-8 px-4 bg-gray-50 dark:bg-gray-950">
      <Suspense fallback={<div className="min-h-[60vh]" />}>
        <PersonalDriverConfirmation />
      </Suspense>
    </main>
  );
}
