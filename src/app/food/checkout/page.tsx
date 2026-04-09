'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCartStore } from '@/store/cartStore';
import { FoodDeliveryService } from '@/services/food-delivery.service';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { BottomNav } from '@/components/ui/BottomNav';
import { useAuth } from '@/hooks/useAuth';
import type { AuthContextType } from '@/types';
import { CURRENCY_CODE } from '@/utils/constants';
import { getDeliveryDistance } from '@/utils/distance';

export default function CheckoutPage() {
  const router = useRouter();
  const { currentUser: user, userData } = useAuth() || { currentUser: { uid: 'user_123' } as unknown as AuthContextType['currentUser'], userData: null }; // Mock fallback
  const { items, restaurant, getSubtotal, clearCart } = useCartStore();
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [deliveryPreference, setDeliveryPreference] = useState<'leave_at_door' | 'meet_outside' | 'meet_at_door'>('leave_at_door');
  const [deliveryInstructions, setDeliveryInstructions] = useState('');
  const [deliveryDistance, setDeliveryDistance] = useState(3.5);
  const [durationMinutes, setDurationMinutes] = useState(15);
  const [distanceIsEstimate, setDistanceIsEstimate] = useState(true);
  const [distanceLoading, setDistanceLoading] = useState(false);

  const isWeekend = new Date().getDay() === 0 || new Date().getDay() === 6;
  const deliveryAddress = userData?.address || "Veuillez définir votre adresse dans le profil";

  // Calculate real delivery distance when restaurant and user address are available
  React.useEffect(() => {
    if (!restaurant || !userData?.address) return;

    const origin      = userData.address;
    const destination = restaurant.location
      ? restaurant.location
      : restaurant.address || restaurant.name;

    setDistanceLoading(true);
    getDeliveryDistance(origin, destination)
      .then(({ distanceKm, durationMinutes: dur, isEstimate }) => {
        setDeliveryDistance(distanceKm);
        setDurationMinutes(dur);
        setDistanceIsEstimate(isEstimate);
      })
      .finally(() => setDistanceLoading(false));
  }, [restaurant, userData?.address]);

  if (!restaurant || items.length === 0) {
    router.push('/food');
    return null;
  }

  const subtotal = getSubtotal();
  const deliveryCost = FoodDeliveryService.calculateDeliveryCost(deliveryDistance, isWeekend);
  const total = subtotal + deliveryCost;

  const handleCreateOrder = async () => {
    if (loading) return; // Prevent double submit
    setLoading(true);
    setErrorMsg(null);
    try {
      // 1. Transformer les items pour le service
      const orderItems = items.map(item => ({
        itemId: item.id!,
        itemName: item.name,
        itemQuantity: item.quantity,
        itemPrice: item.price
      }));

      // 2. Créer la commande
      const orderId = await FoodDeliveryService.createFoodOrder({
        userId: user!.uid,
        restaurantId: restaurant.id,
        orderItems,
        deliveryDistance,
        isWeekend,
        deliveryAddress,
        deliveryPreference,
        deliveryInstructions,
      });

      // 3. Vider le panier et rediriger vers le suivi
      clearCart();
      router.push(`/food/orders/${orderId}`);
    } catch (error) {
      console.error('Erreur lors de la validation:', error);
      setErrorMsg('Une erreur est survenue lors de la validation de votre commande.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-32 max-w-[430px] mx-auto">
      {/* Header */}
      <div className="bg-background/80 backdrop-blur-xl border-b border-white/5 p-4 sticky top-0 z-20 flex items-center justify-between">
        <button onClick={() => router.back()} className="p-2 -ml-2 text-white bg-white/5 rounded-full hover:bg-white/10">
          <MaterialIcon name="arrow_back" size="lg" />
        </button>
        <h1 className="text-xl font-bold text-white">Paiement</h1>
        <div className="w-10"></div> {/* Spacer */}
      </div>

      <div className="p-4 space-y-6">
        {/* Delivery Address */}
        <section className="glass-card p-5 rounded-2xl border border-white/5">
          <h2 className="text-lg font-bold text-white mb-4">Adresse de livraison</h2>
          <div className="flex items-start gap-4">
            <div className="bg-primary/10 p-3 rounded-full text-primary mt-1">
              <MaterialIcon name="location_on" size="lg" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-white">Domicile</p>
              <p className="text-slate-400 text-sm mt-1">{deliveryAddress}</p>
              <p className="text-slate-500 text-xs mt-1">
                {distanceLoading
                  ? 'Calcul de la distance...'
                  : `${distanceIsEstimate ? '~' : ''} ${deliveryDistance.toFixed(1)} km · ~${durationMinutes} min`}
              </p>
            </div>
            <button onClick={() => router.push('/profil')} className="text-primary text-sm font-semibold">Modifier</button>
          </div>
        </section>

        {/* Order Summary */}
        <section className="glass-card p-5 rounded-2xl border border-white/5">
          <h2 className="text-lg font-bold text-white mb-4">Résumé ({items.length} articles)</h2>
          <div className="space-y-3 mb-4">
            {items.map(item => (
              <div key={item.id} className="flex justify-between text-sm">
                <span className="text-slate-300">
                  <span className="font-semibold text-white mr-2">{item.quantity}x</span>
                  {item.name}
                </span>
                <span className="font-medium text-white">{(item.price * item.quantity).toFixed(2)} {CURRENCY_CODE}</span>
              </div>
            ))}
          </div>

          <div className="border-t border-white/5 pt-4 space-y-2 text-sm text-slate-400">
            <div className="flex justify-between">
              <span>Sous-total</span>
              <span>{subtotal.toFixed(2)} {CURRENCY_CODE}</span>
            </div>
            <div className="flex justify-between">
              <span>Frais de livraison ({distanceIsEstimate ? '~' : ''}{deliveryDistance.toFixed(1)} km)</span>
              <span>{deliveryCost.toFixed(2)} {CURRENCY_CODE}</span>
            </div>
            {isWeekend && (
              <div className="flex justify-between text-primary/80">
                <span>Majoration weekend</span>
                <span>Inclus</span>
              </div>
            )}
          </div>

          <div className="border-t border-white/5 mt-4 pt-4 flex justify-between items-center text-lg font-bold text-white">
            <span>Total</span>
            <span>{total.toFixed(2)} {CURRENCY_CODE}</span>
          </div>
        </section>

        {/* Payment Method */}
        <section className="glass-card p-5 rounded-2xl border border-white/5">
          <h2 className="text-lg font-bold text-white mb-4">Moyen de paiement</h2>
          <div className="flex items-center justify-between p-4 border border-primary/20 bg-primary/5 rounded-xl">
            <div className="flex items-center gap-3">
              <MaterialIcon name="credit_card" size="lg" className="text-primary" />
              <div>
                <p className="font-semibold text-white">Apple Pay</p>
                <p className="text-xs text-slate-400">Moyen par défaut</p>
              </div>
            </div>
            <MaterialIcon name="chevron_right" size="md" className="text-slate-500" />
          </div>
        </section>

        {/* Delivery Preference */}
        <section className="glass-card p-5 rounded-2xl border border-white/5">
          <h2 className="text-lg font-bold text-white mb-4">Préférences de livraison</h2>
          <div className="space-y-3">
            <p className="text-sm font-semibold text-white">Mode de livraison</p>
            {([
              { value: 'leave_at_door', label: 'Déposer à la porte', desc: 'Photo requise pour confirmation' },
              { value: 'meet_outside',  label: "Rendez-vous à l'extérieur", desc: 'Code PIN requis' },
              { value: 'meet_at_door',  label: 'Rendez-vous à la porte', desc: 'Code PIN requis' },
            ] as const).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setDeliveryPreference(opt.value)}
                className={[
                  'w-full p-3 rounded-xl border text-left transition-all',
                  deliveryPreference === opt.value ? 'border-primary bg-primary/10' : 'border-white/10',
                ].join(' ')}
              >
                <p className="text-sm font-medium text-white">{opt.label}</p>
                <p className="text-xs text-slate-400">{opt.desc}</p>
              </button>
            ))}
          </div>

          <div className="mt-4">
            <label className="text-sm font-semibold text-white">Instructions de livraison (optionnel)</label>
            <textarea
              value={deliveryInstructions}
              onChange={(e) => setDeliveryInstructions(e.target.value)}
              placeholder="Ex: 3e étage, porte gauche…"
              className="w-full mt-1 bg-white/5 border border-white/10 rounded-xl p-3 text-white text-sm resize-none"
              rows={2}
            />
          </div>
        </section>

        {errorMsg && (
          <div className="bg-destructive/10 text-destructive p-4 rounded-xl text-sm border border-destructive/20 flex items-center justify-between">
            {errorMsg}
          </div>
        )}
      </div>

      {/* Checkout Footer */}
      <div className="fixed bottom-0 inset-x-0 p-4 bg-background/80 backdrop-blur-xl border-t border-white/5 z-20 max-w-[430px] mx-auto">
        <button
          onClick={handleCreateOrder}
          disabled={loading}
          className="w-full bg-gradient-to-r from-primary to-[#ffae33] text-white font-bold text-lg py-4 rounded-xl hover:opacity-90 transition-all flex justify-center items-center gap-2 disabled:opacity-70"
        >
          {loading ? (
            <>
              <MaterialIcon name="progress_activity" size="md" className="animate-spin" />
              Traitement du paiement...
            </>
          ) : (
            `Payer ${total.toFixed(2)} ${CURRENCY_CODE}`
          )}
        </button>
      </div>
      <BottomNav />
    </div>
  );
}
