'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { PERSONAL_DRIVER_PLANS } from '@/services/personal-driver/plans';
import type { PersonalDriverPlanId } from '@/types/personal-driver';
import { PersonalDriverPlanCard } from './components/PersonalDriverPlanCard';

const benefits = [
  { icon: 'calendar_month', text: 'Jours et horaires planifiés sur 30 jours' },
  { icon: 'route', text: 'Distance routière estimée avant paiement' },
  { icon: 'payments', text: 'Prix minimum et prix au kilomètre comparés' },
  { icon: 'support_agent', text: 'Suivi admin, chauffeur et notifications de mission' },
];

const comparisonRows = [
  { label: 'Minimum mensuel', basic: '300 $', classic: '450 $', premium: '650 $' },
  { label: 'Tarif kilométrique', basic: '1,50 $ / km', classic: '1,25 $ / km', premium: '1,10 $ / km' },
  { label: 'Semaine', basic: 'Oui', classic: 'Oui', premium: 'Oui' },
  { label: 'Week-end', basic: 'Non', classic: 'Oui', premium: 'Oui' },
  { label: 'Jours fériés', basic: 'Non', classic: 'Selon disponibilité', premium: 'Oui' },
  { label: 'Trajets spéciaux', basic: '0', classic: '2 inclus', premium: '4 inclus' },
  { label: 'Attente gratuite', basic: '3 min', classic: '5 min', premium: '10 min' },
  { label: 'Priorité', basic: 'Standard', classic: 'Supérieure', premium: 'Maximale' },
];

type ChoiceNeed = 'week' | 'weekend' | 'priority';

export default function PersonalDriverPage() {
  const [showComparison, setShowComparison] = useState(false);
  const [showHelper, setShowHelper] = useState(false);
  const [need, setNeed] = useState<ChoiceNeed>('week');

  const recommendedPlanId = useMemo<PersonalDriverPlanId>(() => {
    if (need === 'priority') return 'premium';
    if (need === 'weekend') return 'classic';
    return 'basic';
  }, [need]);

  const recommendedPlan = PERSONAL_DRIVER_PLANS[recommendedPlanId];

  return (
    <div className="min-h-screen bg-background pb-10 text-slate-100">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-white/5 bg-background/80 px-4 py-4 backdrop-blur-xl">
        <Link
          href="/dashboard"
          aria-label="Retour au tableau de bord"
          className="flex size-10 items-center justify-center rounded-full bg-card text-white transition-transform active:scale-95"
        >
          <MaterialIcon name="arrow_back" size="md" />
        </Link>
        <h1 className="text-lg font-bold text-white">Personal Driver</h1>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        <section className="mb-8 grid gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-primary">Transport régulier</p>
            <h2 className="mt-2 text-3xl font-black leading-tight text-white sm:text-4xl">
              MEDJIRA PERSONAL DRIVER
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300">
              Votre transport planifié pour le travail, l&apos;école, les rendez-vous et les trajets familiaux récurrents, avec un coût mensuel clair avant confirmation.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="#forfaits"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-white transition hover:bg-primary/90 active:scale-95"
              >
                <MaterialIcon name="arrow_downward" size="sm" />
                Commencer
              </Link>
              <button
                type="button"
                onClick={() => setShowComparison((value) => !value)}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 px-5 text-sm font-bold text-slate-200 transition hover:bg-white/5"
              >
                <MaterialIcon name="compare_arrows" size="sm" />
                Comparer les forfaits
              </button>
              <button
                type="button"
                onClick={() => setShowHelper((value) => !value)}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 px-5 text-sm font-bold text-slate-200 transition hover:bg-white/5"
              >
                <MaterialIcon name="psychology" size="sm" />
                Aidez-moi à choisir
              </button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            {benefits.map((benefit) => (
              <div key={benefit.icon} className="flex items-center gap-3 rounded-lg border border-white/10 bg-card p-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <MaterialIcon name={benefit.icon} size="md" className="text-primary" />
                </div>
                <p className="text-sm font-medium text-slate-300">{benefit.text}</p>
              </div>
            ))}
          </div>
        </section>

        {showHelper && (
          <section className="mb-8 rounded-lg border border-white/10 bg-card p-5" aria-label="Aide au choix du forfait">
            <h2 className="text-base font-bold text-white">Votre besoin principal</h2>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {[
                { id: 'week', label: 'Semaine uniquement' },
                { id: 'weekend', label: 'Inclure le week-end' },
                { id: 'priority', label: 'Service prioritaire' },
              ].map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setNeed(option.id as ChoiceNeed)}
                  className={`min-h-11 rounded-lg border px-3 text-sm font-semibold transition ${
                    need === option.id
                      ? 'border-primary bg-primary text-white'
                      : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="mt-4 flex flex-col gap-3 rounded-lg border border-primary/20 bg-primary/10 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">Forfait recommandé</p>
                <p className="mt-1 text-lg font-black text-white">{recommendedPlan.name}</p>
                <p className="text-sm text-slate-300">{recommendedPlan.promise}</p>
              </div>
              <Link
                href={`/personal-driver/configurer?plan=${recommendedPlan.id}`}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-white"
              >
                Configurer {recommendedPlan.name}
              </Link>
            </div>
          </section>
        )}

        {showComparison && (
          <section className="mb-8 overflow-hidden rounded-lg border border-white/10 bg-card" aria-label="Comparaison des forfaits">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="bg-white/5 text-xs uppercase text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Critère</th>
                    <th className="px-4 py-3">Basic</th>
                    <th className="px-4 py-3">Classic</th>
                    <th className="px-4 py-3">Premium</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonRows.map((row) => (
                    <tr key={row.label} className="border-t border-white/5">
                      <th className="px-4 py-3 font-semibold text-white">{row.label}</th>
                      <td className="px-4 py-3 text-slate-300">{row.basic}</td>
                      <td className="px-4 py-3 text-slate-300">{row.classic}</td>
                      <td className="px-4 py-3 text-slate-300">{row.premium}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section id="forfaits" aria-labelledby="plan-heading">
          <div className="mb-4">
            <h2 id="plan-heading" className="text-xl font-bold text-white">Choisissez votre formule</h2>
            <p className="mt-1 text-sm text-slate-400">Le prix final est recalculé selon vos jours, votre trajet et votre distance mensuelle réelle.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {Object.values(PERSONAL_DRIVER_PLANS).map((plan) => (
              <PersonalDriverPlanCard key={plan.id} plan={plan} />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
