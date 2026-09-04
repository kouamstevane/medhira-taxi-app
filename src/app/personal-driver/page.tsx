'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { PERSONAL_DRIVER_PLAN_IDS } from '@/services/personal-driver/plans';
import { usePersonalDriverPlans } from '@/hooks/usePersonalDriverPlans';
import type { PersonalDriverPlan, PersonalDriverPlanId, PersonalDriverWeekday } from '@/types/personal-driver';
import { CURRENCY_CODE } from '@/utils/constants';
import { PersonalDriverPlanCard } from './components/PersonalDriverPlanCard';

const benefits = [
  { icon: 'calendar_month', title: 'Planification 30 jours', text: 'Jours et horaires planifiés à l\'avance sans surprise.' },
  { icon: 'route', title: 'Transparence totale', text: 'Distance et coût mensuel exact calculés avant confirmation.' },
  { icon: 'payments', title: 'Meilleurs tarifs', text: 'Comparatif direct entre tarif mensuel et tarif au kilomètre.' },
  { icon: 'support_agent', title: 'Suivi & Assistance', text: 'Notifications chauffeur et suivi dédié par l\'équipe Medjira.' },
];

type ChoiceNeed = 'week' | 'weekend' | 'priority';

const WEEKDAY_LABELS: Record<PersonalDriverWeekday, string> = {
  0: 'Dim.',
  1: 'Lun.',
  2: 'Mar.',
  3: 'Mer.',
  4: 'Jeu.',
  5: 'Ven.',
  6: 'Sam.',
};

type ComparisonRow = { label: string } & Record<PersonalDriverPlanId, string>;

function formatAmount(amount: number): string {
  return amount.toLocaleString('fr-FR');
}

