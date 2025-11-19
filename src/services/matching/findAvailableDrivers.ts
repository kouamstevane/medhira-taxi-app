/**
 * Service de Recherche de Chauffeurs Disponibles
 * 
 * Trouve les chauffeurs disponibles dans une zone géographique
 * et les trie par distance et score (rating, acceptRate).
 * 
 * @module services/matching/findAvailableDrivers
 */

import {
  collection,
  query,
  where,
  getDocs,
  limit,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { Location } from '@/types';
import { logger } from '@/utils/logger';

export interface AvailableDriver {
  driverId: string;
  driverName: string;
  location: Location;
  distance: number; // Distance en km
  score: number; // Score combiné (rating + acceptRate)
  rating: number;
  acceptRate: number;
  isAvailable: boolean;
  carModel?: string;
  carPlate?: string;
  carColor?: string;
}

export interface FindAvailableDriversParams {
  location: Location;
  rangeKm: number;
  maxResults?: number;
  carType?: string; // Optionnel : filtrer par type de véhicule
}

/**
 * Calculer la distance entre deux points (formule de Haversine)
 */
function calculateDistance(loc1: Location, loc2: Location): number {
  const R = 6371; // Rayon de la Terre en km
  const dLat = toRad(loc2.lat - loc1.lat);
  const dLon = toRad(loc2.lng - loc1.lng);
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(loc1.lat)) *
      Math.cos(toRad(loc2.lat)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Calculer le score d'un chauffeur
 * Score = (rating * 0.6) + (acceptRate * 0.4)
 * Plus le score est élevé, meilleur est le chauffeur
 */
function calculateScore(rating: number, acceptRate: number): number {
  const normalizedRating = Math.min(rating / 5, 1); // Normaliser entre 0 et 1
  return normalizedRating * 0.6 + acceptRate * 0.4;
}

/**
 * Calculer le taux d'acceptation d'un chauffeur
 * acceptRate = tripsAccepted / (tripsAccepted + tripsDeclined)
 */
function calculateAcceptRate(
  tripsAccepted: number,
  tripsDeclined: number
): number {
  const total = tripsAccepted + tripsDeclined;
  if (total === 0) return 0.5; // Par défaut 50% si aucune donnée
  return tripsAccepted / total;
}

/**
 * Trouver les chauffeurs disponibles dans une zone
 * 
 * Pour l'instant, on utilise une requête simple sur Firestore.
 * Pour une meilleure performance avec beaucoup de chauffeurs,
 * on pourrait utiliser Geohash ou GeoFirestore.
 */
export const findAvailableDrivers = async (
  params: FindAvailableDriversParams
): Promise<AvailableDriver[]> => {
  const { location, rangeKm, maxResults = 10, carType } = params;

  try {
    logger.info('Recherche de chauffeurs disponibles', {
      location,
      rangeKm,
      maxResults,
      carType,
    });

    // Récupérer tous les chauffeurs disponibles et approuvés
    const driversRef = collection(db, 'drivers');
    
    // Essayer d'abord avec isAvailable == true
    let driversQuery = query(
      driversRef,
      where('status', '==', 'approved'),
      where('isAvailable', '==', true),
      limit(50)
    );

    let driversSnapshot = await getDocs(driversQuery);
    
    // Si aucun trouvé, essayer sans le filtre isAvailable (pour inclure ceux qui n'ont pas ce champ)
    if (driversSnapshot.empty) {
      logger.warn('Aucun chauffeur avec isAvailable=true, recherche sans ce filtre');
      driversQuery = query(
        driversRef,
        where('status', '==', 'approved'),
        limit(50)
      );
      driversSnapshot = await getDocs(driversQuery);
    }
    
    if (driversSnapshot.empty) {
      logger.info('Aucun chauffeur approuvé trouvé');
      return [];
    }
    
    logger.info(`Trouvé ${driversSnapshot.size} chauffeur(s) approuvé(s) à filtrer`);

    const availableDrivers: AvailableDriver[] = [];

    // Filtrer par distance et calculer les scores
    for (const driverDoc of driversSnapshot.docs) {
      const driverData = driverDoc.data();
      const driverId = driverDoc.id;

      let distance: number;
      let driverLocation: Location | null = null;

      // Vérifier si le chauffeur a une localisation
      if (driverData.currentLocation) {
        driverLocation = {
          lat: driverData.currentLocation.lat || driverData.currentLocation.latitude,
          lng: driverData.currentLocation.lng || driverData.currentLocation.longitude,
        };
        // Calculer la distance réelle
        distance = calculateDistance(location, driverLocation);
      } else {
        // Si pas de localisation, utiliser une distance par défaut (0 km pour inclure le chauffeur)
        // Cela permet aux chauffeurs sans GPS d'être quand même disponibles
        logger.warn('Chauffeur sans localisation, utilisation distance par défaut', { driverId });
        distance = 0; // Distance 0 pour inclure le chauffeur même sans localisation
      }

      // Filtrer par distance (sauf si distance = 0, ce qui signifie pas de localisation)
      if (distance > rangeKm && driverLocation !== null) {
        continue;
      }

      // Vérifier la disponibilité (si le champ existe, il doit être true)
      // Si le champ n'existe pas, on considère le chauffeur comme disponible
      const isAvailable = driverData.isAvailable !== undefined ? driverData.isAvailable : true;
      
      if (!isAvailable) {
        logger.debug('Chauffeur non disponible', { driverId, isAvailable: driverData.isAvailable });
        continue;
      }

      // Filtrer par type de véhicule si spécifié
      // Note: carType peut être dans car.type ou directement dans carType
      const driverCarType = driverData.car?.type || driverData.carType;
      if (carType && driverCarType && driverCarType !== carType) {
        logger.debug('Type de véhicule ne correspond pas', { driverId, required: carType, driver: driverCarType });
        continue;
      }

      // Calculer le taux d'acceptation
      const tripsAccepted = driverData.tripsAccepted || 0;
      const tripsDeclined = driverData.tripsDeclined || 0;
      const acceptRate = calculateAcceptRate(tripsAccepted, tripsDeclined);

      // Récupérer la note
      const rating = driverData.rating || 0;

      // Calculer le score
      const score = calculateScore(rating, acceptRate);

      availableDrivers.push({
        driverId,
        driverName: `${driverData.firstName || ''} ${driverData.lastName || ''}`.trim() || 'Chauffeur',
        location: driverLocation || location, // Utiliser la location du pickup si pas de localisation
        distance,
        score,
        rating,
        acceptRate,
        isAvailable: true, // On a déjà filtré, donc c'est disponible
        carModel: driverData.car?.model || driverData.carModel,
        carPlate: driverData.car?.plate || driverData.carPlate,
        carColor: driverData.car?.color || driverData.carColor,
      });
      
      logger.debug('Chauffeur ajouté à la liste', { driverId, driverName: availableDrivers[availableDrivers.length - 1].driverName, distance, score });
    }

    // Trier par score (décroissant) puis par distance (croissante)
    availableDrivers.sort((a, b) => {
      // Priorité au score
      if (Math.abs(a.score - b.score) > 0.1) {
        return b.score - a.score;
      }
      // En cas d'égalité, priorité à la distance
      return a.distance - b.distance;
    });

    // Limiter le nombre de résultats
    const results = availableDrivers.slice(0, maxResults);

    logger.info('Chauffeurs disponibles trouvés', {
      total: availableDrivers.length,
      returned: results.length,
    });

    return results;
  } catch (error: any) {
    logger.error('Erreur lors de la recherche de chauffeurs', { error });
    throw new Error(`Erreur lors de la recherche de chauffeurs: ${error.message}`);
  }
};

