import React, { Suspense } from 'react';
import { PersonalDriverConfirmation } from '../components/PersonalDriverConfirmation';

export default function ConfirmationPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-3 py-4 sm:px-6 sm:py-6">
      <Suspense fallback={<div className="min-h-[60vh]" />}>
        <PersonalDriverConfirmation />
      </Suspense>
    </main>
  );
}
