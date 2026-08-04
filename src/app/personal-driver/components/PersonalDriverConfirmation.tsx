'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { PERSONAL_DRIVER_PLANS } from '@/services/personal-driver/plans';
import {
  createPersonalDriverSubscriptionPayment,
  type CreatePersonalDriverSubscriptionPaymentResult,
} from '@/services/personal-driver/subscription.service';
import type {
  PersonalDriverPlanId,
  PersonalDriverPlanPrice,
  PersonalDriverPriceComparison,
  PersonalDriverWeekday,
} from '@/types/personal-driver';
import {
  PERSONAL_DRIVER_CONFIG_SESSION_KEY,
  type PersonalDriverConfiguration,
} from './PersonalDriverConfigurator';
import { PERSONAL_DRIVER_ESTIMATE_SESSION_KEY } from './PersonalDriverEstimate';

const StripePaymentElement = dynamic(
  () => import('@/components/stripe/StripePaymentElement').then((module) => ({ default: module.StripePaymentElement })),
  { ssr: false, loading: () => <div className="h-52 rounded-xl border border-white/10 bg-white/5" /> },
);

const WEEKDAY_NAMES: Record<PersonalDriverWeekday, string> = {
  0: 'Dimanche',
  1: 'Lundi',
  2: 'Mardi',
  3: 'Mercredi',
  4: 'Jeudi',
  5: 'Vendredi',
  6: 'Samedi',
};

interface PersonalDriverEstimateSession {
  version: 1;
  requestId: string;
  selectedPlanId: PersonalDriverPlanId;
  recommendedPlanId: PersonalDriverPlanId;
  monthlyDistanceKm: number;
  selectedPlan: PersonalDriverPlanPrice;
  comparison: PersonalDriverPriceComparison;
  configuration: PersonalDriverConfiguration;
}

function isPlanId(value: unknown): value is PersonalDriverPlanId {
  return value === 'basic' || value === 'classic' || value === 'premium';
}

function isWeekday(value: unknown): value is PersonalDriverWeekday {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 6;
}

function parseConfiguration(value: unknown): PersonalDriverConfiguration | null {
  if (!value || typeof value !== 'object') return null;
  const config = value as Partial<PersonalDriverConfiguration>;
  if (
    config.version !== 1
    || typeof config.requestId !== 'string'
    || !config.requestId
    || !isPlanId(config.planId)
    || typeof config.pickupAddress !== 'string'
    || typeof config.destinationAddress !== 'string'
    || (config.tripType !== 'one_way' && config.tripType !== 'round_trip')
    || !Array.isArray(config.weekdays)
    || !config.weekdays.every(isWeekday)
    || typeof config.departureTime !== 'string'
    || typeof config.startDate !== 'string'
    || typeof config.distanceOneWayKm !== 'number'
    || typeof config.monthlyDistanceKm !== 'number'
    || typeof config.passengerCount !== 'number'
  ) {
    return null;
  }
  if (config.tripType === 'round_trip' && (typeof config.returnTime !== 'string' || typeof config.distanceReturnKm !== 'number')) {
    return null;
  }
  return config as PersonalDriverConfiguration;
}

function parseEstimate(value: unknown): PersonalDriverEstimateSession | null {
  if (!value || typeof value !== 'object') return null;
  const estimate = value as Partial<PersonalDriverEstimateSession>;
  if (
    estimate.version !== 1
    || typeof estimate.requestId !== 'string'
    || !isPlanId(estimate.selectedPlanId)
    || !isPlanId(estimate.recommendedPlanId)
    || typeof estimate.monthlyDistanceKm !== 'number'
    || !estimate.selectedPlan
    || !estimate.comparison
    || !estimate.configuration
  ) {
    return null;
  }
  return estimate as PersonalDriverEstimateSession;
}

