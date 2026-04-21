/**
 * Service d'Administration des Chauffeurs
 * 
 * Gère les actions administratives sur les comptes chauffeurs :
 * - Désactivation/Réactivation
 * - Suspension temporaire
 * - Suppression permanente
 * - Gestion des statuts
 * 
 * @module services/admin
 */

import {
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  getDoc,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { Driver } from '@/types';

/**
 * Suspendre un chauffeur (blocage temporaire)
 */
export const suspendDriver = async (
  driverId: string,
  reason: string,
  adminUid: string
): Promise<void> => {
  const driverRef = doc(db, 'drivers', driverId);
  
  await updateDoc(driverRef, {
    isSuspended: true,
    suspensionReason: reason,
    suspendedAt: serverTimestamp(),
    suspendedBy: adminUid,
    status: 'offline', // Forcer le chauffeur hors ligne
    isAvailable: false,
    updatedAt: serverTimestamp(),
  });
};

/**
 * Réactiver un chauffeur suspendu
 */
export const unsuspendDriver = async (
  driverId: string,
  adminUid: string
): Promise<void> => {
  const driverRef = doc(db, 'drivers', driverId);
  
  await updateDoc(driverRef, {
    isSuspended: false,
    status: 'approved',
    isAvailable: true,
    suspensionReason: null,
    suspendedAt: null,
    suspendedBy: null,
    updatedAt: serverTimestamp(),
  });
};

/**
 * Désactiver définitivement un chauffeur (sans suppression)
 */
export const deactivateDriver = async (
  driverId: string,
  reason: string,
  adminUid: string
): Promise<void> => {
  const driverRef = doc(db, 'drivers', driverId);
  
  await updateDoc(driverRef, {
    isActive: false,
    isSuspended: true,
    suspensionReason: reason,
    suspendedAt: serverTimestamp(),
    suspendedBy: adminUid,
    status: 'offline',
    isAvailable: false,
    updatedAt: serverTimestamp(),
  });
};

/**
 * Réactiver un chauffeur désactivé
 */
export const reactivateDriver = async (
  driverId: string,
  adminUid: string
): Promise<void> => {
  const driverRef = doc(db, 'drivers', driverId);
  
  await updateDoc(driverRef, {
    isActive: true,
    isSuspended: false,
    suspensionReason: null,
    suspendedAt: null,
    suspendedBy: null,
    updatedAt: serverTimestamp(),
  });
};

/**
 * Supprimer définitivement un chauffeur
 */
export const deleteDriver = async (
  driverId: string
): Promise<void> => {
  try {
    const driverRef = doc(db, 'drivers', driverId);
    await deleteDoc(driverRef);
  } catch (error) {
    console.error('[admin.service] deleteDriver failed:', error);
    throw error;
  }
};

/**
 * Vérifier si un chauffeur peut se connecter
 */
export const canDriverLogin = async (driverId: string): Promise<{
  canLogin: boolean;
  reason?: string;
}> => {
  const driverRef = doc(db, 'drivers', driverId);
  const driverSnap = await getDoc(driverRef);

  if (!driverSnap.exists()) {
    return {
      canLogin: false,
      reason: 'Compte introuvable',
    };
  }

  const driver = driverSnap.data() as Driver;

  // Vérifier si le compte est actif
  if (driver.isActive === false) {
    return {
      canLogin: false,
      reason: 'Votre compte a été désactivé par un administrateur. Contactez le support.',
    };
  }

  // Vérifier si le compte est suspendu
  if (driver.isSuspended) {
    return {
      canLogin: false,
      reason: driver.suspensionReason || 'Votre compte a été suspendu temporairement. Contactez le support.',
    };
  }

  // Vérifier si le compte est approuvé
  if (driver.status === 'pending') {
    return {
      canLogin: false,
      reason: 'Votre compte est en cours de vérification.',
    };
  }

  if (driver.status === 'rejected') {
    return {
      canLogin: false,
      reason: 'Votre demande a été rejetée. Vous pouvez soumettre une nouvelle demande.',
    };
  }

  return {
    canLogin: true,
  };
};

/**
 * Obtenir les statistiques d'un chauffeur
 */
export const getDriverStats = async (driverId: string) => {
  const driverRef = doc(db, 'drivers', driverId);
  const driverSnap = await getDoc(driverRef);

  if (!driverSnap.exists()) {
    return null;
  }

  const driver = driverSnap.data() as Driver;

  return {
    totalTrips: driver.totalTrips || 0,
    tripsAccepted: driver.tripsAccepted || 0,
    tripsDeclined: driver.tripsDeclined || 0,
    rating: driver.rating || 5,
    status: driver.status,
    isActive: driver.isActive !== false,
    isSuspended: driver.isSuspended || false,
    verified: driver.verified,
  };
};
