import Link from 'next/link';
import type { PersonalDriverPlan } from '@/types/personal-driver';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { CURRENCY_CODE } from '@/utils/constants';

interface PersonalDriverPlanCardProps {
  readonly plan: PersonalDriverPlan;
}

const planLabels: Partial<Record<PersonalDriverPlan['id'], string>> = {
  classic: 'LE PLUS POPULAIRE',
  premium: 'SERVICE PRIORITAIRE',
};

export function PersonalDriverPlanCard({ plan }: PersonalDriverPlanCardProps) {
  const benefits = plan.benefits;
  const badge = (plan.badge ?? planLabels[plan.id])?.toLocaleUpperCase('fr-FR');
  const isClassic = plan.id === 'classic';
  const isPremium = plan.id === 'premium';

  return (
    <article
      className={`relative flex flex-col justify-between rounded-3xl p-6 transition-all duration-300 ${
        isClassic
          ? 'border border-primary/40 bg-gradient-to-b from-card/90 via-card/90 to-primary/5 backdrop-blur-md hover:border-primary/70 hover:shadow-xl'
          : isPremium
            ? 'border border-amber-500/30 bg-gradient-to-b from-card/90 via-card/90 to-amber-500/5 backdrop-blur-md hover:border-amber-500/50 hover:shadow-xl'
            : 'border border-white/10 bg-card/90 backdrop-blur-md hover:border-white/20 hover:shadow-xl'
      }`}
    >
      <div>
        <div className="flex items-center justify-between min-h-7 mb-2">
          {badge ? (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider ${
                isClassic
                  ? 'bg-primary/15 border border-primary/30 text-primary'
                  : 'bg-amber-400/15 border border-amber-400/30 text-amber-400'
              }`}
            >
              <MaterialIcon name={isClassic ? 'star' : 'workspace_premium'} size="sm" className="text-[14px]" />
              {badge}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 border border-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <MaterialIcon name="directions_car" size="sm" className="text-[14px] text-slate-400" />
              Formule Standard
            </span>
          )}
        </div>

        <h2 className="mt-2 text-2xl font-black text-white tracking-tight">{plan.name}</h2>
        <p className="mt-1 min-h-10 text-xs leading-5 text-slate-300">{plan.promise}</p>

        <div className="mt-5 rounded-2xl border border-white/5 bg-white/[0.03] p-4 backdrop-blur-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">À partir de</p>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-3xl font-black text-white">
              {plan.minimumAmount.toLocaleString('fr-FR')} {CURRENCY_CODE}
            </span>
            <span className="text-xs font-semibold text-slate-400">/ mois</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs border-t border-white/5 pt-2">
            <span className="text-slate-400">Tarif au km</span>
            <span className="font-bold text-primary">
              {plan.pricePerKm.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} {CURRENCY_CODE}/km
            </span>
          </div>
        </div>

        <ul className="mt-6 space-y-3 min-h-[120px] text-xs text-slate-200">
          {benefits.map((benefit) => (
            <li key={benefit} className="flex items-start gap-2.5">
              <MaterialIcon name="check_circle" size="sm" className="mt-0.5 text-[18px] text-primary shrink-0" />
              <span className="leading-5">{benefit}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-8">
        <Link
          href={`/personal-driver/configurer?plan=${plan.id}`}
          aria-label={`Choisir ${plan.name}`}
          className={`flex min-h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-extrabold tracking-wide transition-all active:scale-[0.97] ${
            isClassic
              ? 'bg-primary text-black shadow-md hover:brightness-110'
              : isPremium
                ? 'bg-gradient-to-r from-amber-400 via-amber-500 to-yellow-500 text-black shadow-lg shadow-amber-500/20 hover:brightness-110'
                : 'bg-white/10 text-white hover:bg-white/20 border border-white/15'
          }`}
        >
          <span>Choisir ce plan</span>
          <MaterialIcon name="arrow_forward" size="sm" />
        </Link>
      </div>
    </article>
  );
}
