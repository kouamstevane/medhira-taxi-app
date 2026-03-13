'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCartStore } from '@/store/cartStore';
import { FoodDeliveryService } from '@/services/food-delivery.service';
import { ArrowLeft, MapPin, CreditCard, ChevronRight, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { CURRENCY_CODE } from '@/utils/constants';

export default function CheckoutPage() {
  const router = useRouter();
  const { currentUser: user, userData } = useAuth() || { currentUser: { uid: 'user_123' } as any, userData: null }; // Mock fallback
  const { items, restaurant, getSubtotal, clearCart } = useCartStore();
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Mocked delivery info
  // TODO: Intégration Google Distance Matrix API pour la distance réelle
  const deliveryDistance = 3.5; 
  const isWeekend = new Date().getDay() === 0 || new Date().getDay() === 6;
  const deliveryAddress = userData?.address || "Veuillez définir votre adresse dans le profil";

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
    <div className="min-h-screen bg-gray-50 pb-32">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 p-4 sticky top-0 z-10 flex items-center justify-between">
        <button onClick={() => router.back()} className="p-2 -ml-2 text-gray-900 bg-gray-50 rounded-full">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-xl font-bold text-gray-900">Paiement</h1>
        <div className="w-10"></div> {/* Spacer */}
      </div>

      <div className="p-4 space-y-6">
        {/* Delivery Address */}
        <section className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Adresse de livraison</h2>
          <div className="flex items-start gap-4">
            <div className="bg-primary/10 p-3 rounded-full text-primary mt-1">
              <MapPin className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-gray-900">Domicile</p>
              <p className="text-gray-500 text-sm mt-1">{deliveryAddress}</p>
              <p className="text-gray-400 text-xs mt-1">~ {deliveryDistance} km</p>
            </div>
            <button className="text-primary text-sm font-semibold">Modifier</button>
          </div>
        </section>

        {/* Order Summary */}
        <section className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Résumé ({items.length} articles)</h2>
          <div className="space-y-3 mb-4">
            {items.map(item => (
              <div key={item.id} className="flex justify-between text-sm">
                <span className="text-gray-600">
                  <span className="font-semibold text-gray-900 mr-2">{item.quantity}x</span>
                  {item.name}
                </span>
                <span className="font-medium text-gray-900">{(item.price * item.quantity).toFixed(2)} {CURRENCY_CODE}</span>
              </div>
            ))}
          </div>

          <div className="border-t border-gray-100 pt-4 space-y-2 text-sm text-gray-600">
            <div className="flex justify-between">
              <span>Sous-total</span>
              <span>{subtotal.toFixed(2)} {CURRENCY_CODE}</span>
            </div>
            <div className="flex justify-between">
              <span>Frais de livraison ({deliveryDistance} km)</span>
              <span>{deliveryCost.toFixed(2)} {CURRENCY_CODE}</span>
            </div>
            {isWeekend && (
              <div className="flex justify-between text-primary/80">
                <span>Majoration weekend</span>
                <span>Inclus</span>
              </div>
            )}
          </div>

          <div className="border-t border-gray-100 mt-4 pt-4 flex justify-between items-center text-lg font-bold text-gray-900">
            <span>Total</span>
            <span>{total.toFixed(2)} {CURRENCY_CODE}</span>
          </div>
        </section>

        {/* Payment Method */}
        <section className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Moyen de paiement</h2>
          <div className="flex items-center justify-between p-4 border border-primary/20 bg-primary/5 rounded-xl">
            <div className="flex items-center gap-3">
              <CreditCard className="w-6 h-6 text-primary" />
              <div>
                <p className="font-semibold text-gray-900">Apple Pay</p>
                <p className="text-xs text-gray-500">Moyen par défaut</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </div>
        </section>

        {errorMsg && (
          <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm border border-red-100 flex items-center justify-between">
            {errorMsg}
          </div>
        )}
      </div>

      {/* Checkout Footer */}
      <div className="fixed bottom-0 inset-x-0 p-4 bg-white border-t border-gray-100 z-20">
        <button
          onClick={handleCreateOrder}
          disabled={loading}
          className="w-full bg-primary text-primary-foreground font-bold text-lg py-4 rounded-xl shadow-lg shadow-primary/30 hover:bg-primary/95 transition-all flex justify-center items-center gap-2 disabled:opacity-70"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Traitement du paiement...
            </>
          ) : (
            `Payer ${total.toFixed(2)} ${CURRENCY_CODE}`
          )}
        </button>
      </div>
    </div>
  );
}
