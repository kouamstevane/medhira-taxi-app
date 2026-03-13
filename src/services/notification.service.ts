/**
 * Service de notifications côté client
 * Isolé et réutilisable dans n'importe quel composant ou page.
 * 
 * Utilisation:
 *   import { notificationService } from '@/services/notification.service';
 */

import { db } from '@/config/firebase';
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  doc,
  updateDoc,
  writeBatch,
  onSnapshot,
  limit,
  Unsubscribe,
} from 'firebase/firestore';
import { NotificationCollection } from '@/types/firestore-collections';

export type { NotificationCollection };

class NotificationService {
  private readonly COLLECTION = 'notifications';

  /**
   * Récupère les notifications d'un utilisateur, triées par date décroissante.
   * 
   * @param userId - L'UID Firebase de l'utilisateur
   * @param maxResults - Nombre maximum de notifications à récupérer (défaut: 20)
   */
  async getNotifications(userId: string, maxResults = 20): Promise<NotificationCollection[]> {
    const q = query(
      collection(db, this.COLLECTION),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(maxResults)
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map((docSnap) => ({
      notificationId: docSnap.id,
      ...docSnap.data(),
    } as NotificationCollection));
  }

  /**
   * Écoute en temps réel le nombre de notifications non lues pour un utilisateur.
   * Retourne une fonction de désinscription (cleanup pour useEffect).
   * 
   * @param userId - L'UID Firebase de l'utilisateur
   * @param onCountChange - Callback appelé à chaque changement du compteur
   * 
   * @example
   * const unsubscribe = notificationService.listenUnreadCount(user.uid, setNotifCount);
   * return () => unsubscribe(); // dans useEffect cleanup
   */
  listenUnreadCount(userId: string, onCountChange: (count: number) => void): Unsubscribe {
    const q = query(
      collection(db, this.COLLECTION),
      where('userId', '==', userId),
      where('read', '==', false),
      limit(50) // Obligatoire : cap pour éviter lectures massives et erreurs de permission
    );

    return onSnapshot(q, (snapshot) => {
      onCountChange(snapshot.size);
    }, (error) => {
      // Gestion explicite des erreurs (ex: permission-denied si collection vide ou index manquant)
      console.warn('[NotificationService] listenUnreadCount error:', error.code);
      onCountChange(0);
    });
  }

  /**
   * Marque une notification comme lue.
   * 
   * @param notificationId - L'ID du document de notification
   */
  async markAsRead(notificationId: string): Promise<void> {
    const notifRef = doc(db, this.COLLECTION, notificationId);
    await updateDoc(notifRef, { read: true });
  }

  /**
   * Marque toutes les notifications non lues d'un utilisateur comme lues (batch write).
   * 
   * @param notifications - La liste des notifications à marquer comme lues
   */
  async markAllAsRead(notifications: NotificationCollection[]): Promise<void> {
    const unread = notifications.filter((n) => !n.read);
    if (unread.length === 0) return;

    const batch = writeBatch(db);
    unread.forEach((notif) => {
      const ref = doc(db, this.COLLECTION, notif.notificationId);
      batch.update(ref, { read: true });
    });

    await batch.commit();
  }
}

// Export singleton — une seule instance partagée dans toute l'app
export const notificationService = new NotificationService();
