'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { notificationService, NotificationCollection } from '@/services/notification.service';

interface UseNotificationsReturn {
  notifications: NotificationCollection[];
  unreadCount: number;
  isLoading: boolean;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  refresh: () => Promise<void>;
}

/**
 * Hook React pour gérer les notifications d'un utilisateur.
 * Isolé et réutilisable dans n'importe quel composant.
 * 
 * @example
 * function MyComponent() {
 *   const { unreadCount, markAsRead } = useNotifications();
 *   return <Badge count={unreadCount} />;
 * }
 */
export function useNotifications(): UseNotificationsReturn {
  const { currentUser } = useAuth();
  const [notifications, setNotifications] = useState<NotificationCollection[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const notificationsRef = useRef<NotificationCollection[]>([]);

  useEffect(() => {
    notificationsRef.current = notifications;
  }, [notifications]);

  // Récupération initiale des notifications
  const refresh = useCallback(async () => {
    if (!currentUser) return;
    setIsLoading(true);
    try {
      const data = await notificationService.getNotifications(currentUser.uid, 30);
      setNotifications(data);
    } catch (error) {
      console.error('[useNotifications] Erreur chargement:', error);
    } finally {
      setIsLoading(false);
    }
  }, [currentUser]);

  // Chargement initial
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Écoute temps réel du compteur non lu
  useEffect(() => {
    if (!currentUser) return;

    const unsubscribe = notificationService.listenUnreadCount(
      currentUser.uid,
      setUnreadCount
    );

    return () => unsubscribe();
  }, [currentUser]);

  const markAsRead = useCallback(async (notificationId: string) => {
    await notificationService.markAsRead(notificationId);
    setNotifications((prev) =>
      prev.map((n) => (n.notificationId === notificationId ? { ...n, read: true } : n))
    );
  }, []);

  const markAllAsRead = useCallback(async () => {
    const currentNotifications = notificationsRef.current;
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      await notificationService.markAllAsRead(currentNotifications);
    } catch {
      refresh();
    }
  }, [refresh]);

  return { notifications, unreadCount, isLoading, markAsRead, markAllAsRead, refresh };
}