function formatPricePerKm(amount: number): string {
  return amount.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatWeekdays(weekdays: PersonalDriverWeekday[]): string {
  return weekdays.map((weekday) => WEEKDAY_LABELS[weekday]).join(', ');
}

function buildComparisonRows(plans: Record<PersonalDriverPlanId, PersonalDriverPlan>): ComparisonRow[] {
  return [
    {
      label: 'Minimum mensuel',
      basic: `${formatAmount(plans.basic.minimumAmount)} ${CURRENCY_CODE}`,
      classic: `${formatAmount(plans.classic.minimumAmount)} ${CURRENCY_CODE}`,
      premium: `${formatAmount(plans.premium.minimumAmount)} ${CURRENCY_CODE}`,
    },
    {
      label: 'Tarif kilométrique',
      basic: `${formatPricePerKm(plans.basic.pricePerKm)} ${CURRENCY_CODE} / km`,
      classic: `${formatPricePerKm(plans.classic.pricePerKm)} ${CURRENCY_CODE} / km`,
      premium: `${formatPricePerKm(plans.premium.pricePerKm)} ${CURRENCY_CODE} / km`,
    },
    {
      label: 'Jours autorisés',
      basic: formatWeekdays(plans.basic.allowedWeekdays),
      classic: formatWeekdays(plans.classic.allowedWeekdays),
      premium: formatWeekdays(plans.premium.allowedWeekdays),
    },
    {
      label: 'Trajets spéciaux',
      basic: plans.basic.includedSpecialTrips === 0 ? '0' : `${plans.basic.includedSpecialTrips} inclus`,
      classic: plans.classic.includedSpecialTrips === 0 ? '0' : `${plans.classic.includedSpecialTrips} inclus`,
      premium: plans.premium.includedSpecialTrips === 0 ? '0' : `${plans.premium.includedSpecialTrips} inclus`,
    },
    {
      label: 'Attente gratuite',
      basic: `${plans.basic.includedRegularWaitMinutes} min`,
      classic: `${plans.classic.includedRegularWaitMinutes} min`,
      premium: `${plans.premium.includedRegularWaitMinutes} min`,
    },
  ];
}

export default function PersonalDriverPage() {
  const { plans, error, reload } = usePersonalDriverPlans();
  const [showComparison, setShowComparison] = useState(false);
  const [showHelper, setShowHelper] = useState(false);
  const [need, setNeed] = useState<ChoiceNeed>('week');
  const [activeTab, setActiveTab] = useState<'all' | 'basic' | 'classic' | 'premium'>('all');

  useEffect(() => {
    if (showHelper || showComparison) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [showHelper, showComparison]);

  const recommendedPlanId = useMemo<PersonalDriverPlanId>(() => {
    if (need === 'priority') return 'premium';
    if (need === 'weekend') return 'classic';
    return 'basic';
  }, [need]);

  const recommendedPlan = plans[recommendedPlanId];
  const comparisonRows = useMemo(() => buildComparisonRows(plans), [plans]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-slate-950 to-background pb-16 text-slate-100 selection:bg-primary selection:text-black">
      {/* Top Sticky Header with Mobile Safe Area Support */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-background/80 px-4 pt-[calc(0.875rem+env(safe-area-inset-top,0px))] pb-3.5 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              aria-label="Retour au tableau de bord"
              className="flex size-11 items-center justify-center rounded-full border border-white/10 bg-card/80 text-white transition-all hover:bg-white/10 active:scale-95"
            >
              <MaterialIcon name="arrow_back" size="md" />
            </Link>
            <div>
              <h1 className="text-base font-bold text-white leading-tight">Personal Driver</h1>
              <p className="text-[11px] font-medium text-slate-400">Medjira Mobility</p>
            </div>
          </div>

          <Link
            href="#forfaits"
            className="hidden sm:inline-flex min-h-11 items-center gap-1.5 rounded-full bg-primary/20 px-4 py-1.5 text-xs font-bold text-primary border border-primary/30 transition hover:bg-primary/30 active:scale-95"
          >
            <MaterialIcon name="directions_car" size="sm" />
            <span>Voir les forfaits</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:py-10 space-y-10">
        {error && (
          <div role="alert" className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
            Les forfaits par défaut restent affichés. Impossible de charger les forfaits configurés.
            <button type="button" onClick={() => void reload()} className="ml-3 inline-flex min-h-11 items-center font-bold underline underline-offset-4">
              Réessayer
            </button>
          </div>
        )}

        {/* Hero Section */}
        <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-card/90 via-card/50 to-primary/5 p-6 sm:p-10 backdrop-blur-xl shadow-2xl">
          <div className="absolute -top-24 -right-24 size-72 rounded-full bg-primary/10 blur-3xl pointer-events-none" />

          <div className="relative z-10 grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 border border-primary/30 px-3.5 py-1 text-[11px] font-extrabold uppercase tracking-wider text-primary">
                <MaterialIcon name="verified" size="sm" className="text-[14px] text-primary" />
                Transport Régulier & Sur Mesure
              </span>
              
              <h2 className="mt-3 text-3xl font-black leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">
                MEDJIRA PERSONAL DRIVER
              </h2>
              
              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-300 sm:text-base">
                Votre service de chauffeur dédié pour vos trajets récurrents (travail, école, famille). 
                Profitez d&apos;un budget mensuel maîtrisé sans mauvaise surprise.
              </p>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Link
                  href="#forfaits"
                  className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-primary px-6 text-sm font-extrabold text-black shadow-lg shadow-primary/25 transition-all hover:brightness-110 active:scale-95"
                >
                  <MaterialIcon name="arrow_downward" size="sm" />
                  Commencer
                </Link>
                
                <button
                  type="button"
                  onClick={() => setShowComparison((value) => !value)}
                  className={`inline-flex min-h-12 items-center gap-2 rounded-xl border px-5 text-sm font-bold transition-all active:scale-95 ${
                    showComparison 
                      ? 'border-primary bg-primary/20 text-white' 
                      : 'border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'
                  }`}
                >
                  <MaterialIcon name="compare_arrows" size="sm" />
                  Comparer les forfaits
                </button>
                
                <button
                  type="button"
                  onClick={() => setShowHelper(true)}
                  className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 text-sm font-bold text-slate-200 transition-all hover:bg-white/10 active:scale-95"
                >
                  <MaterialIcon name="psychology" size="sm" className="text-amber-400" />
                  Aidez-moi à choisir
                </button>
              </div>
            </div>

            {/* Benefits cards (Hidden on mobile for cleaner UX, visible on desktop) */}
            <div className="hidden lg:grid gap-3 lg:grid-cols-1">
              {benefits.map((benefit) => (
                <div 
                  key={benefit.icon} 
                  className="group flex items-center gap-3.5 rounded-2xl border border-white/10 bg-card/60 p-3.5 transition-all hover:border-primary/40 hover:bg-card/90"
                >
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary transition-transform group-hover:scale-105">
                    <MaterialIcon name={benefit.icon} size="md" />
                  </div>
                  <div>
                    <h3 className="text-xs font-extrabold text-white">{benefit.title}</h3>
                    <p className="text-[11px] leading-4 text-slate-400">{benefit.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Modal / Bottom Sheet Assistant ("Aidez-moi à choisir") */}
        {showHelper && (
          <div 
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 p-0 sm:p-4 backdrop-blur-md transition-opacity animate-in fade-in"
            onClick={() => setShowHelper(false)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="helper-title"
          >
            <div 
              className="w-full max-w-lg rounded-t-3xl sm:rounded-3xl border border-white/15 bg-slate-900 p-6 shadow-2xl animate-in slide-in-from-bottom-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="flex size-9 items-center justify-center rounded-lg bg-amber-400/20 text-amber-400">
                    <MaterialIcon name="psychology" size="md" />
                  </div>
                  <div>
                    <h3 id="helper-title" className="text-base font-bold text-white">Assistant de Choix</h3>
                    <p className="text-xs text-slate-400">Trouvez la formule idéale en 1 clic</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowHelper(false)}
                  className="flex size-11 items-center justify-center rounded-full bg-white/10 text-slate-300 transition-all hover:bg-white/20 active:scale-95"
                  aria-label="Fermer la fenêtre d'aide"
                >
                  <MaterialIcon name="close" size="sm" />
                </button>
              </div>

              <div className="mt-5 space-y-4">
                <p className="text-xs font-semibold text-slate-300 uppercase tracking-wide">Quel est votre besoin principal ?</p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {[
                    { id: 'week', label: 'Semaine uniquement', icon: 'work' },
                    { id: 'weekend', label: 'Inclure le week-end', icon: 'weekend' },
                    { id: 'priority', label: 'Service prioritaire', icon: 'bolt' },
                  ].map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setNeed(option.id as ChoiceNeed)}
                      className={`flex min-h-12 flex-col items-center justify-center rounded-xl border p-2 text-center text-xs font-bold transition-all active:scale-95 ${
                        need === option.id
                          ? 'border-primary bg-primary text-black shadow-md shadow-primary/20 scale-[1.02]'
                          : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                      }`}
                    >
                      <MaterialIcon name={option.icon} size="sm" className="mb-1" />
                      <span>{option.label}</span>
                    </button>
                  ))}
                </div>

                <div className="mt-6 rounded-2xl border border-primary/40 bg-gradient-to-br from-primary/20 to-primary/5 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-primary">Recommandation personnalisée</span>
                    <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary">Idéal pour vous</span>
                  </div>
                  
                  <h4 className="mt-2 text-xl font-black text-white">{recommendedPlan.name}</h4>
                  <p className="mt-0.5 text-xs text-slate-300">{recommendedPlan.promise}</p>
                  
                  <div className="mt-4 flex items-center justify-between pt-3 border-t border-white/10">
                    <div>
                      <span className="text-xs text-slate-400">À partir de </span>
                      <span className="text-lg font-black text-white">{recommendedPlan.minimumAmount} {CURRENCY_CODE}</span>
                      <span className="text-xs text-slate-400"> / mois</span>
                    </div>
                    
                    <Link
                      href={`/personal-driver/configurer?plan=${recommendedPlan.id}`}
                      onClick={() => setShowHelper(false)}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-primary px-4 text-xs font-extrabold text-black transition hover:brightness-110 active:scale-95"
                    >
                      <span>Configurer {recommendedPlan.name}</span>
                      <MaterialIcon name="arrow_forward" size="sm" />
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal / Bottom Sheet Comparateur */}
        {showComparison && (
          <div 
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 p-0 sm:p-4 backdrop-blur-md transition-opacity animate-in fade-in"
            onClick={() => setShowComparison(false)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="comparison-title"
          >
            <div 
              className="w-full max-w-4xl max-h-[85vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-white/15 bg-slate-900 p-6 shadow-2xl animate-in slide-in-from-bottom-5 space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="flex size-9 items-center justify-center rounded-lg bg-primary/20 text-primary">
                    <MaterialIcon name="compare_arrows" size="md" />
                  </div>
                  <div>
                    <h3 id="comparison-title" className="text-base font-bold text-white">Tableau comparatif détaillé</h3>
                    <p className="text-xs text-slate-400">Comparez toutes les caractéristiques de nos offres</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowComparison(false)}
                  className="flex size-11 items-center justify-center rounded-full bg-white/10 text-slate-300 transition-all hover:bg-white/20 active:scale-95"
                  aria-label="Fermer le tableau comparatif"
                >
                  <MaterialIcon name="close" size="sm" />
                </button>
              </div>

              {/* Selector on Mobile to avoid overflow */}
              <div className="flex sm:hidden rounded-xl bg-white/5 p-1 text-xs">
                {(['all', 'basic', 'classic', 'premium'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={`flex-1 min-h-11 py-2 text-center font-bold capitalize rounded-lg transition active:scale-95 ${
                      activeTab === tab ? 'bg-primary text-black shadow' : 'text-slate-400'
                    }`}
                  >
                    {tab === 'all' ? 'Tous' : tab}
                  </button>
                ))}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-white/5 text-[11px] uppercase tracking-wider text-slate-400">
                    <tr>
                      <th scope="col" className="px-4 py-3 font-semibold">Critère</th>
                      {(activeTab === 'all' || activeTab === 'basic') && <th scope="col" className="px-4 py-3 font-semibold text-slate-200">{plans.basic.name}</th>}
                      {(activeTab === 'all' || activeTab === 'classic') && (
                        <th scope="col" className="px-4 py-3 font-semibold text-slate-200">
                          {plans.classic.name}
                        </th>
                      )}
                      {(activeTab === 'all' || activeTab === 'premium') && <th scope="col" className="px-4 py-3 font-semibold text-slate-200">{plans.premium.name}</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {comparisonRows.map((row) => (
                      <tr key={row.label} className="hover:bg-white/[0.02]">
                        <th scope="row" className="px-4 py-3 font-medium text-slate-300">{row.label}</th>
                        {(activeTab === 'all' || activeTab === 'basic') && (
                          <td className="px-4 py-3 text-slate-400">{row.basic}</td>
                        )}
                        {(activeTab === 'all' || activeTab === 'classic') && (
                          <td className="px-4 py-3 text-slate-400">{row.classic}</td>
                        )}
                        {(activeTab === 'all' || activeTab === 'premium') && (
                          <td className="px-4 py-3 text-slate-400">{row.premium}</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Formules section */}
        <section id="forfaits" aria-labelledby="plan-heading" className="space-y-6 pt-4">
          <div className="text-center max-w-xl mx-auto space-y-2">
            <span className="text-xs font-extrabold uppercase tracking-widest text-primary">Offres & Forfaits</span>
            <h2 id="plan-heading" className="text-2xl font-black text-white sm:text-3xl">Choisissez votre formule</h2>
            <p className="text-xs sm:text-sm text-slate-400">
              Chaque forfait s&apos;adapte à vos horaires. Le tarif exact est ajusté dynamiquement selon la distance mensuelle.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3 lg:gap-8 items-stretch">
            {PERSONAL_DRIVER_PLAN_IDS.map((planId) => {
              const plan = plans[planId];
              return (
              <PersonalDriverPlanCard key={plan.id} plan={plan} />
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
