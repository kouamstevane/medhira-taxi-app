'use client';

import React, { useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';

export function PersonalDriverAdminPageClient() {
  const [subscriptionId, setSubscriptionId] = useState('');
  const [tripId, setTripId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleValidateSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subscriptionId.trim()) return;
    setLoading(true);
    setMessage(null);
    try {
      const functions = getFunctions(undefined, 'europe-west1');
      const callable = httpsCallable(functions, 'adminManagePersonalDriver');
      await callable({ action: 'validateSubscription', subscriptionId: subscriptionId.trim() });
      setMessage(`Abonnement ${subscriptionId} validé avec succès.`);
      setSubscriptionId('');
    } catch (err: any) {
      setMessage(`Erreur: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleAssignTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tripId.trim() || !driverId.trim() || !vehicleId.trim()) return;
    setLoading(true);
    setMessage(null);
    try {
      const functions = getFunctions(undefined, 'europe-west1');
      const callable = httpsCallable(functions, 'adminManagePersonalDriver');
      await callable({
        action: 'assignTrip',
        tripId: tripId.trim(),
        driverId: driverId.trim(),
        vehicleId: vehicleId.trim(),
      });
      setMessage(`Trajet ${tripId} attribué au chauffeur ${driverId}.`);
      setTripId('');
      setDriverId('');
      setVehicleId('');
    } catch (err: any) {
      setMessage(`Erreur: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 p-6 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Administration Personal Driver
        </h1>
        <p className="text-sm text-gray-500">Validation des abonnements et affectation des chauffeurs</p>
      </div>

      {message && (
        <div className="p-4 rounded-xl bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200 text-sm border border-blue-200 dark:border-blue-900">
          {message}
        </div>
      )}

      {/* Validation Abonnement */}
      <form onSubmit={handleValidateSubscription} className="p-5 rounded-xl bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800 space-y-4">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">Valider un abonnement</h2>
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="ID de l'abonnement"
            value={subscriptionId}
            onChange={(e) => setSubscriptionId(e.target.value)}
            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm"
          />
          <button
            type="submit"
            disabled={loading || !subscriptionId.trim()}
            className="px-6 py-2.5 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 min-h-[44px]"
          >
            Valider l'abonnement
          </button>
        </div>
      </form>

      {/* Affectation Chauffeur/Véhicule */}
      <form onSubmit={handleAssignTrip} className="p-5 rounded-xl bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800 space-y-4">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">Affecter un chauffeur à un trajet</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input
            type="text"
            placeholder="ID du trajet (Trip ID)"
            value={tripId}
            onChange={(e) => setTripId(e.target.value)}
            className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm"
          />
          <input
            type="text"
            placeholder="ID du chauffeur (Driver ID)"
            value={driverId}
            onChange={(e) => setDriverId(e.target.value)}
            className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm"
          />
          <input
            type="text"
            placeholder="ID ou Immatriculation du véhicule"
            value={vehicleId}
            onChange={(e) => setVehicleId(e.target.value)}
            className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !tripId.trim() || !driverId.trim() || !vehicleId.trim()}
          className="w-full sm:w-auto px-6 py-2.5 rounded-xl font-bold text-white bg-amber-600 hover:bg-amber-500 disabled:opacity-50 min-h-[44px]"
        >
          Affecter la mission
        </button>
      </form>
    </div>
  );
}
