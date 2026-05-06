'use client';

import { useState, FormEvent } from 'react';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { CUISINE_TYPES } from '@/utils/restaurant-constants';
import type { Step3Data } from '@/hooks/useRestaurantRegistration';

interface Step3RestaurantProps {
  onNext: (data: Step3Data) => void;
  onBack: () => void;
  initialData?: Partial<Step3Data>;
  loading: boolean;
}

export function Step3Restaurant({ onNext, onBack, initialData, loading }: Step3RestaurantProps) {
  const [name, setName] = useState(initialData?.name || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [cuisineType, setCuisineType] = useState<string[]>(initialData?.cuisineType || []);
  const [address, setAddress] = useState(initialData?.address || '');
  const [phone, setPhone] = useState(initialData?.phone || '');
  const [email, setEmail] = useState(initialData?.email || '');
  const [avgPrice, setAvgPrice] = useState(initialData?.avgPricePerPerson?.toString() || '');
  const [error, setError] = useState<string | null>(null);

  const toggleCuisine = (cuisine: string) => {
    setCuisineType((prev) =>
      prev.includes(cuisine) ? prev.filter((c) => c !== cuisine) : [...prev, cuisine]
    );
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) { setError('Le nom du restaurant est requis.'); return; }
    if (!description.trim() || description.trim().length < 10) { setError('La description doit contenir au moins 10 caractères.'); return; }
    if (cuisineType.length === 0) { setError('Sélectionnez au moins un type de cuisine.'); return; }
    if (!address.trim()) { setError("L'adresse est requise."); return; }
    if (!phone.trim()) { setError('Le téléphone est requis.'); return; }
    if (!email.trim()) { setError("L'email du restaurant est requis."); return; }

    onNext({
      name: name.trim(),
      description: description.trim(),
      cuisineType,
      address: address.trim(),
      phone: phone.trim(),
      email: email.trim(),
      avgPricePerPerson: avgPrice ? parseFloat(avgPrice) : undefined,
    });
  };

  return (
    <div className="flex flex-col items-center px-4 py-6">
      <div className="w-full max-w-md">
        <h2 className="text-2xl font-bold mb-1 text-white">Votre restaurant</h2>
        <p className="text-gray-400 mb-6">Étape 3 sur 4 — Informations du restaurant</p>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label htmlFor="restName" className="block text-sm font-medium text-gray-300 mb-1">Nom du restaurant</label>
            <input id="restName" type="text" value={name} onChange={(e) => setName(e.target.value)} className="glass-input w-full text-white placeholder:text-slate-500" placeholder="Le Bistrot Parisien" required aria-required="true" />
          </div>

          <div>
            <label htmlFor="restDesc" className="block text-sm font-medium text-gray-300 mb-1">Description</label>
            <textarea id="restDesc" value={description} onChange={(e) => setDescription(e.target.value)} className="glass-input w-full min-h-[100px] text-white placeholder:text-slate-500" placeholder="Décrivez votre restaurant en quelques phrases..." required aria-required="true" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Types de cuisine</label>
            <div className="flex flex-wrap gap-2">
              {CUISINE_TYPES.map((cuisine) => (
                <button
                  key={cuisine}
                  type="button"
                  onClick={() => toggleCuisine(cuisine)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    cuisineType.includes(cuisine)
                      ? 'bg-primary text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                  aria-pressed={cuisineType.includes(cuisine)}
                >
                  {cuisine}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="restAddress" className="block text-sm font-medium text-gray-300 mb-1">Adresse</label>
            <input id="restAddress" type="text" value={address} onChange={(e) => setAddress(e.target.value)} className="glass-input w-full text-white placeholder:text-slate-500" placeholder="12 Rue de la Paix, 75002 Paris" required aria-required="true" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="restPhone" className="block text-sm font-medium text-gray-300 mb-1">Téléphone</label>
              <input id="restPhone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="glass-input w-full text-white placeholder:text-slate-500" placeholder="+33 1 42 86 00 88" required aria-required="true" />
            </div>
            <div>
              <label htmlFor="restEmail" className="block text-sm font-medium text-gray-300 mb-1">Email</label>
              <input id="restEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="glass-input w-full text-white placeholder:text-slate-500" placeholder="contact@bistro.fr" required aria-required="true" />
            </div>
          </div>

          <div>
            <label htmlFor="avgPrice" className="block text-sm font-medium text-gray-300 mb-1">Prix moyen par personne (€, optionnel)</label>
            <input id="avgPrice" type="number" value={avgPrice} onChange={(e) => setAvgPrice(e.target.value)} className="glass-input w-full text-white placeholder:text-slate-500" placeholder="25" min="0" step="1" />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onBack} className="h-[48px] flex-1 glass-card border border-gray-300 text-gray-600 font-semibold rounded-xl" aria-label="Retour à l'étape précédente">
              Retour
            </button>
            <button type="submit" disabled={loading} className="h-[48px] flex-[2] glass-card border-2 border-primary/60 text-primary font-bold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2" aria-label="Continuer aux horaires">
              {loading ? <span className="animate-spin">⏳</span> : <MaterialIcon name="arrow_forward" />}
               Continuer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
