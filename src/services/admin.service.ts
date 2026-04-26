/**
 * Service d'Administration des Chauffeurs
 *
 * Gère les actions administratives sur les comptes chauffeurs :
 * - Désactivation/Réactivation
 * - Suspension temporaire
 * - Suppression permanente
 * - Gestion des statuts
 *
 * SÉCURITÉ (FIX P0-2 — Privilege Escalation) :
 * Ce service est client-side. Toutes les fonctions qui effectuent des opérations
 * privilégiées (suspend/unsuspend/deactivate/reactivate/delete/stats détaillés)
 * appellent `requireAdmin()` en tête pour vérifier, côté client, que l'appelant
 * possède un document `admins/{uid}`. C'est une défense en profondeur :
 * la protection PRIMAIRE reste dans `firestore.rules` (fonction `isAdmin()` —
 * seul un admin peut update/delete un chauffeur qui ne lui appartient pas)
 * et dans les Cloud Functions callables (`adminManageDriver`).
 * Le check client évite les appels accidentels et fournit un feedback clair
 * si un utilisateur non-admin tente d'invoquer ces fonctions directement.
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
import { db, auth } from '@/config/firebase';
import { Driver } from '@/types';

/**
 * Vérifie que l'utilisateur courant est authentifié ET admin.
 * Cohérent avec `isAdmin()` dans firestore.rules et `useAdminAuth` :
 * l'admin est identifié par l'existence d'un document `admins/{uid}`.
 *
 * @throws Error('unauthenticated') si aucun utilisateur connecté
 * @throws Error('permission-denied') si l'utilisateur n'est pas admin
 */
async function requireAdmin(): Promise<string> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('unauthenticated: Vous devez être connecté pour effectuer cette action.');
  }
  const adminSnap = await getDoc(doc(db, 'admins', user.uid));
  if (!adminSnap.exists()) {
    throw new Error('permission-denied: Rôle administrateur requis.');
  }
  return user.uid;
}

/**
 * Suspendre un chauffeur (blocage temporaire)
 */
export const suspendDriver = async (
  driverId: string,
  reason: string,
  adminUid: string
): Promise<void> => {
  await requireAdmin();
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
  await requireAdmin();
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
  await requireAdmin();
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
  await requireAdmin();
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
  await requireAdmin();
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
 *
 * NOTE : Fonction non-privilégiée — appelée au login par le chauffeur lui-même
 * pour déterminer s'il peut accéder à son dashboard. Pas de requireAdmin().
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
 *
 * Fonction privilégiée : expose des données agrégées (tripsAccepted,
 * tripsDeclined, verified...) destinées à un admin. Un chauffeur qui
 * consulte ses propres stats passe par son service dédié, pas celui-ci.
 */
export const getDriverStats = async (driverId: string) => {
  await requireAdmin();
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
