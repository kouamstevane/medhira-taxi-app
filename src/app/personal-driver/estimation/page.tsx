'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  PERSONAL_DRIVER_CONFIG_SESSION_KEY,
  type PersonalDriverConfiguration,
} from '@/app/personal-driver/components/PersonalDriverConfigurator';
import { PersonalDriverEstimate } from '@/app/personal-driver/components/PersonalDriverEstimate';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { parsePersonalDriverConfiguration } from './parsePersonalDriverConfiguration';

function readStoredPersonalDriverConfiguration(): PersonalDriverConfiguration | null {
  if (typeof window === 'undefined') return null;

  try {
    const storedConfiguration = sessionStorage.getItem(PERSONAL_DRIVER_CONFIG_SESSION_KEY);
    const parsedConfiguration: unknown = storedConfiguration ? JSON.parse(storedConfiguration) : null;
    const validConfiguration = parsePersonalDriverConfiguration(parsedConfiguration);
    if (validConfiguration) return validConfiguration;
    if (storedConfiguration) {
      sessionStorage.removeItem(PERSONAL_DRIVER_CONFIG_SESSION_KEY);
    }
  } catch {
    sessionStorage.removeItem(PERSONAL_DRIVER_CONFIG_SESSION_KEY);
  }
  return null;
}

export default function PersonalDriverEstimationPage() {
  const router = useRouter();
  const [configuration] = useState<PersonalDriverConfiguration | null>(readStoredPersonalDriverConfiguration);

  if (!configuration) {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl items-center px-4 text-center">
        <div className="w-full space-y-4">
          <h1 className="text-2xl font-bold text-white">Votre trajet est introuvable</h1>
          <p className="text-sm text-slate-400">Configurez votre trajet avant de consulter une estimation.</p>
          <Link href="/personal-driver" className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-bold text-white">Choisir un forfait</Link>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-10 text-slate-100">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-white/5 bg-background/80 px-4 py-4 backdrop-blur-xl">
        <Link href={`/personal-driver/configurer?plan=${configuration.planId}`} aria-label="Modifier mon trajet" className="flex size-10 items-center justify-center rounded-full bg-card text-white active:scale-95 transition-transform">
          <MaterialIcon name="arrow_back" size="md" />
        </Link>
        <div>
          <p className="text-xs font-semibold text-primary">PERSONAL DRIVER</p>
          <h1 className="text-lg font-bold text-white">Votre estimation</h1>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-6">
        <PersonalDriverEstimate configuration={configuration} onContinue={() => router.push('/personal-driver/confirmation')} />
      </main>
    </div>
  );
}
