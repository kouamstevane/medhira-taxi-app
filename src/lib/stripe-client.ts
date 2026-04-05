/**
 * Chargeur Stripe.js côté client (singleton)
 *
 * Utilisation : importer dans les composants React qui affichent
 * l'Element de paiement ou des formulaires Stripe.
 *
 * @module lib/stripe-client
 */

import { loadStripe, type Stripe } from '@stripe/stripe-js';

if (!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) {
  throw new Error('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY manquant dans les variables d\'environnement');
}

// Singleton — loadStripe met en cache la promesse entre les renders
let stripePromise: Promise<Stripe | null> | null = null;

export function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);
  }
  return stripePromise;
}
