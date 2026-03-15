/**
 * Service de Recherche de Chauffeurs Disponibles
 * 
 * Trouve les chauffeurs disponibles dans une zone géographique
 * et les trie par temps de trajet, distance et score.
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
import { Location, AvailableDriver, FindDriversConfig } from '@/types';
import { logger } from '@/utils/logger';

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
 * Estimer le temps de trajet en minutes basé sur la distance
 * Vitesse moyenne supposée : 30 km/h en ville
 */
function estimateTravelTime(distanceKm: number): number {
  const averageSpeedKmh = 30;
  return (distanceKm / averageSpeedKmh) * 60;
}

/**
 * Obtenir le temps de trajet réel via Google Directions API
 */
async function getRealTravelTime(
  origin: Location,
  destination: Location
): Promise<number | null> {
  if (typeof window === 'undefined' || !window.google || !window.google.maps) {
    return null;
  }

  try {
    const service = new window.google.maps.DirectionsService();
    const result = await service.route({
      origin: new window.google.maps.LatLng(origin.lat, origin.lng),
      destination: new window.google.maps.LatLng(destination.lat, destination.lng),
      travelMode: window.google.maps.TravelMode.DRIVING,
    });

    if (result.routes[0]?.legs[0]?.duration?.value) {
      return Math.ceil(result.routes[0].legs[0].duration.value / 60);
    }
    return null;
  } catch (error) {
    logger.warn('Erreur Directions API', { error });
    return null;
  }
}

/**
 * Calculer le score d'un chauffeur
 * Score = (rating * 0.6) + (acceptRate * 0.4)
 */
function calculateScore(rating: number, acceptRate: number): number {
  const normalizedRating = Math.min(rating / 5, 1);
  return normalizedRating * 0.6 + acceptRate * 0.4;
}

/**
 * Calculer le taux d'acceptation d'un chauffeur
 */
function calculateAcceptRate(
  tripsAccepted: number,
  tripsDeclined: number
): number {
  const total = tripsAccepted + tripsDeclined;
  if (total === 0) return 0.5;
  return tripsAccepted / total;
}

/**
 * Trouver les chauffeurs disponibles dans une zone
 */
