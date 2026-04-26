// src/config/stripe.ts
/**
 * Constantes de configuration Stripe pour l'application Medjira.
 * Séparées de utils/constants.ts pour pouvoir évoluer indépendamment.
 *
 * NOTE: DRIVER_SHARE_RATE et PLATFORM_COMMISSION_RATE sont définis dans src/types/stripe.ts
 * (source unique de vérité). Ne pas les redéfinir ici.
 */

/** Taux de partage livreur (70% des frais de livraison nets) */
export const DELIVERY_SHARE_RATE = 0.70
