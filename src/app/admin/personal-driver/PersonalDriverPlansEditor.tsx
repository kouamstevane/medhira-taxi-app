'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { functions } from '@/config/firebase';
import { getPersonalDriverPlans } from '@/services/personal-driver/plan-config.service';
import { PERSONAL_DRIVER_PLAN_IDS, PERSONAL_DRIVER_PLANS } from '@/services/personal-driver/plans';
import type {
  PersonalDriverPlan,
  PersonalDriverPlanAudit,
  PersonalDriverPlanId,
  PersonalDriverWeekday,
} from '@/types/personal-driver';
import { getUserFacingCallableError } from '@/utils/callable-error';

type PlanDrafts = Record<PersonalDriverPlanId, PersonalDriverPlan>;
type PlanErrors = Partial<Record<keyof PersonalDriverPlan | 'form', string>>;
type PlanAudit = PersonalDriverPlanAudit;
type PlansAuditMap = Partial<Record<PersonalDriverPlanId, PersonalDriverPlanAudit>>;

const weekdays: Array<{ id: PersonalDriverWeekday; label: string }> = [
  { id: 1, label: 'Lundi' },
  { id: 2, label: 'Mardi' },
  { id: 3, label: 'Mercredi' },
  { id: 4, label: 'Jeudi' },
  { id: 5, label: 'Vendredi' },
  { id: 6, label: 'Samedi' },
  { id: 0, label: 'Dimanche' },
];

const textFields: Array<{ key: 'name' | 'badge' | 'promise'; label: string; required?: boolean }> = [
  { key: 'name', label: 'Nom', required: true },
  { key: 'badge', label: 'Badge' },
  { key: 'promise', label: 'Promesse', required: true },
];

const numberFields: Array<{ key: 'pricePerKm' | 'minimumBillableKm' | 'minimumAmount' | 'includedRegularWaitMinutes' | 'includedSpecialTrips'; label: string; step: string }> = [
  { key: 'pricePerKm', label: 'Prix par km', step: '0.01' },
  { key: 'minimumBillableKm', label: 'Distance minimum facturable', step: '1' },
  { key: 'minimumAmount', label: 'Montant minimum', step: '0.01' },
  { key: 'includedRegularWaitMinutes', label: 'Minutes d’attente incluses', step: '1' },
  { key: 'includedSpecialTrips', label: 'Trajets spéciaux inclus', step: '1' },
];

function clonePlan(plan: PersonalDriverPlan): PersonalDriverPlan {
  return {
    ...plan,
    allowedWeekdays: [...plan.allowedWeekdays],
    benefits: [...plan.benefits],
  };
}

function clonePlans(plans: PlanDrafts = PERSONAL_DRIVER_PLANS): PlanDrafts {
  return PERSONAL_DRIVER_PLAN_IDS.reduce((result, planId) => {
    result[planId] = clonePlan(plans[planId]);
    return result;
  }, {} as PlanDrafts);
}

function getPlanAudit(plan: PersonalDriverPlan): PlanAudit {
  const candidate = plan as PersonalDriverPlan & PersonalDriverPlanAudit;
  return {
    updatedAt: candidate.updatedAt,
    updatedBy: candidate.updatedBy,
  };
}

function getAuditMap(result: Awaited<ReturnType<typeof getPersonalDriverPlans>>): PlansAuditMap {
  return PERSONAL_DRIVER_PLAN_IDS.reduce((audit, planId) => {
    audit[planId] = result.audit?.[planId] ?? getPlanAudit(result.plans[planId]);
    return audit;
  }, {} as PlansAuditMap);
}

function normalizePlan(plan: PersonalDriverPlan): PersonalDriverPlan {
  return {
    ...plan,
    name: plan.name.trim(),
    badge: plan.badge?.trim() || undefined,
    promise: plan.promise.trim(),
    allowedWeekdays: [...plan.allowedWeekdays].sort((a, b) => a - b),
    benefits: plan.benefits.map((benefit) => benefit.trim()),
  };
}