export const findAvailableDrivers = async (
  config: FindDriversConfig
): Promise<AvailableDriver[]> => {
  const {
    location,
    rangeKm = 20, // Rayon large pour filtrer ensuite par temps
    maxTravelMinutes = 5,
    maxResults = 10,
    carType,
    useDirectionsAPI = false
  } = config;

  try {
    logger.info('Recherche de chauffeurs disponibles', {
      location,
      rangeKm,
      maxTravelMinutes,
      maxResults,
      carType,
    });

    // 1. Récupération initiale large via Firestore
    const driversRef = collection(db, 'drivers');

    // Essayer d'abord avec isAvailable == true
    //  Ajout limit(50) déjà présent - OK (medJira.md #57)
    let driversQuery = query(
      driversRef,
      where('status', '==', 'approved'),
      where('isAvailable', '==', true),
      limit(50)
    );

    let driversSnapshot = await getDocs(driversQuery);

    if (driversSnapshot.empty) {
      logger.warn('Aucun chauffeur avec isAvailable=true, recherche sans ce filtre');
      //  Ajout limit(50) déjà présent - OK (medJira.md #57)
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

    // 2. Filtrage et calculs initiaux (Estimation)
    let candidates: AvailableDriver[] = [];

    for (const driverDoc of driversSnapshot.docs) {
      const driverData = driverDoc.data();
      const driverId = driverDoc.id;

      // Vérification localisation
      let driverLocation: Location;
      let distance: number;

      if (driverData.currentLocation) {
        driverLocation = {
          lat: driverData.currentLocation.lat || driverData.currentLocation.latitude,
          lng: driverData.currentLocation.lng || driverData.currentLocation.longitude,
        };
        distance = calculateDistance(location, driverLocation);
      } else {
        // Skip drivers without location
        continue;
      }

      // Filtre distance brute (pré-filtre)
      if (distance > rangeKm) continue;

      // Vérification disponibilité explicite
      const isAvailable = driverData.isAvailable !== undefined ? driverData.isAvailable : true;
      if (!isAvailable) continue;

      // Filtre type véhicule
      const driverCarType = driverData.car?.type || driverData.carType;
      if (carType && driverCarType && driverCarType !== carType) continue;

      // Calculs métriques
      const tripsAccepted = driverData.tripsAccepted || 0;
      const tripsDeclined = driverData.tripsDeclined || 0;
      const acceptRate = calculateAcceptRate(tripsAccepted, tripsDeclined);
      const rating = driverData.rating || 0;
      const score = calculateScore(rating, acceptRate);

      // Estimation temps de trajet
      const estimatedTime = estimateTravelTime(distance);

      // Pré-filtre sur le temps estimé (avec une marge de 50% pour ne pas exclure trop vite)
      if (estimatedTime > maxTravelMinutes * 1.5) continue;

      candidates.push({
        driverId,
        driverName: `${driverData.firstName || ''} ${driverData.lastName || ''}`.trim() || 'Chauffeur',
        location: driverLocation,
        distance,
        travelTimeMinutes: estimatedTime,
        score,
        rating,
        acceptRate,
        isAvailable: true,
        carModel: driverData.car?.model || driverData.carModel,
        carPlate: driverData.car?.plate || driverData.carPlate,
        carColor: driverData.car?.color || driverData.carColor,
      });
    }

    // 3. Vérification précise avec Directions API (Hybride)
    if (useDirectionsAPI && candidates.length > 0) {
      // Trier par estimation d'abord pour ne vérifier que les plus prometteurs
      candidates.sort((a, b) => (a.travelTimeMinutes || 0) - (b.travelTimeMinutes || 0));

      // OPTIMISATION MOBILE : Vérifier seulement les 5 meilleurs pour réduire la latence et la data
      const candidatesToVerify = candidates.slice(0, 5);
      const verifiedCandidates: AvailableDriver[] = [];

      // Exécuter les requêtes en parallèle avec un timeout strict
      await Promise.all(candidatesToVerify.map(async (candidate) => {
        // Timeout de 2s pour ne pas bloquer l'UI sur mobile
        const timeoutPromise = new Promise<number | null>((resolve) =>
          setTimeout(() => resolve(null), 2000)
        );

        const apiPromise = getRealTravelTime(candidate.location, location);

        // Race entre l'API et le timeout
        const realTime = await Promise.race([apiPromise, timeoutPromise]);

        if (realTime !== null) {
          // Mettre à jour avec le temps réel
          candidate.travelTimeMinutes = realTime;

          // Filtrer strictement sur le temps réel
          if (realTime <= maxTravelMinutes) {
            verifiedCandidates.push(candidate);
          }
        } else {
          // Fallback sur l'estimation si API échoue ou timeout
          // Cela garantit une réponse "instantanée" même si le réseau est lent
          if ((candidate.travelTimeMinutes || 0) <= maxTravelMinutes) {
            verifiedCandidates.push(candidate);
          }
        }
      }));

      candidates = verifiedCandidates;
    } else {
      // Filtrage strict sur l'estimation si pas d'API
      candidates = candidates.filter(c => (c.travelTimeMinutes || 0) <= maxTravelMinutes);
    }

    // 4. Tri final
    candidates.sort((a, b) => {
      // Priorité au temps de trajet
      const timeA = a.travelTimeMinutes || 0;
      const timeB = b.travelTimeMinutes || 0;

      if (Math.abs(timeA - timeB) > 2) { // Si différence > 2 min
        return timeA - timeB; // Le plus rapide d'abord
      }

      // Sinon par score
      return b.score - a.score;
    });

    const results = candidates.slice(0, maxResults);

    logger.info('Chauffeurs disponibles trouvés (filtrés par temps)', {
      total: candidates.length,
      returned: results.length,
      maxTravelMinutes,
    });

    return results;
  } catch (error: any) {
    logger.error('Erreur lors de la recherche de chauffeurs', { error });
    throw new Error(`Erreur lors de la recherche de chauffeurs: ${error.message}`);
  }
};
