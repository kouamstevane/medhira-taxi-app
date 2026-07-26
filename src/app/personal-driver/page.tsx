import Link from 'next/link';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { PERSONAL_DRIVER_PLANS } from '@/services/personal-driver/plans';
import { PersonalDriverPlanCard } from './components/PersonalDriverPlanCard';

const benefits = [
  { icon: 'calendar_month', text: 'Choisissez vos jours de déplacement' },
  { icon: 'schedule', text: 'Définissez vos horaires habituels' },
  { icon: 'repeat', text: 'Prévoyez des trajets aller simple ou aller-retour' },
  { icon: 'visibility', text: 'Connaissez votre prix avant le paiement' },
];

export default function PersonalDriverPage() {
  return (
    <div className="min-h-screen bg-background pb-10 text-slate-100">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-white/5 bg-background/80 px-4 py-4 backdrop-blur-xl">
        <Link
          href="/dashboard"
          aria-label="Retour au tableau de bord"
          className="flex size-10 items-center justify-center rounded-full bg-card text-white active:scale-95 transition-transform"
        >
          <MaterialIcon name="arrow_back" size="md" />
        </Link>
        <h1 className="text-lg font-bold text-white">Personal Driver</h1>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        <section className="mb-8">
          <p className="text-sm font-semibold text-primary">TRANSPORT REGULIER</p>
          <h2 className="mt-2 text-2xl font-bold text-white">Votre chauffeur pour vos déplacements du mois</h2>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            Organisez vos trajets récurrents et retrouvez un budget clair avant de confirmer votre abonnement.
          </p>
        </section>

        <section className="mb-8 grid gap-3 sm:grid-cols-2" aria-label="Avantages du service">
          {benefits.map((benefit) => (
            <div key={benefit.icon} className="flex items-center gap-3 rounded-xl border border-white/5 bg-card p-4">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <MaterialIcon name={benefit.icon} size="md" className="text-primary" />
              </div>
              <p className="text-sm font-medium text-slate-300">{benefit.text}</p>
            </div>
          ))}
        </section>

        <section aria-labelledby="plan-heading">
          <div className="mb-4">
            <h2 id="plan-heading" className="text-xl font-bold text-white">Choisissez votre formule</h2>
            <p className="mt-1 text-sm text-slate-400">Le prix final est calculé selon vos jours et vos trajets.</p>
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
