'use client';

import React, { useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';

export function PersonalDriverDriverPageClient() {
  const [tripId, setTripId] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleUpdateStatus = async (status: string) => {
    if (!tripId.trim()) return;
    setLoading(true);
    setMessage(null);
    try {
      const functions = getFunctions(undefined, 'europe-west1');
      const callable = httpsCallable(functions, 'driverUpdatePersonalDriverTrip');
      await callable({ tripId: tripId.trim(), status });
      setMessage(`Statut du trajet ${tripId} mis à jour : ${status}`);
    } catch (err: any) {
      setMessage(`Erreur: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 p-6 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Missions Personal Driver (Espace Chauffeur)
        </h1>
        <p className="text-sm text-gray-500">Mise à jour des statuts de trajet attribués</p>
      </div>

      {message && (
        <div className="p-4 rounded-xl bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200 text-sm border border-amber-200 dark:border-amber-900">
          {message}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Identifiant du trajet
          </label>
          <input
            type="text"
            placeholder="Entrez le Trip ID"
            value={tripId}
            onChange={(e) => setTripId(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm"
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
          <button
            onClick={() => handleUpdateStatus('driver_en_route')}
            disabled={loading || !tripId.trim()}
            className="py-3 px-4 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-500 active:scale-[0.99] disabled:opacity-50 min-h-[44px]"
          >
            En route
          </button>

          <button
            onClick={() => handleUpdateStatus('driver_arrived')}
            disabled={loading || !tripId.trim()}
            className="py-3 px-4 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-500 active:scale-[0.99] disabled:opacity-50 min-h-[44px]"
          >
            Arrivé
          </button>

          <button
            onClick={() => handleUpdateStatus('passenger_picked_up')}
            disabled={loading || !tripId.trim()}
            className="py-3 px-4 rounded-xl font-bold text-white bg-purple-600 hover:bg-purple-500 active:scale-[0.99] disabled:opacity-50 min-h-[44px]"
          >
            Passager récupéré
          </button>

          <button
            onClick={() => handleUpdateStatus('in_progress')}
            disabled={loading || !tripId.trim()}
            className="py-3 px-4 rounded-xl font-bold text-white bg-amber-600 hover:bg-amber-500 active:scale-[0.99] disabled:opacity-50 min-h-[44px]"
          >
            Trajet en cours
          </button>

          <button
            onClick={() => handleUpdateStatus('completed')}
            disabled={loading || !tripId.trim()}
            className="py-3 px-4 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] disabled:opacity-50 min-h-[44px]"
          >
            Trajet terminé
          </button>
        </div>
      </div>
    </div>
  );
}
