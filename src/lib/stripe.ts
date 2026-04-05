/**
 * Instance Stripe côté serveur (singleton)
 *
 * Utilisation : importer uniquement dans les routes API (Server Components)
 * NE JAMAIS importer dans du code client ("use client")
 *
 * @module lib/stripe
 */

import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY manquant dans les variables d\'environnement');
}

// Singleton pour éviter plusieurs instances en développement (hot-reload)
const globalForStripe = global as unknown as { stripe: Stripe };

export const stripe =
  globalForStripe.stripe ??
  new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2026-03-25.dahlia',
    typescript: true,
  });

if (process.env.NODE_ENV !== 'production') {
  globalForStripe.stripe = stripe;
}

export default stripe;