function formatCad(amount: number): string {
  return `${amount.toLocaleString('fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
}

function formatKm(distanceKm: number): string {
  return distanceKm.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
}

function getStoredCheckout(): { config: PersonalDriverConfiguration; estimate: PersonalDriverEstimateSession } | null {
  const rawConfig = sessionStorage.getItem(PERSONAL_DRIVER_CONFIG_SESSION_KEY);
  const rawEstimate = sessionStorage.getItem(PERSONAL_DRIVER_ESTIMATE_SESSION_KEY);
  const config = parseConfiguration(rawConfig ? JSON.parse(rawConfig) : null);
  const estimate = parseEstimate(rawEstimate ? JSON.parse(rawEstimate) : null);
  if (!config || !estimate || config.requestId !== estimate.requestId) return null;
  return { config, estimate };
}

export function PersonalDriverConfirmation() {
  const router = useRouter();
  const [checkout, setCheckout] = useState<{ config: PersonalDriverConfiguration; estimate: PersonalDriverEstimateSession } | null>(null);
  const [payment, setPayment] = useState<CreatePersonalDriverSubscriptionPaymentResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      setCheckout(getStoredCheckout());
    } catch {
      setCheckout(null);
    }
  }, []);

  const selectedPlanId = checkout?.estimate.selectedPlanId;
  const plan = selectedPlanId ? PERSONAL_DRIVER_PLANS[selectedPlanId] : null;
  const selectedPrice = selectedPlanId ? checkout?.estimate.comparison.plans[selectedPlanId] : null;
  const formattedDays = useMemo(
    () => checkout?.config.weekdays.map((day) => WEEKDAY_NAMES[day]).join(', ') ?? '',
    [checkout],
  );

  const preparePayment = async () => {
    if (!checkout || !selectedPlanId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await createPersonalDriverSubscriptionPayment({
        selectedPlanId,
        requestId: checkout.config.requestId,
        pickupAddress: checkout.config.pickupAddress,
        destinationAddress: checkout.config.destinationAddress,
        tripType: checkout.config.tripType,
        selectedWeekdays: checkout.config.weekdays,
        departureTime: checkout.config.departureTime,
        returnTime: checkout.config.returnTime,
        startDate: checkout.config.startDate,
        distanceOneWayKm: checkout.config.distanceOneWayKm,
        distanceReturnKm: checkout.config.distanceReturnKm ?? 0,
        monthlyDistanceKm: checkout.config.monthlyDistanceKm,
        passengerCount: checkout.config.passengerCount,
        notes: checkout.config.notes,
      });
      setPayment(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de préparer le paiement.');
    } finally {
      setLoading(false);
    }
  };

  if (!checkout || !plan || !selectedPrice) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-2xl items-center px-4 text-center text-slate-100">
        <div className="w-full space-y-4 rounded-xl border border-white/10 bg-card p-6">
          <h1 className="text-2xl font-bold text-white">Résumé introuvable</h1>
          <p className="text-sm text-slate-400">Reprenez la configuration de votre transport mensuel pour confirmer votre abonnement.</p>
          <button
            type="button"
            onClick={() => router.push('/personal-driver')}
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-bold text-white"
          >
            Configurer mon transport mensuel
          </button>
        </div>
      </main>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5 p-4 text-slate-100 sm:p-6">
      <section className="rounded-xl border border-white/10 bg-card p-5 shadow-xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-primary">Résumé de votre abonnement</p>
            <h1 className="mt-1 text-2xl font-black text-white">{plan.name.toUpperCase()}</h1>
            <p className="mt-1 text-sm text-slate-400">Période de 30 jours calendaires glissants</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-black text-white">{formatCad(selectedPrice.totalBeforeTax)}</p>
            <p className="text-xs text-slate-400">avant taxes</p>
          </div>
        </div>

        {error && (
          <div className="mb-5 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300" role="alert">
            {error}
          </div>
        )}

        <div className="space-y-5 text-sm">
          <div className="rounded-lg border border-white/10 bg-white/5 p-4">
            <h2 className="mb-3 text-base font-bold text-white">Trajet planifié</h2>
            <dl className="space-y-2 text-slate-300">
              <div className="flex gap-3"><dt className="w-24 shrink-0 text-slate-400">Départ</dt><dd>{checkout.config.pickupAddress}</dd></div>
              <div className="flex gap-3"><dt className="w-24 shrink-0 text-slate-400">Destination</dt><dd>{checkout.config.destinationAddress}</dd></div>
              <div className="flex gap-3"><dt className="w-24 shrink-0 text-slate-400">Type</dt><dd>{checkout.config.tripType === 'round_trip' ? 'Aller-retour' : 'Aller simple'}</dd></div>
              <div className="flex gap-3"><dt className="w-24 shrink-0 text-slate-400">Jours</dt><dd>{formattedDays}</dd></div>
              <div className="flex gap-3">
                <dt className="w-24 shrink-0 text-slate-400">Heures</dt>
                <dd>{checkout.config.departureTime}{checkout.config.returnTime ? ` et ${checkout.config.returnTime}` : ''}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-lg border border-white/10 bg-white/5 p-4">
            <h2 className="mb-3 text-base font-bold text-white">Calcul du tarif</h2>
            <div className="space-y-2 text-slate-300">
              <div className="flex justify-between gap-4"><span>Kilométrage estimé</span><strong className="text-white">{formatKm(checkout.config.monthlyDistanceKm)} km</strong></div>
              <div className="flex justify-between gap-4"><span>Formule</span><strong className="text-white">{formatKm(checkout.config.monthlyDistanceKm)} km x {selectedPrice.pricePerKm.toLocaleString('fr-FR')} $/km</strong></div>
              {selectedPrice.minimumApplied && (
                <div className="flex justify-between gap-4"><span>Minimum appliqué</span><strong className="text-white">{formatCad(selectedPrice.minimumAmount)}</strong></div>
              )}
              <div className="flex justify-between gap-4 border-t border-white/10 pt-2"><span>Sous-total</span><strong className="text-white">{formatCad(selectedPrice.totalBeforeTax)}</strong></div>
              <div className="flex justify-between gap-4"><span>Taxes</span><span className="text-slate-400">À confirmer — aucun taux appliqué</span></div>
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-white/5 p-4">
            <h2 className="mb-3 text-base font-bold text-white">Inclus dans votre formule</h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {plan.benefits.map((benefit) => (
                <li key={benefit} className="flex items-center gap-2 text-slate-300">
                  <MaterialIcon name="check_circle" size="sm" className="text-emerald-400" />
                  <span>{benefit}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-white/10 bg-card p-5 shadow-xl">
        {!payment ? (
          <button
            type="button"
            onClick={preparePayment}
            disabled={loading}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-white transition active:scale-[0.98] disabled:opacity-60"
          >
            <MaterialIcon name="lock" size="sm" />
            {loading ? 'Préparation...' : 'Préparer le paiement sécurisé'}
          </button>
        ) : (
          <StripePaymentElement
            clientSecret={payment.clientSecret}
            amount={payment.amount}
            currency={payment.currency}
            onSuccess={() => router.push(`/personal-driver/dashboard?payment=success&subscriptionId=${payment.subscriptionId}`)}
            onError={setError}
            submitLabel={`Payer ${formatCad(payment.amount)}`}
          />
        )}
      </section>
    </div>
  );
}
