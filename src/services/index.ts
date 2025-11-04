/**
 * Index Central des Services
 * 
 * Re-exporte tous les services de l'application pour un accès simplifié.
 * 
 * @module services
 */

// Services d'authentification
export * as AuthService from './auth.service';

// Services de taxi et réservation
export * as TaxiService from './taxi.service';

// Services de portefeuille
export * as WalletService from './wallet.service';

// Services de chauffeur
export * as DriverService from './driver.service';
