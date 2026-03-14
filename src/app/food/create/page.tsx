"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { FiArrowLeft, FiShoppingBag, FiMapPin, FiPhone, FiClock, FiCheck, FiInfo, FiMail, FiDollarSign } from 'react-icons/fi';
import { FoodDeliveryService } from '@/services/food-delivery.service';
import { auth } from '@/config/firebase';
import { useToast } from '@/hooks/useToast';
import { ToastContainer } from '@/components/ui/Toast';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { onAuthStateChanged } from 'firebase/auth';

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
  const [existingRestaurant, setExistingRestaurant] = useState<any>(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    address: '',
    cuisineType: [] as string[],
    phoneNumber: '',
    email: '',
    avgPricePerPerson: 15,
    commissionRate: 10,
    imageUrl: '',
    openingHours: DAYS.reduce((acc, day) => {
      acc[day.id] = { open: '08:00', close: '22:00', closed: false };
      return acc;
    }, {} as any)
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

  const handleHourChange = (dayId: string, field: 'open' | 'close' | 'closed', value: any) => {
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
    } catch (error: any) {
      console.error("Error creating restaurant:", error);
      showError(error.message || "Une erreur est survenue lors de la création du restaurant");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <LoadingSpinner />
      </div>
    );
  }

  if (existingRestaurant) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 text-center">
        <ToastContainer toasts={toasts} onRemove={removeToast} />
        <div className="w-24 h-24 bg-red-100 rounded-3xl flex items-center justify-center mb-8 animate-bounce">
          <FiShoppingBag className="h-12 w-12 text-red-600" />
        </div>
        <h1 className="text-3xl font-bold text-[#101010] mb-4">{existingRestaurant.name}</h1>
        <div className={`px-6 py-2 rounded-full font-bold mb-8 ${
          existingRestaurant.status === 'approved' ? 'bg-green-100 text-green-600' : 
          existingRestaurant.status === 'pending_approval' ? 'bg-orange-100 text-orange-600' : 
          'bg-red-100 text-red-600'
        }`}>
          {existingRestaurant.status === 'approved' ? 'Restaurant Actif' : 
           existingRestaurant.status === 'pending_approval' ? 'En attente de validation' : 
           'Action requise'}
        </div>
        <p className="text-gray-600 max-w-md mb-8 leading-relaxed">
          {existingRestaurant.status === 'pending_approval' 
            ? "Votre demande est en cours de traitement par nos administrateurs. Vous recevrez un email dès que votre restaurant sera validé."
            : "Votre restaurant est actif ! Vous pouvez maintenant gérer vos menus et commandes."}
        </p>
        <button 
          onClick={() => router.push('/dashboard')}
          className="px-8 py-4 bg-[#101010] text-white font-bold rounded-2xl hover:scale-105 transition active:scale-95"
        >
          Retour au tableau de bord
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10 px-4 py-4 flex items-center">
        <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 rounded-full">
          <FiArrowLeft className="h-6 w-6 text-gray-600" />
        </button>
        <h1 className="ml-4 text-xl font-bold text-[#101010]">Ajouter mon restaurant</h1>
      </div>

      <div className="max-w-2xl mx-auto mt-8 px-4">
        {/* Progress Bar */}
        <div className="flex justify-between mb-8 relative">
          <div className="absolute top-1/2 left-0 w-full h-1 bg-gray-200 -translate-y-1/2 -z-0"></div>
          <div 
            className="absolute top-1/2 left-0 h-1 bg-red-500 -translate-y-1/2 -z-0 transition-all duration-500"
            style={{ width: `${((step - 1) / 2) * 100}%` }}
          ></div>
          {[1, 2, 3].map((s) => (
            <div 
              key={s} 
              className={`w-10 h-10 rounded-full flex items-center justify-center relative z-10 transition-all duration-300 font-bold ${
                step >= s ? 'bg-red-500 text-white' : 'bg-white text-gray-400 border-2 border-gray-200'
              }`}
            >
              {step > s ? <FiCheck /> : s}
            </div>
          ))}
        </div>

        {/* Step Content */}
        <div className="bg-white rounded-3xl shadow-xl p-6 md:p-8 border border-gray-100">
          
          {step === 1 && (
            <div className="animate-fadeIn">
              <div className="flex items-center mb-6">
                <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center mr-4">
                  <FiInfo className="text-red-600 h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-[#101010]">Informations Générales</h2>
                  <p className="text-sm text-gray-500">Dites-nous en plus sur votre établissement</p>
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Nom du restaurant *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-4 bg-white border border-gray-200 rounded-2xl focus:ring-2 focus:ring-red-500/20 focus:border-red-500 text-gray-900 outline-none transition shadow-sm"
                    placeholder="Ex: Le Gourmet Africain"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Description * (min 10 car.)</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-4 py-4 bg-white border border-gray-200 rounded-2xl focus:ring-2 focus:ring-red-500/20 focus:border-red-500 text-gray-900 outline-none transition h-32 shadow-sm"
                    placeholder="Décrivez votre cuisine, votre ambiance..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Type de cuisine *</label>
                  <div className="flex flex-wrap gap-2 text-sm">
                    {CUISINE_TYPES.map((type) => (
                      <button
                        key={type}
                        onClick={() => handleCuisineToggle(type)}
                        className={`px-4 py-2 rounded-full border transition ${
                          formData.cuisineType.includes(type)
                            ? 'bg-red-500 border-red-500 text-white shadow-md'
                            : 'bg-white border-gray-200 text-gray-600 hover:border-red-200'
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
                <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center mr-4">
                  <FiMapPin className="text-red-600 h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-[#101010]">Localisation & Contact</h2>
                  <p className="text-sm text-gray-500">Où êtes-vous situé et comment vous joindre ?</p>
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Adresse complète *</label>
                  <div className="relative">
                    <FiMapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      className="w-full pl-11 pr-4 py-4 bg-white border border-gray-200 rounded-2xl focus:ring-2 focus:ring-red-500/20 focus:border-red-500 text-gray-900 outline-none transition shadow-sm"
                      placeholder="Ex: Akwa, Rue Joss, Douala"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Numéro de téléphone *</label>
                  <div className="relative">
                    <FiPhone className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="tel"
                      value={formData.phoneNumber}
                      onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                      className="w-full pl-11 pr-4 py-4 bg-white border border-gray-200 rounded-2xl focus:ring-2 focus:ring-red-500/20 focus:border-red-500 text-gray-900 outline-none transition shadow-sm"
                      placeholder="Ex: +237 6XX XXX XXX"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Email de contact *</label>
                  <div className="relative">
                    <FiMail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full pl-11 pr-4 py-4 bg-white border border-gray-200 rounded-2xl focus:ring-2 focus:ring-red-500/20 focus:border-red-500 text-gray-900 outline-none transition shadow-sm"
                      placeholder="Ex: contact@monsite.com"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Prix moyen (€) *</label>
                    <div className="relative">
                      <FiDollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="number"
                        value={formData.avgPricePerPerson}
                        onChange={(e) => setFormData({ ...formData, avgPricePerPerson: parseInt(e.target.value) })}
                        className="w-full pl-11 pr-4 py-4 bg-white border border-gray-200 rounded-2xl focus:ring-2 focus:ring-red-500/20 focus:border-red-500 text-gray-900 outline-none transition shadow-sm"
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
                <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center mr-4">
                  <FiClock className="text-red-600 h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-[#101010]">Horaires d'Ouverture</h2>
                  <p className="text-sm text-gray-500">Paramétrez vos jours et heures de service</p>
                </div>
              </div>

              <div className="space-y-4">
                {DAYS.map((day) => (
                  <div key={day.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl">
                    <div className="w-24 font-semibold text-gray-700">{day.label}</div>
                    
                    <div className="flex items-center gap-4">
                      {!formData.openingHours[day.id].closed ? (
                        <>
                          <input
                            type="time"
                            value={formData.openingHours[day.id].open}
                            onChange={(e) => handleHourChange(day.id, 'open', e.target.value)}
                            className="bg-white border border-gray-200 px-2 py-1.5 rounded-xl text-sm outline-none focus:border-red-500 transition text-gray-900 shadow-sm"
                          />
                          <span className="text-gray-400 font-medium">à</span>
                          <input
                            type="time"
                            value={formData.openingHours[day.id].close}
                            onChange={(e) => handleHourChange(day.id, 'close', e.target.value)}
                            className="bg-white border border-gray-200 px-2 py-1.5 rounded-xl text-sm outline-none focus:border-red-500 transition text-gray-900 shadow-sm"
                          />
                        </>
                      ) : (
                        <span className="text-red-400 font-medium text-sm">Fermé</span>
                      )}
                      
                      <button
                        onClick={() => handleHourChange(day.id, 'closed', !formData.openingHours[day.id].closed)}
                        className={`text-xs px-3 py-1.5 rounded-xl font-bold transition ${
                          formData.openingHours[day.id].closed
                            ? 'bg-red-100 text-red-600'
                            : 'bg-green-100 text-green-600'
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
                className="flex-1 py-4 border-2 border-gray-200 text-gray-600 font-bold rounded-2xl hover:bg-gray-50 transition"
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
              className="flex-[2] py-4 bg-red-600 text-white font-bold rounded-2xl shadow-lg shadow-red-200 hover:bg-red-700 transition flex items-center justify-center"
            >
              {submitting ? <LoadingSpinner /> : (step === 3 ? 'Finaliser la création' : 'Suivant')}
            </button>
          </div>
        </div>

        {/* Info Card */}
        <div className="mt-8 p-6 bg-blue-50 rounded-3xl border border-blue-100 flex items-start">
          <FiInfo className="text-blue-500 mt-1 mr-4 shrink-0" />
          <p className="text-sm text-blue-700 leading-relaxed">
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
    </div>
  );
}
