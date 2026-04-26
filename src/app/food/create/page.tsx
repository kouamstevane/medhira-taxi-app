"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { BottomNav } from '@/components/ui/BottomNav';
import { FoodDeliveryService } from '@/services/food-delivery.service';
import { auth } from '@/config/firebase';
import { useToast } from '@/hooks/useToast';
import { ToastContainer } from '@/components/ui/Toast';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { onAuthStateChanged } from 'firebase/auth';
import { RESTAURANT_DEFAULTS } from '@/utils/constants';
import type { Restaurant } from '@/types/food-delivery';

const CUISINE_TYPES = [
  "Africaine", "Européenne", "Asiatique", "Fast Food", "Pâtisserie", "Pizza", "Burger", "Santé/Bio", "Desserts"
];

const DAYS = [
  { id: 'monday', label: 'Lundi' },
  { id: 'tuesday', label: 'Mardi' },
  { id: 'wednesday', label: 'Mercredi' },
  { id: 'thursday', label: 'Jeudi' },
  { id: 'friday', label: 'Vendredi' },
  { id: 'saturday', label: 'Samedi' },
  { id: 'sunday', label: 'Dimanche' },
];

export default function CreateRestaurantPage() {
  const router = useRouter();
  const { showSuccess, showError, showInfo, toasts, removeToast } = useToast();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [existingRestaurant, setExistingRestaurant] = useState<Restaurant | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    address: '',
    cuisineType: [] as string[],
    phoneNumber: '',
    email: '',
    avgPricePerPerson: RESTAURANT_DEFAULTS.AVG_PRICE_PER_PERSON,
    commissionRate: RESTAURANT_DEFAULTS.COMMISSION_RATE,
    imageUrl: '',
    openingHours: DAYS.reduce((acc, day) => {
      acc[day.id] = { open: RESTAURANT_DEFAULTS.OPENING_TIME, close: RESTAURANT_DEFAULTS.CLOSING_TIME, closed: false };
      return acc;
    }, {} as Record<string, { open: string; close: string; closed: boolean }>)
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setFormData(prev => ({ ...prev, email: user.email || '' }));
        try {
          const restaurant = await FoodDeliveryService.getRestaurantByOwner(user.uid);
          if (restaurant) {
            setExistingRestaurant(restaurant);
            showInfo("Vous avez déjà une demande de restaurant en cours.");
          }
        } catch (error) {
          console.error("Error checking existing restaurant:", error);
        } finally {
          setLoading(false);
        }
      } else {
        router.push('/login');
      }
    });
    return () => unsubscribe();
  }, [router, showInfo]);

  const handleCuisineToggle = (type: string) => {
    setFormData(prev => ({
      ...prev,
      cuisineType: prev.cuisineType.includes(type)
        ? prev.cuisineType.filter(t => t !== type)
        : [...prev.cuisineType, type]
    }));
  };

  const handleHourChange = (dayId: string, field: 'open' | 'close' | 'closed', value: string | boolean) => {
    setFormData(prev => ({
      ...prev,
      openingHours: {
        ...prev.openingHours,
        [dayId]: {
          ...prev.openingHours[dayId],
          [field]: value
        }
      }
    }));
  };

  const validateStep1 = () => {
    if (formData.name.trim().length < 2) return "Le nom du restaurant doit avoir au moins 2 caractères";
    if (formData.description.length < 10) return "La description doit avoir au moins 10 caractères";
    if (formData.cuisineType.length === 0) return "Choisissez au moins un type de cuisine";
    return null;
  };

  const validateStep2 = () => {
    if (formData.address.length < 5) return "L'adresse doit avoir au moins 5 caractères";
    if (formData.phoneNumber.length < 8) return "Le numéro de téléphone doit avoir au moins 8 caractères";
    if (!formData.email.trim() || !formData.email.includes('@')) return "L'email est invalide";
    return null;
  };

  const handleSubmit = async () => {
    const user = auth.currentUser;
    if (!user) return;

    // Validation finale de toutes les étapes
    const s1Error = validateStep1();
    if (s1Error) {
      setStep(1);
      showError(s1Error);
      return;
    }
    const s2Error = validateStep2();
    if (s2Error) {
      setStep(2);
      showError(s2Error);
      return;
    }

    setSubmitting(true);
    try {
      // Préparation propre des données pour matcher le type Restaurant et le schéma Zod
      const { phoneNumber, ...restOfData } = formData;
      await FoodDeliveryService.createRestaurant({
        ...restOfData,
        phone: phoneNumber,
        ownerId: user.uid,
      });
      showSuccess("Restaurant créé avec succès ! En attente de validation par l'admin.");
      // On recharge pour afficher l'état "En attente"
      window.location.reload();
    } catch (error: unknown) {
      console.error("Error creating restaurant:", error);
      showError(error instanceof Error ? error.message : "Une erreur est survenue lors de la création du restaurant");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <LoadingSpinner />
      </div>
    );
  }

  if (existingRestaurant) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center max-w-[430px] mx-auto">
        <ToastContainer toasts={toasts} onRemove={removeToast} />
        <div className="w-24 h-24 bg-primary/10 rounded-3xl flex items-center justify-center mb-8 animate-bounce">
          <MaterialIcon name="shopping_bag" size="xl" className="text-primary" />
        </div>
        <h1 className="text-3xl font-bold text-white mb-4">{existingRestaurant.name}</h1>
        <div className={`px-6 py-2 rounded-full font-bold mb-8 ${
          existingRestaurant.status === 'approved' ? 'bg-green-500/10 text-green-400' :
          existingRestaurant.status === 'pending_approval' ? 'bg-primary/10 text-primary' :
          'bg-destructive/10 text-destructive'
        }`}>
          {existingRestaurant.status === 'approved' ? 'Restaurant Actif' :
           existingRestaurant.status === 'pending_approval' ? 'En attente de validation' :
           'Action requise'}
        </div>
        <p className="text-slate-300 max-w-md mb-8 leading-relaxed">
          {existingRestaurant.status === 'pending_approval'
            ? "Votre demande est en cours de traitement par nos administrateurs. Vous recevrez un email dès que votre restaurant sera validé."
            : "Votre restaurant est actif ! Vous pouvez maintenant gérer vos menus et commandes."}
        </p>
        <button
          onClick={() => router.push('/dashboard')}
          className="px-8 py-4 bg-gradient-to-r from-primary to-[#ffae33] text-white font-bold rounded-2xl hover:scale-105 transition active:scale-95"
        >
          Retour au tableau de bord
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20 max-w-[430px] mx-auto">
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      {/* Header */}
      <div className="bg-background/80 backdrop-blur-xl border-b border-white/5 sticky top-0 z-20 px-4 py-4 flex items-center">
        <button onClick={() => router.back()} className="p-2 hover:bg-white/5 rounded-full">
          <MaterialIcon name="arrow_back" size="lg" className="text-slate-300" />
        </button>
        <h1 className="ml-4 text-xl font-bold text-white">Ajouter mon restaurant</h1>
      </div>

      <div className="max-w-2xl mx-auto mt-8 px-4">
        {/* Progress Bar */}
        <div className="flex justify-between mb-8 relative">
          <div className="absolute top-1/2 left-0 w-full h-1 bg-white/5 -translate-y-1/2 -z-0"></div>
          <div
            className="absolute top-1/2 left-0 h-1 bg-primary -translate-y-1/2 -z-0 transition-all duration-500"
            style={{ width: `${((step - 1) / 2) * 100}%` }}
          ></div>
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`w-10 h-10 rounded-full flex items-center justify-center relative z-10 transition-all duration-300 font-bold ${
                step >= s ? 'bg-primary text-white' : 'glass-card text-slate-400 border border-white/10'
              }`}
            >
              {step > s ? <MaterialIcon name="check" size="md" /> : s}
            </div>
          ))}
        </div>

        {/* Step Content */}
        <div className="glass-card rounded-3xl p-6 md:p-8 border border-white/5">

          {step === 1 && (
            <div className="animate-fadeIn">
              <div className="flex items-center mb-6">
                <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center mr-4">
                  <MaterialIcon name="info" size="lg" className="text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Informations Générales</h2>
                  <p className="text-sm text-slate-400">Dites-nous en plus sur votre établissement</p>
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-semibold text-slate-300 mb-2">Nom du restaurant *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full glass-input px-4 py-4 rounded-2xl focus:ring-2 focus:ring-primary/20 focus:border-primary text-white outline-none transition"
                    placeholder="Ex: Le Gourmet Africain"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-300 mb-2">Description * (min 10 car.)</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full glass-input px-4 py-4 rounded-2xl focus:ring-2 focus:ring-primary/20 focus:border-primary text-white outline-none transition h-32"
                    placeholder="Décrivez votre cuisine, votre ambiance..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-300 mb-2">Type de cuisine *</label>
                  <div className="flex flex-wrap gap-2 text-sm">
                    {CUISINE_TYPES.map((type) => (
                      <button
                        key={type}
                        onClick={() => handleCuisineToggle(type)}
                        className={`px-4 py-2 rounded-full border transition ${
                          formData.cuisineType.includes(type)
                            ? 'bg-primary border-primary text-white'
                            : 'glass-card border-white/5 text-slate-300 hover:border-primary/30'
                        }`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="animate-fadeIn">
              <div className="flex items-center mb-6">
                <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center mr-4">
                  <MaterialIcon name="location_on" size="lg" className="text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Localisation & Contact</h2>
                  <p className="text-sm text-slate-400">Où êtes-vous situé et comment vous joindre ?</p>
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-semibold text-slate-300 mb-2">Adresse complète *</label>
                  <div className="relative">
                    <MaterialIcon name="location_on" size="md" className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      className="w-full pl-11 pr-4 py-4 glass-input rounded-2xl focus:ring-2 focus:ring-primary/20 focus:border-primary text-white outline-none transition"
                      placeholder="Ex: Akwa, Rue Joss, Douala"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-300 mb-2">Numéro de téléphone *</label>
                  <div className="relative">
                    <MaterialIcon name="phone" size="md" className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="tel"
                      value={formData.phoneNumber}
                      onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                      className="w-full pl-11 pr-4 py-4 glass-input rounded-2xl focus:ring-2 focus:ring-primary/20 focus:border-primary text-white outline-none transition"
                      placeholder="Ex: +237 6XX XXX XXX"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-300 mb-2">Email de contact *</label>
                  <div className="relative">
                    <MaterialIcon name="mail" size="md" className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full pl-11 pr-4 py-4 glass-input rounded-2xl focus:ring-2 focus:ring-primary/20 focus:border-primary text-white outline-none transition"
                      placeholder="Ex: contact@monsite.com"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-300 mb-2">Prix moyen *</label>
                    <div className="relative">
                      <MaterialIcon name="payments" size="md" className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="number"
                        value={formData.avgPricePerPerson}
                        onChange={(e) => setFormData({ ...formData, avgPricePerPerson: parseInt(e.target.value) })}
                        className="w-full pl-11 pr-4 py-4 glass-input rounded-2xl focus:ring-2 focus:ring-primary/20 focus:border-primary text-white outline-none transition"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="animate-fadeIn">
              <div className="flex items-center mb-6">
                <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center mr-4">
                  <MaterialIcon name="schedule" size="lg" className="text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Horaires d'Ouverture</h2>
                  <p className="text-sm text-slate-400">Paramétrez vos jours et heures de service</p>
                </div>
              </div>

              <div className="space-y-4">
                {DAYS.map((day) => (
                  <div key={day.id} className="flex items-center justify-between p-4 glass-card rounded-2xl border border-white/5">
                    <div className="w-24 font-semibold text-slate-300">{day.label}</div>

                    <div className="flex items-center gap-4">
                      {!formData.openingHours[day.id].closed ? (
                        <>
                          <input
                            type="time"
                            value={formData.openingHours[day.id].open}
                            onChange={(e) => handleHourChange(day.id, 'open', e.target.value)}
                            className="glass-input border border-white/10 px-2 py-1.5 rounded-xl text-sm outline-none focus:border-primary transition text-white"
                          />
                          <span className="text-slate-500 font-medium">à</span>
                          <input
                            type="time"
                            value={formData.openingHours[day.id].close}
                            onChange={(e) => handleHourChange(day.id, 'close', e.target.value)}
                            className="glass-input border border-white/10 px-2 py-1.5 rounded-xl text-sm outline-none focus:border-primary transition text-white"
                          />
                        </>
                      ) : (
                        <span className="text-destructive font-medium text-sm">Fermé</span>
                      )}

                      <button
                        onClick={() => handleHourChange(day.id, 'closed', !formData.openingHours[day.id].closed)}
                        className={`text-xs px-3 py-1.5 rounded-xl font-bold transition ${
                          formData.openingHours[day.id].closed
                            ? 'bg-destructive/10 text-destructive'
                            : 'bg-green-500/10 text-green-400'
                        }`}
                      >
                        {formData.openingHours[day.id].closed ? 'OUVRIR' : 'FERMER'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="mt-10 flex gap-4">
            {step > 1 && (
              <button
                onClick={() => setStep(step - 1)}
                className="flex-1 py-4 border-2 border-white/10 text-slate-300 font-bold rounded-2xl hover:bg-white/5 transition"
              >
                Précédent
              </button>
            )}

            <button
              disabled={submitting}
              onClick={() => {
                const error = step === 1 ? validateStep1() : step === 2 ? validateStep2() : null;
                if (error) {
                  showError(error);
                  return;
                }
                if (step < 3) setStep(step + 1);
                else handleSubmit();
              }}
              className="flex-[2] py-4 bg-gradient-to-r from-primary to-[#ffae33] text-white font-bold rounded-2xl hover:opacity-90 transition flex items-center justify-center"
            >
              {submitting ? <LoadingSpinner /> : (step === 3 ? 'Finaliser la création' : 'Suivant')}
            </button>
          </div>
        </div>

        {/* Info Card */}
        <div className="mt-8 p-6 glass-card rounded-3xl border border-blue-500/20 flex items-start">
          <MaterialIcon name="info" size="md" className="text-blue-400 mt-1 mr-4 shrink-0" />
          <p className="text-sm text-blue-300 leading-relaxed">
            Votre restaurant sera soumis à une validation manuelle par notre équipe.
            Vous recevrez une notification dès qu'il sera en ligne.
          </p>
        </div>
      </div>

      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.4s ease-out forwards;
        }
      `}</style>
      <BottomNav />
    </div>
  );
}
