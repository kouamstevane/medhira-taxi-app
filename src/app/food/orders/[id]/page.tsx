'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { FIRESTORE_COLLECTIONS } from '@/types/firestore-collections';
import { FoodOrder } from '@/types/food-delivery';
import { OrderStatusBadge } from '@/components/food/OrderStatusBadge';
import { ArrowLeft, MapPin, Loader2, Star, Clock, ChefHat, Bike, CheckCircle2 } from 'lucide-react';
import { FoodDeliveryService } from '@/services/food-delivery.service';
import { CURRENCY_CODE } from '@/utils/constants';

const STATUS_STEPS = [
  { id: 'pending', icon: Clock, label: 'En attente' },
  { id: 'confirmed', icon: CheckCircle2, label: 'Acceptée' },
  { id: 'preparing', icon: ChefHat, label: 'En préparation' },
  { id: 'ready', icon: Bike, label: 'Prête' },
  { id: 'delivering', icon: Bike, label: 'En livraison' },
  { id: 'delivered', icon: MapPin, label: 'Livrée' },
];

export function generateStaticParams() {
  return [];
}

export default function OrderTrackingPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params.id as string;

  const [order, setOrder] = useState<FoodOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Review states
  const [restaurantRating, setRestaurantRating] = useState(0);
  const [restaurantComment, setRestaurantComment] = useState('');
  const [driverRating, setDriverRating] = useState(0);
  const [driverComment, setDriverComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewSubmitted, setReviewSubmitted] = useState(false);

  useEffect(() => {
    if (!orderId) {
      setError('ID de commande manquant');
      setLoading(false);
      return;
    }

    const orderRef = doc(db, FIRESTORE_COLLECTIONS.FOOD_ORDERS, orderId);
    
    // Écoute en temps réel des changements de statut (Règle 8 logic-brief.md)
    const unsubscribe = onSnapshot(
      orderRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data() as FoodOrder;
          // Conversion des timestamps pour l'affichage
          setOrder({
            ...data,
            id: docSnap.id,
            createdAt: data.createdAt as Timestamp,
            updatedAt: data.updatedAt as Timestamp,
          });
        } else {
          setError('Commande introuvable');
        }
        setLoading(false);
      },
      (err) => {
        console.error('Erreur écoute commande:', err);
        setError('Erreur lors du chargement de la commande');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [orderId]);

  const currentStepIndex = STATUS_STEPS.findIndex(step => step.id === order?.status);

  const handleSubmitReview = async () => {
    if (!order || restaurantRating === 0) {
      alert('Veuillez au moins noter le restaurant.');
      return;
    }

    setSubmittingReview(true);
    try {
      // 1. Soumettre avis restaurant
      await FoodDeliveryService.submitRestaurantReview({
        orderId: order.id!,
        restaurantId: order.restaurantId,
        userId: order.userId,
        rating: restaurantRating,
        comment: restaurantComment
      });

      // 2. Soumettre avis livreur si applicable
      if (order.driverId && driverRating > 0) {
        await FoodDeliveryService.submitDeliveryReview({
          orderId: order.id!,
          driverId: order.driverId,
          userId: order.userId,
          rating: driverRating,
          comment: driverComment
        });
      }

      setReviewSubmitted(true);
    } catch (err) {
      console.error('Erreur soumission avis:', err);
      alert('Erreur lors de la soumission de l\'avis.');
    } finally {
      setSubmittingReview(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4 text-center">
        <h2 className="text-xl font-bold text-gray-900 mb-2">Oups !</h2>
        <p className="text-gray-500 mb-6">{error || 'Commande introuvable'}</p>
        <button 
          onClick={() => router.push('/food/orders')}
          className="bg-primary text-white font-bold px-6 py-3 rounded-xl shadow-md"
        >
          Retour aux commandes
        </button>
      </div>
    );
  }

  const isDelivered = order.status === 'delivered';
  const isCancelled = order.status === 'cancelled';

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 p-4 sticky top-0 z-10 flex items-center justify-between shadow-sm">
        <button onClick={() => router.back()} className="p-2 -ml-2 text-gray-900 bg-gray-50 rounded-full hover:bg-gray-100">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-xl font-bold text-gray-900">Suivi Commande</h1>
        <div className="w-10"></div>
      </div>

      <div className="p-4 max-w-lg mx-auto space-y-6">
        {/* En-tête de la commande */}
        <section className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-1">{order.restaurantName}</h2>
          <p className="text-gray-500 text-sm mb-4">Commande n° {order.id?.slice(-6).toUpperCase()}</p>
          <OrderStatusBadge status={order.status} className="mx-auto" />
        </section>

        {/* Timeline de suivi (Optimistic UI pour le tracking) */}
        {!isCancelled && (
          <section className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
            <h3 className="font-bold text-gray-900 mb-6">État d'avancement</h3>
            <div className="space-y-6 relative before:absolute before:inset-0 before:ml-[1.4rem] before:w-0.5 before:bg-gray-100 before:-z-10">
              {STATUS_STEPS.map((step, index) => {
                const isCompleted = index <= currentStepIndex;
                const isCurrent = index === currentStepIndex;
                const Icon = step.icon;

                return (
                  <div key={step.id} className="flex gap-4 items-start relative z-10">
                    <div className={`p-2 rounded-full shrink-0 ${isCompleted ? 'bg-primary text-white' : 'bg-gray-100 text-gray-400'}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="pt-1.5">
                      <p className={`font-semibold ${isCurrent ? 'text-primary' : isCompleted ? 'text-gray-900' : 'text-gray-400'}`}>
                        {step.label}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Détails de la commande */}
        <section className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="font-bold text-gray-900 mb-4">Détails de la commande</h3>
          <div className="space-y-3 mb-4">
            {order.orderItems.map((item, idx) => (
              <div key={idx} className="flex justify-between text-sm">
                <span className="text-gray-600">
                  <span className="font-bold text-gray-900 mr-2">{item.itemQuantity}x</span>
                  {item.itemName}
                </span>
                <span className="font-medium text-gray-900">{(item.itemPrice * item.itemQuantity).toFixed(2)} {CURRENCY_CODE}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-gray-100 pt-4 flex justify-between items-center font-bold text-lg text-gray-900">
            <span>Total Payé</span>
            <span>{order.totalOrderPrice.toFixed(2)} {CURRENCY_CODE}</span>
          </div>
        </section>

        {/* Section Avis (visible uniquement si livrée et pas encore notée) */}
        {isDelivered && !reviewSubmitted && (
          <section className="bg-white p-5 rounded-2xl shadow-sm border border-primary/20">
            <h3 className="font-bold text-gray-900 mb-2">Comment s'est passée votre commande ?</h3>
            <p className="text-sm text-gray-500 mb-6">Votre avis aide les autres utilisateurs et les restaurants.</p>
            
            <div className="space-y-4">
              {/* Avis Restaurant */}
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2">Noter {order.restaurantName}</p>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map(star => (
                    <button key={star} onClick={() => setRestaurantRating(star)} className={`p-1 ${restaurantRating >= star ? 'text-yellow-400' : 'text-gray-200'}`}>
                      <Star className="w-8 h-8 fill-current" />
                    </button>
                  ))}
                </div>
                {restaurantRating > 0 && (
                  <textarea
                    value={restaurantComment}
                    onChange={(e) => setRestaurantComment(e.target.value)}
                    placeholder="Qu'avez-vous pensé du repas ? (Optionnel)"
                    className="w-full mt-3 p-3 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
                    rows={2}
                  />
                )}
              </div>

              {/* Avis Livreur */}
              {order.driverId && (
                <div className="pt-4 border-t border-gray-100">
                  <p className="text-sm font-semibold text-gray-700 mb-2">Noter le livreur</p>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map(star => (
                      <button key={star} onClick={() => setDriverRating(star)} className={`p-1 ${driverRating >= star ? 'text-yellow-400' : 'text-gray-200'}`}>
                        <Star className="w-8 h-8 fill-current" />
                      </button>
                    ))}
                  </div>
                  {driverRating > 0 && (
                    <textarea
                      value={driverComment}
                      onChange={(e) => setDriverComment(e.target.value)}
                      placeholder="Comment s'est passée la livraison ? (Optionnel)"
                      className="w-full mt-3 p-3 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
                      rows={2}
                    />
                  )}
                </div>
              )}

              <button
                onClick={handleSubmitReview}
                disabled={submittingReview || restaurantRating === 0}
                className="w-full mt-4 bg-primary text-white font-bold py-3 rounded-xl disabled:opacity-50 flex justify-center items-center gap-2"
              >
                {submittingReview ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Envoyer mon avis'}
              </button>
            </div>
          </section>
        )}

        {reviewSubmitted && (
          <section className="bg-green-50 p-5 rounded-2xl border border-green-100 text-center">
            <div className="bg-green-100 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-6 h-6 text-green-600" />
            </div>
            <h3 className="font-bold text-green-800 mb-1">Merci pour votre avis !</h3>
            <p className="text-sm text-green-600">Votre retour est précieux.</p>
          </section>
        )}
      </div>
    </div>
  );
}
