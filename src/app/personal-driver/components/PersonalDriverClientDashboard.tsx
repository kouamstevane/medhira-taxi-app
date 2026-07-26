'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { PERSONAL_DRIVER_PLANS } from '@/services/personal-driver/plans';
import {
  getCurrentPersonalDriverSubscription,
  getPersonalDriverTripsForSubscription,
} from '@/services/personal-driver/subscription.service';
import type {
  PersonalDriverSubscription,
  PersonalDriverTrip,
} from '@/types/personal-driver';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending_payment: { label: 'Paiement en attente', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
  pending_validation: { label: 'En attente de validation', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' },
  active: { label: 'Actif', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' },
  cancelled: { label: 'Annulé', color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300' },
  expired: { label: 'Expiré', color: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' },
};

export function PersonalDriverClientDashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<PersonalDriverSubscription | null>(null);
  const [trips, setTrips] = useState<PersonalDriverTrip[]>([]);

  useEffect(() => {
    async function loadData() {
      if (!user?.uid) {
        setLoading(false);
        return;
      }
      try {
        const sub = await getCurrentPersonalDriverSubscription(user.uid);
        setSubscription(sub);
        if (sub?.id) {
          const tripList = await getPersonalDriverTripsForSubscription(sub.id);
          setTrips(tripList);
        }
      } catch (err) {
        console.error('Erreur chargement abonnement:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [user?.uid]);

  if (loading) {
    return (
      <div className="p-8 text-center text-gray-500 dark:text-gray-400">
        Chargement de votre abonnement...
      </div>
    );
  }

  if (!subscription) {
    return (
      <div className="max-w-xl mx-auto my-12 p-8 text-center bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">
          Aucun abonnement Personal Driver actif
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          Planifiez vos déplacements réguliers et maîtrisez vos coûts mensuels à l'avance.
        </p>
        <Link
          href="/personal-driver"
          className="inline-flex items-center justify-center py-3 px-6 rounded-xl font-bold text-white bg-amber-600 hover:bg-amber-500 transition-all min-h-[44px]"
        >
          Configurer mon transport mensuel
        </Link>
      </div>
    );
  }

  const planInfo = PERSONAL_DRIVER_PLANS[subscription.selectedPlanId] || PERSONAL_DRIVER_PLANS.classic;
  const statusInfo = STATUS_LABELS[subscription.status] || STATUS_LABELS.pending_validation;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Carte Résumé Abonnement */}
      <div className="p-6 bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Abonnement Mensuel
            </span>
            <h1 className="text-2xl font-black text-gray-900 dark:text-white">
              Mon Personal Driver
            </h1>
          </div>
          <span className={`px-3 py-1.5 rounded-full text-xs font-bold ${statusInfo.color}`}>
            {statusInfo.label}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-xl bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800">
          <div>
            <span className="text-xs text-gray-400 block">Forfait</span>
            <span className="font-bold text-gray-900 dark:text-white uppercase">{planInfo.name}</span>
          </div>
          <div>
            <span className="text-xs text-gray-400 block">Kilométrage planifié</span>
            <span className="font-bold text-gray-900 dark:text-white">{subscription.monthlyDistanceKm} km</span>
          </div>
          <div>
            <span className="text-xs text-gray-400 block">Trajets prévus</span>
            <span className="font-bold text-gray-900 dark:text-white">{trips.length} missions</span>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 space-y-2 text-sm text-gray-600 dark:text-gray-300">
          <div className="flex items-start gap-2">
            <span className="font-medium text-gray-900 dark:text-white min-w-20">Départ:</span>
            <span>{subscription.pickupAddress}</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="font-medium text-gray-900 dark:text-white min-w-20">Destination:</span>
            <span>{subscription.destinationAddress}</span>
          </div>
        </div>
      </div>

      {/* Trajets / Calendrier */}
      <div className="p-6 bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
          Calendrier des 30 jours ({trips.length} trajets)
        </h2>

        {trips.length === 0 ? (
          <p className="text-sm text-gray-500">Aucun trajet généré pour le moment.</p>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
            {trips.map((trip) => {
              const dateObj = new Date(trip.scheduledAtIso);
              const dateStr = dateObj.toLocaleDateString('fr-FR', {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
              });
              const timeStr = dateObj.toLocaleTimeString('fr-FR', {
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <div
                  key={trip.id}
                  className="p-3.5 rounded-xl bg-gray-50 dark:bg-gray-800/40 flex items-center justify-between gap-4 text-sm border border-gray-100 dark:border-gray-800"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-gray-900 dark:text-white capitalize min-w-24">
                      {dateStr} - {timeStr}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded bg-gray-200 dark:bg-gray-700 font-medium">
                      {trip.direction === 'outbound' ? 'Aller' : 'Retour'}
                    </span>
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {trip.pickupAddress} → {trip.destinationAddress}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
