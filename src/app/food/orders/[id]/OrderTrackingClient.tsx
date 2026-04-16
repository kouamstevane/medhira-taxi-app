'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { doc, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { FIRESTORE_COLLECTIONS } from '@/types/firestore-collections';
import { FoodOrder } from '@/types/food-delivery';
import { OrderStatusBadge } from '@/components/food/OrderStatusBadge';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { FoodDeliveryService } from '@/services/food-delivery.service';
import { CURRENCY_CODE } from '@/utils/constants';
import { BottomNav } from '@/components/ui/BottomNav';
import { useToast } from '@/hooks/useToast';
import { ToastContainer } from '@/components/ui/Toast';

const STATUS_STEPS = [
  { id: 'pending', icon: 'schedule', label: 'En attente' },
  { id: 'confirmed', icon: 'check_circle', label: 'Acceptée' },
  { id: 'preparing', icon: 'restaurant', label: 'En préparation' },
  { id: 'ready', icon: 'delivery_dining', label: 'Prête' },
  { id: 'delivering', icon: 'delivery_dining', label: 'En livraison' },
  { id: 'delivered', icon: 'location_on', label: 'Livrée' },
];

export default function OrderTrackingClient() {
  const params = useParams()
  const orderId = params.id as string
  const router = useRouter();
  const { showError, toasts, removeToast } = useToast();

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
      showError('Veuillez au moins noter le restaurant.');
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
      showError('Erreur lors de la soumission de l\'avis.');
    } finally {
      setSubmittingReview(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <MaterialIcon name="progress_activity" size="xl" className="animate-spin text-primary" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4 text-center">
        <h2 className="text-xl font-bold text-white mb-2">Oups !</h2>
        <p className="text-slate-400 mb-6">{error || 'Commande introuvable'}</p>
        <button
          onClick={() => router.push('/food/orders')}
          className="bg-gradient-to-r from-primary to-[#ffae33] text-white font-bold px-6 py-3 rounded-xl"
        >
          Retour aux commandes
        </button>
      </div>
    );
  }

  const isDelivered = order.status === 'delivered';
  const isCancelled = order.status === 'cancelled';

  return (
    <>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <div className="min-h-screen bg-background pb-20 max-w-[430px] mx-auto">
      {/* Header */}
      <div className="bg-background/80 backdrop-blur-xl border-b border-white/5 p-4 sticky top-0 z-20 flex items-center justify-between">
        <button onClick={() => router.back()} className="p-2 -ml-2 text-white bg-white/5 rounded-full hover:bg-white/10">
          <MaterialIcon name="arrow_back" size="lg" />
        </button>
        <h1 className="text-xl font-bold text-white">Suivi Commande</h1>
        <div className="w-10"></div>
      </div>

      <div className="p-4 max-w-lg mx-auto space-y-6">
        {/* En-tête de la commande */}
        <section className="glass-card p-5 rounded-2xl border border-white/5 text-center">
          <h2 className="text-2xl font-bold text-white mb-1">{order.restaurantName}</h2>
          <p className="text-slate-400 text-sm mb-4">Commande n° {order.id?.slice(-6).toUpperCase()}</p>
          <OrderStatusBadge status={order.status} className="mx-auto" />
        </section>

        {/* Timeline de suivi (Optimistic UI pour le tracking) */}
        {!isCancelled && (
          <section className="glass-card p-5 rounded-2xl border border-white/5">
            <h3 className="font-bold text-white mb-6">État d'avancement</h3>
            <div className="space-y-6 relative before:absolute before:inset-0 before:ml-[1.4rem] before:w-0.5 before:bg-white/5 before:-z-10">
              {STATUS_STEPS.map((step, index) => {
                const isCompleted = index <= currentStepIndex;
                const isCurrent = index === currentStepIndex;

                return (
                  <div key={step.id} className="flex gap-4 items-start relative z-10">
                    <div className={`p-2 rounded-full shrink-0 ${isCompleted ? 'bg-primary text-white' : 'bg-white/5 text-slate-500'}`}>
                      <MaterialIcon name={step.icon} size="md" />
                    </div>
                    <div className="pt-1.5">
                      <p className={`font-semibold ${isCurrent ? 'text-primary' : isCompleted ? 'text-white' : 'text-slate-500'}`}>
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
        <section className="glass-card p-5 rounded-2xl border border-white/5">
          <h3 className="font-bold text-white mb-4">Détails de la commande</h3>
          <div className="space-y-3 mb-4">
            {order.orderItems.map((item, idx) => (
              <div key={idx} className="flex justify-between text-sm">
                <span className="text-slate-300">
                  <span className="font-bold text-white mr-2">{item.itemQuantity}x</span>
                  {item.itemName}
                </span>
                <span className="font-medium text-white">{(item.itemPrice * item.itemQuantity).toFixed(2)} {CURRENCY_CODE}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-white/5 pt-4 flex justify-between items-center font-bold text-lg text-white">
            <span>Total Payé</span>
            <span>{order.totalOrderPrice.toFixed(2)} {CURRENCY_CODE}</span>
          </div>
        </section>

        {/* Section Avis (visible uniquement si livrée et pas encore notée) */}
        {isDelivered && !reviewSubmitted && (
          <section className="glass-card p-5 rounded-2xl border border-primary/20">
            <h3 className="font-bold text-white mb-2">Comment s'est passée votre commande ?</h3>
            <p className="text-sm text-slate-400 mb-6">Votre avis aide les autres utilisateurs et les restaurants.</p>

            <div className="space-y-4">
              {/* Avis Restaurant */}
              <div>
                <p className="text-sm font-semibold text-slate-300 mb-2">Noter {order.restaurantName}</p>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map(star => (
                    <button key={star} onClick={() => setRestaurantRating(star)} className={`p-1 ${restaurantRating >= star ? 'text-yellow-400' : 'text-slate-600'}`}>
                      <MaterialIcon name="star" size="xl" filled={restaurantRating >= star} />
                    </button>
                  ))}
                </div>
                {restaurantRating > 0 && (
                  <textarea
                    value={restaurantComment}
                    onChange={(e) => setRestaurantComment(e.target.value)}
                    placeholder="Qu'avez-vous pensé du repas ? (Optionnel)"
                    className="w-full mt-3 p-3 text-sm glass-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-white"
                    rows={2}
                  />
                )}
              </div>

              {/* Avis Livreur */}
              {order.driverId && (
                <div className="pt-4 border-t border-white/5">
                  <p className="text-sm font-semibold text-slate-300 mb-2">Noter le livreur</p>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map(star => (
                      <button key={star} onClick={() => setDriverRating(star)} className={`p-1 ${driverRating >= star ? 'text-yellow-400' : 'text-slate-600'}`}>
                        <MaterialIcon name="star" size="xl" filled={driverRating >= star} />
                      </button>
                    ))}
                  </div>
                  {driverRating > 0 && (
                    <textarea
                      value={driverComment}
                      onChange={(e) => setDriverComment(e.target.value)}
                      placeholder="Comment s'est passée la livraison ? (Optionnel)"
                      className="w-full mt-3 p-3 text-sm glass-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-white"
                      rows={2}
                    />
                  )}
                </div>
              )}

              <button
                onClick={handleSubmitReview}
                disabled={submittingReview || restaurantRating === 0}
                className="w-full mt-4 bg-gradient-to-r from-primary to-[#ffae33] text-white font-bold py-3 rounded-xl disabled:opacity-50 flex justify-center items-center gap-2"
              >
                {submittingReview ? <MaterialIcon name="progress_activity" size="md" className="animate-spin" /> : 'Envoyer mon avis'}
              </button>
            </div>
          </section>
        )}

        {reviewSubmitted && (
          <section className="bg-green-500/10 p-5 rounded-2xl border border-green-500/20 text-center">
            <div className="bg-green-500/10 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
              <MaterialIcon name="check_circle" size="lg" className="text-green-400" />
            </div>
            <h3 className="font-bold text-green-400 mb-1">Merci pour votre avis !</h3>
            <p className="text-sm text-green-400/80">Votre retour est précieux.</p>
          </section>
        )}
      </div>
      </div>
      <BottomNav />
    </>
  );
}
