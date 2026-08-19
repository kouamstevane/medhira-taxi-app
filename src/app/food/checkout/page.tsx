'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useCartStore } from '@/store/cartStore';
import { FoodDeliveryService } from '@/services/food-delivery.service';
import { buildCheckoutOrderItems, validateCartForCheckout } from '@/services/checkout.service';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { BottomNav } from '@/components/ui/BottomNav';
import { AddressInput } from '@/app/taxi/components/AddressInput';
import { useAuth } from '@/hooks/useAuth';
import { useGoogleMaps } from '@/hooks/useGoogleMaps';
import { doc, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';

import { CURRENCY_CODE } from '@/utils/constants';
import { getDeliveryDistance } from '@/utils/distance';
import type { CreateFoodOrderResult } from '@/services/food-delivery.service';
import { getFoodOrderDetailPath } from '@/utils/entity-route-paths';
import { CHECKOUT_FOOTER_CLASS, getFoodCheckoutErrorMessage, PROFILE_ADDRESS_EDIT_HREF } from './checkout-ui';
import { getInitialCheckoutAddress, getInitialCheckoutInputValue, isCheckoutAddressValid, isProfileAddressSelected, PROFILE_ADDRESS_PLACEHOLDER } from './checkout-address';

const StripePaymentElement = dynamic(
  () => import('@/components/stripe/StripePaymentElement').then((module) => ({ default: module.StripePaymentElement })),
  { ssr: false, loading: () => <div className="w-full h-48 bg-white/5 animate-pulse rounded-xl" /> }
);

export default function CheckoutPage() {
  const router = useRouter();
  const { currentUser: user, userData } = useAuth();
  const { items, restaurant, getSubtotal, clearCart } = useCartStore();
  const { autocompleteService } = useGoogleMaps();
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [deliveryPreference, setDeliveryPreference] = useState<'leave_at_door' | 'meet_outside' | 'meet_at_door'>('leave_at_door');
  const [deliveryInstructions, setDeliveryInstructions] = useState('');
  const [deliveryDistance, setDeliveryDistance] = useState(3.5);
  const [durationMinutes, setDurationMinutes] = useState(15);
  const [distanceIsEstimate, setDistanceIsEstimate] = useState(true);
  const [distanceLoading, setDistanceLoading] = useState(false);
  const [cardPayment, setCardPayment] = useState<{
    orderId: string;
    clientSecret: string;
    amount: number;
    currency: string;
  } | null>(null);
  const [serverOrder, setServerOrder] = useState<CreateFoodOrderResult | null>(null);

  // Payment State
  const [paymentMethod, setPaymentMethod] = useState<'wallet' | 'card'>('wallet');
  const [walletBalance, setWalletBalance] = useState<number | null>(null);

  const isWeekend = new Date().getDay() === 0 || new Date().getDay() === 6;
  const userAddress = getInitialCheckoutAddress(userData?.address, PROFILE_ADDRESS_PLACEHOLDER);
  const [checkoutAddress, setCheckoutAddress] = useState(getInitialCheckoutInputValue);
  const hasValidAddress = isCheckoutAddressValid(checkoutAddress);
  const deliveryAddress = checkoutAddress.trim();

  // Auth / Cart Guard
  React.useEffect(() => {
    if (submitted) return;
    if (!user) {
      router.replace('/login?next=/food/checkout');
      return;
    }
    if (!restaurant || items.length === 0) {
      router.replace('/food');
      return;
    }
  }, [user, restaurant, items.length, router, submitted]);

  // Read Wallet Balance
  useEffect(() => {
    if (!user?.uid) return;
    const unsub = onSnapshot(doc(db, 'wallets', user.uid), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setWalletBalance(typeof data.balance === 'number' ? data.balance : 0);
      } else {
        setWalletBalance(0);
      }
    }, (err) => {
      console.error('Erreur lecture wallet:', err);
      setWalletBalance(0);
    });
    return () => unsub();
  }, [user?.uid]);

  // Calculate delivery distance
  React.useEffect(() => {
    if (!restaurant || !hasValidAddress) return;

    const origin = deliveryAddress;
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
  }, [restaurant, hasValidAddress, deliveryAddress]);

  React.useEffect(() => {
    setServerOrder(null);
    setCardPayment(null);
  }, [items, restaurant?.id, deliveryPreference, deliveryInstructions, deliveryAddress, paymentMethod]);

  if (!submitted && (!user || !restaurant || items.length === 0)) {
    return null;
  }
  if (!restaurant) {
    return null;
  }

  const subtotal = getSubtotal();
  const deliveryCost = serverOrder?.deliveryCost ?? FoodDeliveryService.calculateDeliveryCost(deliveryDistance, isWeekend);
  const total = serverOrder?.totalOrderPrice ?? subtotal + deliveryCost;
  const displayedSubtotal = serverOrder?.basePrice ?? subtotal;
  const displayedDistance = serverOrder?.deliveryDistance ?? deliveryDistance;
  const isWalletInsufficient = paymentMethod === 'wallet' && walletBalance !== null && walletBalance < total;
  const hasServerTotal = serverOrder != null;
  const canStartCheckout = FoodDeliveryService.canStartFoodOrderCheckout({
    paymentMethod,
    walletBalance,
    estimatedTotal: total,
  });

  const cancelUnpaidOrder = async (orderId: string, reason: string) => {
    await updateDoc(doc(db, 'food_orders', orderId), {
      ...FoodDeliveryService.buildPaymentFailureCancellationUpdate(),
      cancellationReason: reason,
      cancelledAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }).catch((cleanupError) => {
      console.warn('Nettoyage commande paiement échoué impossible', cleanupError);
    });
  };

  const handleCreateOrder = async () => {
    if (loading) return;
    setErrorMsg(null);

    if (!hasValidAddress) {
      setErrorMsg('Renseignez une adresse de livraison valide (5 à 500 caractères).');
      return;
    }

    if (!canStartCheckout) {
      setErrorMsg(`Solde insuffisant (${(walletBalance ?? 0).toFixed(2)} ${CURRENCY_CODE} disponibles pour un total de ${total.toFixed(2)} ${CURRENCY_CODE}). Veuillez recharger votre portefeuille.`);
      return;
    }

    setLoading(true);
    try {
      if (serverOrder) {
        if (paymentMethod === 'card') {
          const payment = await FoodDeliveryService.payFoodOrderWithCard(serverOrder.orderId);
          if (!payment.clientSecret || !payment.amount || !payment.currency) {
            throw new Error('Impossible de préparer le paiement carte.');
          }
          setCardPayment({
            orderId: serverOrder.orderId,
            clientSecret: payment.clientSecret,
            amount: payment.amount,
            currency: payment.currency,
          });
          return;
        }

        try {
          await FoodDeliveryService.payFoodOrderWithWallet(serverOrder.orderId);
        } catch (payError) {
          await cancelUnpaidOrder(serverOrder.orderId, 'payment_failed');
          const msg = payError instanceof Error ? payError.message : String(payError);
          throw new Error(`Paiement échoué: ${msg}`);
        }

        setSubmitted(true);
        router.push(getFoodOrderDetailPath(serverOrder.orderId));
        clearCart();
        return;
      }

      const detailsEntries = await Promise.all(
        items
          .filter((item) => Boolean(item.customization))
          .map(async (item) => {
            const itemId = item.menuItemId ?? item.id;
            const details = await FoodDeliveryService.getCustomerMenuItemDetails(restaurant.id, itemId);
            return [itemId, details] as const;
          }),
      );
      const detailsByItemId = new Map(
        detailsEntries.filter((entry): entry is [string, NonNullable<typeof entry[1]>] => entry[1] !== null),
      );
      const validation = validateCartForCheckout(items, detailsByItemId);
      if (!validation.valid) {
        throw new Error(validation.errors[0]?.message ?? 'Vérifiez les personnalisations avant de continuer.');
      }

      const orderItems = buildCheckoutOrderItems(items);

      const createdOrder = await FoodDeliveryService.createFoodOrder({
        userId: user!.uid,
        restaurantId: restaurant.id,
        orderItems,
        deliveryDistance,
        isWeekend,
        deliveryAddress,
        deliveryPreference,
        deliveryInstructions,
        paymentMethod,
      });
      setServerOrder(createdOrder);
      return;
    } catch (error: unknown) {
      console.error('Erreur lors de la validation:', error);
      const msg = getFoodCheckoutErrorMessage(error);
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleCardPaymentSuccess = async (paymentIntentId: string) => {
    if (!cardPayment) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      await FoodDeliveryService.payFoodOrderWithCard(cardPayment.orderId, paymentIntentId);
      setSubmitted(true);
      clearCart();
      router.push(getFoodOrderDetailPath(cardPayment.orderId));
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Paiement carte non confirmé.';
      setErrorMsg(msg);
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
        <div className="w-10"></div>
      </div>

      <div className="p-4 space-y-6">
        {cardPayment ? (
          <section className="glass-card p-5 rounded-2xl border border-white/5">
            <h2 className="text-lg font-bold text-white mb-4">Paiement carte</h2>
            <StripePaymentElement
              clientSecret={cardPayment.clientSecret}
              amount={cardPayment.amount}
              currency={cardPayment.currency}
              submitLabel="Payer la commande"
              onSuccess={handleCardPaymentSuccess}
              onError={setErrorMsg}
            />
          </section>
        ) : (
          <>
        {/* Delivery Address */}
        <section className="glass-card p-5 rounded-2xl border border-white/5">
          <h2 className="text-lg font-bold text-white mb-4">Adresse de livraison</h2>
          <div className="space-y-4">
            <AddressInput
              label="Domicile"
              value={checkoutAddress}
              onChange={setCheckoutAddress}
              onSelect={(suggestion) => setCheckoutAddress(suggestion.description)}
              placeholder="Saisissez votre adresse"
              autocompleteService={autocompleteService}
              enableLocationButton
              locationButtonLabel="Utiliser ma position"
            />

            {userAddress && (
              <button
                type="button"
                onClick={() => setCheckoutAddress(userAddress)}
                aria-pressed={isProfileAddressSelected(checkoutAddress, userAddress)}
                className={[
                  'w-full rounded-xl border px-3 py-3 text-left transition hover:bg-primary/15',
                  isProfileAddressSelected(checkoutAddress, userAddress)
                    ? 'border-primary bg-primary/10'
                    : 'border-white/10 bg-white/[0.03]',
                ].join(' ')}
              >
                <span className="block text-xs font-medium uppercase tracking-wide text-primary">Adresse enregistrée</span>
                <span className="mt-1 block text-sm text-white">
                  {isProfileAddressSelected(checkoutAddress, userAddress)
                    ? 'Adresse de mon profil sélectionnée'
                    : 'Utiliser l’adresse de mon profil'}
                </span>
                <span className="mt-1 block text-xs text-slate-400">{userAddress}</span>
              </button>
            )}

            {hasValidAddress ? (
              <p className="text-slate-500 text-xs">
                {distanceLoading
                  ? 'Calcul de la distance...'
                  : `${distanceIsEstimate ? '~' : ''} ${deliveryDistance.toFixed(1)} km · ~${durationMinutes} min`}
              </p>
            ) : (
              <p className="text-destructive text-sm font-medium">Renseignez une adresse pour continuer.</p>
            )}

            <button onClick={() => router.push(PROFILE_ADDRESS_EDIT_HREF)} className="text-primary text-sm font-semibold">
              Modifier mon adresse enregistrée
            </button>
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
              <span>{displayedSubtotal.toFixed(2)} {CURRENCY_CODE}</span>
            </div>
            <div className="flex justify-between">
              <span>Frais de livraison ({hasServerTotal ? '' : distanceIsEstimate ? '~' : ''}{displayedDistance.toFixed(1)} km)</span>
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
          {hasServerTotal && (
            <div className="mt-4 bg-primary/10 border border-primary/20 text-primary p-3 rounded-xl text-sm">
              Montant vérifié par le serveur. Confirmez pour payer ce total.
            </div>
          )}
        </section>

        {/* Payment Method Selection */}
        <section className="glass-card p-5 rounded-2xl border border-white/5">
          <h2 className="text-lg font-bold text-white mb-4">Moyen de paiement</h2>
          <div className="space-y-3">
            {/* Wallet Option */}
            <button
              type="button"
              onClick={() => setPaymentMethod('wallet')}
              className={[
                'w-full p-4 rounded-xl border text-left transition-all flex items-center justify-between',
                paymentMethod === 'wallet' ? 'border-primary bg-primary/10' : 'border-white/10 bg-white/5',
              ].join(' ')}
            >
              <div className="flex items-center gap-3">
                <MaterialIcon name="account_balance_wallet" size="lg" className="text-primary" />
                <div>
                  <p className="font-semibold text-white">Portefeuille Medjira</p>
                  <p className="text-xs text-slate-400">
                    Solde: {walletBalance !== null ? `${walletBalance.toFixed(2)} ${CURRENCY_CODE}` : 'Chargement...'}
                  </p>
                </div>
              </div>
              {paymentMethod === 'wallet' && (
                <MaterialIcon name="check_circle" size="md" className="text-primary" />
              )}
            </button>

            {/* Card Option */}
            <button
              type="button"
              onClick={() => setPaymentMethod('card')}
              className={[
                'w-full p-4 rounded-xl border text-left transition-all flex items-center justify-between',
                paymentMethod === 'card' ? 'border-primary bg-primary/10' : 'border-white/10 bg-white/5',
              ].join(' ')}
            >
              <div className="flex items-center gap-3">
                <MaterialIcon name="credit_card" size="lg" className="text-slate-400" />
                <div>
                  <p className="font-semibold text-white">Carte bancaire / Apple Pay</p>
                  <p className="text-xs text-slate-400">Paiement sécurisé Stripe</p>
                </div>
              </div>
              {paymentMethod === 'card' && (
                <MaterialIcon name="check_circle" size="md" className="text-primary" />
              )}
            </button>
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
          </>
        )}

        {errorMsg && (
          <div className="bg-destructive/10 text-destructive p-4 rounded-xl text-sm border border-destructive/20 flex items-center justify-between">
            {errorMsg}
          </div>
        )}
      </div>

      {/* Checkout Footer */}
      {!cardPayment && (
      <div className={CHECKOUT_FOOTER_CLASS}>
        <button
          onClick={handleCreateOrder}
          disabled={loading || !canStartCheckout || !hasValidAddress}
          className="w-full bg-gradient-to-r from-primary to-[#ffae33] text-white font-bold text-lg py-4 rounded-xl hover:opacity-90 transition-all flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <MaterialIcon name="progress_activity" size="md" className="animate-spin" />
              Traitement du paiement...
            </>
          ) : isWalletInsufficient ? (
            'Solde portefeuille insuffisant'
          ) : !hasValidAddress ? (
            'Adresse de livraison manquante'
          ) : (
            hasServerTotal ? (
              `Confirmer et payer ${total.toFixed(2)} ${CURRENCY_CODE}`
            ) : (
            `Payer ${total.toFixed(2)} ${CURRENCY_CODE}`
            )
          )}
        </button>

      </div>
      )}
      <BottomNav />
    </div>
  );
}