function plansMatch(left: PersonalDriverPlan, right: PersonalDriverPlan): boolean {
  return JSON.stringify(normalizePlan(left)) === JSON.stringify(normalizePlan(right));
}

function isIntegerField(key: keyof PersonalDriverPlan): boolean {
  return key === 'minimumBillableKm'
    || key === 'includedRegularWaitMinutes'
    || key === 'includedSpecialTrips';
}

function formatAuditDate(value: PlanAudit['updatedAt']): string {
  let date: Date | null = null;
  if (value instanceof Date) {
    date = value;
  } else if (typeof value === 'string') {
    date = new Date(value);
  } else if (value && typeof value === 'object' && typeof value.toDate === 'function') {
    date = value.toDate();
  }

  if (!date || !Number.isFinite(date.getTime())) {
    return 'Non encore enregistrée';
  }

  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

function validatePlan(plan: PersonalDriverPlan): PlanErrors {
  const errors: PlanErrors = {};

  if (!plan.name.trim()) errors.name = 'Le nom est obligatoire.';
  if (plan.name.trim().length > 80) errors.name = 'Le nom doit contenir 80 caractères maximum.';
  if (plan.badge && plan.badge.trim().length > 80) errors.badge = 'Le badge doit contenir 80 caractères maximum.';
  if (!plan.promise.trim()) errors.promise = 'La promesse est obligatoire.';
  if (plan.promise.trim().length > 200) errors.promise = 'La promesse doit contenir 200 caractères maximum.';

  for (const field of numberFields) {
    const value = plan[field.key];
    if (!Number.isFinite(value)) {
      errors[field.key] = `${field.label} doit être renseigné.`;
    } else if (value < 0) {
      errors[field.key] = `${field.label} doit être positif.`;
    } else if (isIntegerField(field.key) && !Number.isInteger(value)) {
      errors[field.key] = `${field.label} doit être un nombre entier.`;
    }
  }

  if (plan.minimumBillableKm <= 0) {
    errors.minimumBillableKm = 'La distance minimum facturable doit être supérieure à 0.';
  } else if (plan.minimumBillableKm > 100000) {
    errors.minimumBillableKm = 'La distance minimum facturable doit rester inférieure ou égale à 100000.';
  }
  if (plan.pricePerKm > 1000) errors.pricePerKm = 'Le prix par km doit rester inférieur ou égal à 1000.';
  if (plan.minimumAmount > 1000000) errors.minimumAmount = 'Le montant minimum doit rester inférieur ou égal à 1000000.';
  if (plan.includedRegularWaitMinutes > 1440) errors.includedRegularWaitMinutes = 'Les minutes d’attente incluses doivent rester inférieures ou égales à 1440.';
  if (plan.includedSpecialTrips > 100) errors.includedSpecialTrips = 'Les trajets spéciaux inclus doivent rester inférieurs ou égaux à 100.';

  if (plan.allowedWeekdays.length === 0) {
    errors.allowedWeekdays = 'Sélectionnez au moins un jour de service.';
  }

  const benefits = plan.benefits.map((benefit) => benefit.trim());
  if (benefits.length === 0) {
    errors.benefits = 'Ajoutez au moins un avantage.';
  } else if (benefits.length > 12) {
    errors.benefits = 'Le forfait doit contenir 12 avantages maximum.';
  } else if (benefits.some((benefit) => !benefit)) {
    errors.benefits = 'Chaque avantage doit être renseigné.';
  } else if (benefits.some((benefit) => benefit.length > 200)) {
    errors.benefits = 'Chaque avantage doit contenir 200 caractères maximum.';
  }

  return errors;
}

export function PersonalDriverPlansEditor() {
  const [drafts, setDrafts] = useState<PlanDrafts>(() => clonePlans());
  const [savedPlans, setSavedPlans] = useState<PlanDrafts>(() => clonePlans());
  const [audit, setAudit] = useState<PlansAuditMap>({});
  const [loading, setLoading] = useState(true);
  const [savingPlanId, setSavingPlanId] = useState<PersonalDriverPlanId | null>(null);
  const [errors, setErrors] = useState<Partial<Record<PersonalDriverPlanId, PlanErrors>>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [syncWarning, setSyncWarning] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function loadPlans(
    showLoading = true,
    options?: {
      preserveCurrentStateOnError?: boolean;
      planId?: PersonalDriverPlanId;
      normalizedPlan?: PersonalDriverPlan;
    },
  ) {
    if (showLoading) {
      setLoading(true);
    }
    setLoadError(null);
    setSyncWarning(null);

    try {
      const result = await getPersonalDriverPlans();
      if (result.error && options?.preserveCurrentStateOnError) {
        const { planId, normalizedPlan } = options;
        if (!planId || !normalizedPlan) {
          return;
        }

        setDrafts((current) => ({
          ...current,
          [planId]: clonePlan(normalizedPlan),
        }));
        setSavedPlans((current) => ({
          ...current,
          [planId]: clonePlan(normalizedPlan),
        }));
        setSyncWarning('La synchronisation avec Firestore a échoué après l’enregistrement. Le forfait enregistré a été conservé.');
        return;
      }
      const nextPlans = clonePlans(result.plans);
      setDrafts(nextPlans);
      setSavedPlans(clonePlans(result.plans));
      setAudit(getAuditMap(result));
      if (result.error) {
        setLoadError('Les forfaits par défaut sont affichés car le catalogue n’a pas pu être chargé.');
      }
    } catch (error: unknown) {
      setLoadError(`Impossible de charger les forfaits : ${getUserFacingCallableError(error)}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPlans();
  }, []);

  const changedPlanIds = useMemo(() => PERSONAL_DRIVER_PLAN_IDS.filter(
    (planId) => !plansMatch(drafts[planId], savedPlans[planId]),
  ), [drafts, savedPlans]);

  const updatePlan = <Key extends keyof PersonalDriverPlan>(
    planId: PersonalDriverPlanId,
    key: Key,
    value: PersonalDriverPlan[Key],
  ) => {
    setDrafts((current) => ({
      ...current,
      [planId]: {
        ...current[planId],
        [key]: value,
      },
    }));
    setErrors((current) => ({
      ...current,
      [planId]: {
        ...current[planId],
        [key]: undefined,
        form: undefined,
      },
    }));
    setSyncWarning(null);
    setStatus(null);
  };

  const updateBenefit = (planId: PersonalDriverPlanId, index: number, value: string) => {
    const benefits = [...drafts[planId].benefits];
    benefits[index] = value;
    updatePlan(planId, 'benefits', benefits);
  };

  const addBenefit = (planId: PersonalDriverPlanId) => {
    updatePlan(planId, 'benefits', [...drafts[planId].benefits, '']);
  };

  const removeBenefit = (planId: PersonalDriverPlanId, index: number) => {
    updatePlan(planId, 'benefits', drafts[planId].benefits.filter((_, benefitIndex) => benefitIndex !== index));
  };

  const toggleWeekday = (planId: PersonalDriverPlanId, weekday: PersonalDriverWeekday) => {
    const allowedWeekdays = drafts[planId].allowedWeekdays.includes(weekday)
      ? drafts[planId].allowedWeekdays.filter((current) => current !== weekday)
      : [...drafts[planId].allowedWeekdays, weekday];
    updatePlan(planId, 'allowedWeekdays', allowedWeekdays.sort((a, b) => a - b));
  };

  const resetPlan = (planId: PersonalDriverPlanId) => {
    setDrafts((current) => ({
      ...current,
      [planId]: clonePlan(PERSONAL_DRIVER_PLANS[planId]),
    }));
    setErrors((current) => ({ ...current, [planId]: {} }));
    setSyncWarning(null);
    setStatus(null);
  };

  const savePlan = async (planId: PersonalDriverPlanId) => {
    const plan = drafts[planId];
    const validationErrors = validatePlan(plan);
    if (Object.values(validationErrors).some(Boolean)) {
      setErrors((current) => ({ ...current, [planId]: validationErrors }));
      return;
    }

    const normalizedPlan = normalizePlan(plan);
    setSavingPlanId(planId);
    setErrors((current) => ({ ...current, [planId]: {} }));
    setSyncWarning(null);
    setStatus(null);

    try {
      const callable = httpsCallable(functions, 'adminManagePersonalDriver');
      await callable({
        action: 'updatePlan',
        plan: normalizedPlan,
      });
      await loadPlans(false, {
        preserveCurrentStateOnError: true,
        planId,
        normalizedPlan,
      });
      setStatus(`Forfait ${normalizedPlan.name} enregistré.`);
    } catch (error: unknown) {
      setErrors((current) => ({
        ...current,
        [planId]: {
          ...current[planId],
          form: getUserFacingCallableError(error),
        },
      }));
    } finally {
      setSavingPlanId(null);
    }
  };

  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-5" aria-labelledby="personal-driver-plans-editor-title">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="personal-driver-plans-editor-title" className="flex items-center gap-2 text-sm font-bold text-white">
            <MaterialIcon name="edit_note" size="sm" className="text-primary" />
            Forfaits Personal Driver
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            Ajustez le catalogue utilisé pour les devis clients et les nouvelles réservations.
          </p>
        </div>
        {loading && <p className="text-xs font-semibold text-slate-300">Chargement des forfaits...</p>}
      </div>

      {loadError && (
        <div role="alert" className="mb-4 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-xs font-semibold text-amber-100">
          {loadError}
        </div>
      )}
      {status && (
        <div role="status" className="mb-4 rounded-lg border border-primary/30 bg-primary/10 p-3 text-xs font-semibold text-primary">
          {status}
        </div>
      )}
      {syncWarning && (
        <div role="status" className="mb-4 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-xs font-semibold text-amber-100">
          {syncWarning}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        {PERSONAL_DRIVER_PLAN_IDS.map((planId) => {
          const plan = drafts[planId];
          const planErrors = errors[planId] ?? {};
          const isSaving = savingPlanId === planId;
          const isChanged = changedPlanIds.includes(planId);

          return (
            <article
              key={planId}
              role="group"
              aria-label={`Forfait ${plan.name || savedPlans[planId].name}`}
              className="rounded-xl border border-white/10 bg-black/10 p-4"
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-black text-white">{plan.name || savedPlans[planId].name}</h3>
                  <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">{planId}</p>
                </div>
                <span className="rounded-md border border-white/10 px-2 py-1 text-[11px] font-semibold text-slate-300">
                  {isChanged ? 'Brouillon' : 'Publié'}
                </span>
              </div>

              {planErrors.form && (
                <div role="alert" className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs font-semibold text-red-200">
                  {planErrors.form}
                </div>
              )}

              <div className="space-y-3">
                {textFields.map((field) => (
                  <label key={field.key} className="block text-xs font-semibold text-slate-300">
                    {field.label}
                    <input
                      aria-label={field.label}
                      value={plan[field.key] ?? ''}
                      onChange={(event) => updatePlan(planId, field.key, event.target.value)}
                      className="mt-1 min-h-10 w-full rounded-lg border border-white/10 bg-card px-3 text-xs text-white outline-none focus:border-primary"
                    />
                    {planErrors[field.key] && (
                      <span role="alert" className="mt-1 block text-[11px] text-red-200">{planErrors[field.key]}</span>
                    )}
                  </label>
                ))}

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  {numberFields.map((field) => {
                    const value = plan[field.key];
                    return (
                      <label key={field.key} className="block text-xs font-semibold text-slate-300">
                        {field.label}
                        <input
                          aria-label={field.label}
                          type="number"
                          step={field.step}
                          min="0"
                          value={Number.isNaN(value) ? '' : value}
                          onChange={(event) => updatePlan(
                            planId,
                            field.key,
                            event.target.value === '' ? Number.NaN : Number(event.target.value),
                          )}
                          className="mt-1 min-h-10 w-full rounded-lg border border-white/10 bg-card px-3 text-xs text-white outline-none focus:border-primary"
                        />
                        {planErrors[field.key] && (
                          <span role="alert" className="mt-1 block text-[11px] text-red-200">{planErrors[field.key]}</span>
                        )}
                      </label>
                    );
                  })}
                </div>

                <fieldset className="rounded-lg border border-white/10 p-3">
                  <legend className="px-1 text-xs font-semibold text-slate-300">Jours autorisés</legend>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {weekdays.map((weekday) => (
                      <label key={weekday.id} className="flex min-h-8 items-center gap-2 text-xs text-slate-300">
                        <input
                          type="checkbox"
                          checked={plan.allowedWeekdays.includes(weekday.id)}
                          onChange={() => toggleWeekday(planId, weekday.id)}
                          className="h-4 w-4 rounded border-white/20 bg-card text-primary"
                        />
                        {weekday.label}
                      </label>
                    ))}
                  </div>
                  {planErrors.allowedWeekdays && (
                    <p role="alert" className="mt-2 text-[11px] text-red-200">{planErrors.allowedWeekdays}</p>
                  )}
                </fieldset>

                <fieldset className="rounded-lg border border-white/10 p-3">
                  <legend className="px-1 text-xs font-semibold text-slate-300">Avantages</legend>
                  <div className="mt-2 space-y-2">
                    {plan.benefits.map((benefit, index) => (
                      <div key={`${planId}-benefit-${index}`} className="flex items-center gap-2">
                        <input
                          aria-label={`Avantage ${index + 1}`}
                          value={benefit}
                          onChange={(event) => updateBenefit(planId, index, event.target.value)}
                          className="min-h-10 w-full rounded-lg border border-white/10 bg-card px-3 text-xs text-white outline-none focus:border-primary"
                        />
                        <button
                          type="button"
                          onClick={() => removeBenefit(planId, index)}
                          disabled={plan.benefits.length <= 1}
                          className="inline-flex min-h-10 shrink-0 items-center rounded-lg border border-white/10 px-3 text-xs font-semibold text-slate-300 disabled:opacity-50"
                        >
                          Supprimer l’avantage {index + 1}
                        </button>
                      </div>
                    ))}
                  </div>
                  {planErrors.benefits && (
                    <p role="alert" className="mt-2 text-[11px] text-red-200">{planErrors.benefits}</p>
                  )}
                  <button
                    type="button"
                    onClick={() => addBenefit(planId)}
                    disabled={plan.benefits.length >= 12}
                    className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/10 px-3 text-xs font-semibold text-slate-300 disabled:opacity-50"
                  >
                    <MaterialIcon name="add" size="sm" />
                    Ajouter un avantage {plan.name || savedPlans[planId].name}
                  </button>
                </fieldset>

                <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-[11px] text-slate-400">
                  <p>Dernière modification : <span className="font-semibold text-slate-200">{formatAuditDate(audit[planId]?.updatedAt)}</span></p>
                  <p className="mt-1">Modifié par : <span className="font-semibold text-slate-200">{audit[planId]?.updatedBy || 'Non renseigné'}</span></p>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => resetPlan(planId)}
                    disabled={!isChanged || isSaving}
                    className="min-h-10 rounded-lg border border-white/10 px-3 text-xs font-semibold text-slate-300 disabled:opacity-50"
                  >
                    Réinitialiser {plan.name || savedPlans[planId].name}
                  </button>
                  <button
                    type="button"
                    onClick={() => void savePlan(planId)}
                    disabled={!isChanged || isSaving}
                    className="min-h-10 rounded-lg bg-primary px-4 text-xs font-bold text-white transition hover:bg-primary/90 disabled:opacity-50"
                  >
                    {isSaving ? 'Enregistrement...' : `Enregistrer ${plan.name || savedPlans[planId].name}`}
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
