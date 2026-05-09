'use client';

import { useState, FormEvent } from 'react';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { RESTAURANT_DAYS } from '@/utils/restaurant-constants';
import type { Step4Data } from '@/hooks/useRestaurantRegistration';

interface Step4HoursProps {
  onSubmit: (data: Step4Data) => Promise<void>;
  onBack: () => void;
  initialData?: Partial<Step4Data>;
  loading: boolean;
}

const DEFAULT_HOURS: Step4Data['openingHours'] = Object.fromEntries(
  RESTAURANT_DAYS.map(({ key }) => [key, { open: '09:00', close: '22:00', closed: key === 'sunday' }])
) as Step4Data['openingHours'];

export function Step4Hours({ onSubmit, onBack, initialData, loading }: Step4HoursProps) {
  const [hours, setHours] = useState<Step4Data['openingHours']>(
    initialData?.openingHours || DEFAULT_HOURS
  );
  const [error, setError] = useState<string | null>(null);

  const updateDay = (key: string, field: string, value: string | boolean) => {
    setHours((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const openDays = Object.entries(hours).filter(([, v]) => !v.closed);
    if (openDays.length === 0) {
      setError('Au moins un jour doit être ouvert.');
      return;
    }

    await onSubmit({ openingHours: hours });
  };

  return (
    <div className="flex flex-col items-center px-4 py-6">
      <div className="w-full max-w-md">
        <h2 className="text-2xl font-bold mb-1 text-white">Horaires d&apos;ouverture</h2>
        <p className="text-gray-400 mb-6">Étape 4 sur 4 — Définissez vos horaires</p>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3" noValidate>
          {RESTAURANT_DAYS.map(({ key, label }) => {
            const day = hours[key];
            return (
              <div key={key} className="glass-card p-3 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-sm">{label}</span>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <span className="text-xs text-gray-400">Fermé</span>
                    <input
                      type="checkbox"
                      checked={day.closed}
                      onChange={(e) => updateDay(key, 'closed', e.target.checked)}
                      className="w-4 h-4 rounded"
                      aria-label={`${label} fermé`}
                    />
                  </label>
                </div>
                {!day.closed && (
                  <div className="flex gap-2">
                    <input
                      type="time"
                      value={day.open}
                      onChange={(e) => updateDay(key, 'open', e.target.value)}
                      className="glass-input flex-1 text-sm text-white placeholder:text-slate-500"
                      aria-label={`${label} ouverture`}
                    />
                    <span className="text-gray-400 self-center">—</span>
                    <input
                      type="time"
                      value={day.close}
                      onChange={(e) => updateDay(key, 'close', e.target.value)}
                      className="glass-input flex-1 text-sm text-white placeholder:text-slate-500"
                      aria-label={`${label} fermeture`}
                    />
                  </div>
                )}
              </div>
            );
          })}

          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onBack} className="h-[48px] flex-1 glass-card border border-gray-300 text-gray-600 font-semibold rounded-xl" aria-label="Retour">
              Retour
            </button>
            <button type="submit" disabled={loading} className="h-[56px] flex-[2] glass-card border-2 border-green-500/60 bg-green-500 text-white font-bold text-lg rounded-xl disabled:opacity-50 flex items-center justify-center gap-2" aria-label="Soumettre votre dossier">
              {loading ? <span className="animate-spin">⏳</span> : <MaterialIcon name="send" />}
              {loading ? 'Soumission...' : 'Soumettre mon dossier'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
