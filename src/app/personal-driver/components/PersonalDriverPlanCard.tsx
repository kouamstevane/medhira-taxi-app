import Link from 'next/link';
import type { PersonalDriverPlan } from '@/types/personal-driver';

interface PersonalDriverPlanCardProps {
  readonly plan: PersonalDriverPlan;
}

const planLabels: Partial<Record<PersonalDriverPlan['id'], string>> = {
  classic: 'LE PLUS POPULAIRE',
  premium: 'SERVICE PRIORITAIRE',
};

export function PersonalDriverPlanCard({ plan }: PersonalDriverPlanCardProps) {
  const benefits = [
    ...plan.benefits,
    `${plan.includedRegularWaitMinutes} min d'attente incluses`,
  ];
  const badge = planLabels[plan.id];

  return (
    <article className={`bg-card p-5 rounded-2xl border shadow-lg flex flex-col ${
      plan.id === 'classic' ? 'border-primary/50' : 'border-white/5'
    }`}>
      <div className="min-h-6 mb-3">
        {badge && (
          <span className="inline-flex rounded-full bg-primary/15 px-3 py-1 text-[10px] font-bold text-primary">
            {badge}
          </span>
        )}
      </div>
      <h2 className="text-xl font-bold text-white">{plan.name}</h2>
      <p className="mt-1 min-h-10 text-sm text-slate-400">{plan.promise}</p>

      <div className="mt-5 border-y border-white/5 py-4">
        <p className="text-sm text-slate-400">A partir de</p>
        <p className="mt-1 text-2xl font-bold text-white">
          {plan.minimumAmount.toLocaleString('fr-FR')} $<span className="text-sm font-medium text-slate-400">/mois</span>
        </p>
        <p className="mt-1 text-sm font-medium text-primary">
          {plan.pricePerKm.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} $/km
        </p>
      </div>

      <ul className="mt-5 space-y-3 text-sm text-slate-300">
        {benefits.map((benefit) => (
          <li key={benefit} className="flex items-start gap-2">
            <span className="mt-0.5 text-primary" aria-hidden="true">check_circle</span>
            <span>{benefit}</span>
          </li>
        ))}
      </ul>

      <Link
        href={`/personal-driver/configurer?plan=${plan.id}`}
        aria-label={`Choisir ${plan.name}`}
        className="mt-6 flex min-h-12 items-center justify-center rounded-xl bg-primary px-4 text-sm font-bold text-white transition-transform active:scale-[0.98]"
      >
        Choisir ce plan
      </Link>
    </article>
  );
}
