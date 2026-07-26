'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PERSONAL_DRIVER_PLANS } from '@/services/personal-driver/plans';
import { createPersonalDriverSubscriptionPayment } from '@/services/personal-driver/subscription.service';
import type { PersonalDriverPlanId, PersonalDriverWeekday } from '@/types/personal-driver';

const WEEKDAY_NAMES: Record<PersonalDriverWeekday, string> = {
  0: 'Dimanche',
  1: 'Lundi',
  2: 'Mardi',
  3: 'Mercredi',
  4: 'Jeudi',
  5: 'Vendredi',
  6: 'Samedi',
};

export function PersonalDriverConfirmation() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<any>(null);
  const [estimate, setEstimate] = useState<any>(null);

  useEffect(() => {
    try {
      const storedConfig = sessionStorage.getItem('medjira.personalDriver.config.v1');
      const storedEstimate = sessionStorage.getItem('medjira.personalDriver.estimate.v1');
      if (storedConfig && storedEstimate) {
        setConfig(JSON.parse(storedConfig));
        setEstimate(JSON.parse(storedEstimate));
      }
    } catch {
      // Ignorer
    }
  }, []);

  if (!config || !estimate) {
    return (
      <div className="p-6 text-center text-gray-600 dark:text-gray-300">
        Chargement des détails de la réservation...
      </div>
    );
  }

  const planId: PersonalDriverPlanId = config.selectedPlanId || 'classic';
  const planInfo = PERSONAL_DRIVER_PLANS[planId];
  const planPrice = estimate.plans?.[planId];
  const totalBeforeTax = planPrice?.totalBeforeTax ?? planInfo.minimumAmount;

  const handlePay = async () => {
    setLoading(true);
    setError(null);
    try {
      const requestId = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      const result = await createPersonalDriverSubscriptionPayment({
        selectedPlanId: planId,
        requestId,
        pickupAddress: config.pickupAddress,
        destinationAddress: config.destinationAddress,
        tripType: config.tripType,
        selectedWeekdays: config.selectedWeekdays,
        departureTime: config.departureTime,
        returnTime: config.returnTime,
        startDate: config.startDate,
        distanceOneWayKm: config.distanceOneWayKm,
        distanceReturnKm: config.distanceReturnKm || 0,
        monthlyDistanceKm: config.monthlyDistanceKm,
        passengerCount: config.passengerCount || 1,
        notes: config.notes,
      });

      // Rediriger vers le tableau de bord client avec statut pending_validation
      router.push('/personal-driver/dashboard?created=true');
    } catch (err: any) {
      setError(err?.message || 'Une erreur est survenue lors de la création du paiement.');
    } finally {
      setLoading(false);
    }
  };

  const formattedDays = (config.selectedWeekdays || [])
    .map((d: PersonalDriverWeekday) => WEEKDAY_NAMES[d])
    .join(', ');

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 bg-white dark:bg-gray-900 shadow-xl rounded-2xl border border-gray-100 dark:border-gray-800">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
        Résumé de votre abonnement
      </h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Période de 30 jours calendaires glissants
      </p>

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300 border border-red-200 dark:border-red-900/50 text-sm">
          {error}
        </div>
      )}

      <div className="space-y-6 text-sm">
        {/* Forfait sélectionné */}
        <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 flex items-center justify-between border border-gray-200/50 dark:border-gray-700/50">
          <div>
            <span className="text-xs uppercase tracking-wider text-gray-400 font-semibold">Forfait</span>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white uppercase">{planInfo.name}</h2>
          </div>
          <div className="text-right">
            <span className="text-xl font-black text-amber-600 dark:text-amber-400">
              {totalBeforeTax.toFixed(2)} $
            </span>
            <span className="text-xs block text-gray-400">/ 30 jours</span>
          </div>
        </div>

        {/* Détails du trajet */}
        <div className="border-t border-gray-100 dark:border-gray-800 pt-4 space-y-3">
          <h3 className="font-semibold text-gray-800 dark:text-gray-200">Trajet planifié</h3>
          <div className="space-y-2 text-gray-600 dark:text-gray-300">
            <div className="flex items-start gap-2">
              <span className="font-medium text-gray-900 dark:text-white min-w-20">Départ:</span>
              <span>{config.pickupAddress}</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-medium text-gray-900 dark:text-white min-w-20">Destination:</span>
              <span>{config.destinationAddress}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-900 dark:text-white min-w-20">Type:</span>
              <span>{config.tripType === 'round_trip' ? 'Aller-retour' : 'Aller simple'}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-900 dark:text-white min-w-20">Jours:</span>
              <span>{formattedDays}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-900 dark:text-white min-w-20">Heures:</span>
              <span>
                {config.departureTime}
                {config.tripType === 'round_trip' && config.returnTime ? ` et ${config.returnTime}` : ''}
              </span>
            </div>
          </div>
        </div>

        {/* Détails du calcul */}
        <div className="border-t border-gray-100 dark:border-gray-800 pt-4 space-y-2">
          <h3 className="font-semibold text-gray-800 dark:text-gray-200">Calcul du tarif</h3>
          <div className="flex justify-between text-gray-600 dark:text-gray-300">
            <span>Kilométrage mensuel estimé:</span>
            <span className="font-semibold text-gray-900 dark:text-white">{config.monthlyDistanceKm} km</span>
          </div>
          <div className="flex justify-between text-gray-600 dark:text-gray-300">
            <span>Sous-total:</span>
            <span className="font-semibold text-gray-900 dark:text-white">{totalBeforeTax.toFixed(2)} $</span>
          </div>
          <div className="flex justify-between text-gray-600 dark:text-gray-300">
            <span>Taxes:</span>
            <span className="text-gray-500">Calculées au paiement</span>
          </div>
        </div>

        {/* Avantages inclus */}
        <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
          <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">Inclus dans votre formule :</h3>
          <ul className="space-y-1 text-xs text-gray-600 dark:text-gray-300">
            {planInfo.benefits.map((benefit, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="text-emerald-500 font-bold">✓</span> {benefit}
              </li>
            ))}
          </ul>
        </div>

        {/* Bouton d'action */}
        <div className="pt-4">
          <button
            onClick={handlePay}
            disabled={loading}
            className="w-full py-3.5 px-6 rounded-xl font-bold text-white bg-amber-600 hover:bg-amber-500 active:scale-[0.99] transition-all disabled:opacity-50 min-h-[44px]"
          >
            {loading ? 'Traitement en cours...' : 'Confirmer et payer'}
          </button>
        </div>
      </div>
    </div>
  );
}
