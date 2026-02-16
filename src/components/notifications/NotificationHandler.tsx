'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useAuth } from '@/hooks/useAuth';
import { Haptics, NotificationType } from '@capacitor/haptics';

/**
 * Composant de gestion des push notifications
 * À placer à la racine de l'application (ex: dans layout.tsx)
 * 
 * Fonctionnalités:
 * - Initialisation automatique du service de push notifications
 * - Navigation automatique selon le type de notification
 * - Feedback haptique sur les notifications critiques
 * - Affichage de notifications toast pour les alertes
 * 
 * Conforme à medJiraV2.md §6.1, §9.1
 */

export function NotificationHandler() {
    const router = useRouter();
    const { currentUser, userData } = useAuth();
    const userType: 'client' | 'driver' | undefined = userData?.userType;
    
    const {
        isInitialized,
        hasPermission,
        lastNotification,
        updateDriverStatus,
    } = usePushNotifications({
        enabled: !!currentUser,
        onBookingRequest: (tripId) => {
            console.log('[NotificationHandler] Nouvelle demande de booking:', tripId);
            
            // Naviguer vers la page de booking
            router.push(`/taxi?tripId=${tripId}`);
            
            // Feedback haptique (déjà géré dans le hook)
        },
        onTripStarted: (tripId) => {
            console.log('[NotificationHandler] Course démarrée:', tripId);
            
            // Naviguer vers la page de suivi de course
            router.push(`/taxi/trip/${tripId}`);
        },
        onTripCompleted: (tripId) => {
            console.log('[NotificationHandler] Course terminée:', tripId);
            
            // Naviguer vers l'historique
            router.push('/historique');
        },
        onDriverArrived: (tripId) => {
            console.log('[NotificationHandler] Conducteur arrivé:', tripId);
            
            // Naviguer vers la page de suivi de course
            router.push(`/taxi/trip/${tripId}`);
            
            // Notification toast
            showNotification('Votre conducteur est arrivé !', 'success');
        },
        onPaymentReceived: (amount) => {
            console.log('[NotificationHandler] Paiement reçu:', amount);
            
            // Notification toast
            showNotification(`Paiement de ${amount} FCFA reçu !`, 'success');
        },
        onAlert: (message) => {
            console.log('[NotificationHandler] Alerte:', message);
            
            // Notification toast
            showNotification(message, 'error');
        },
    });

    /**
     * Affiche une notification toast
     */
    const showNotification = (message: string, type: 'success' | 'error' | 'info') => {
        // Implémenter avec un système de toast (ex: react-hot-toast)
        // Pour l'instant, utiliser console.log
        console.log(`[NotificationHandler] Toast ${type}:`, message);
        
        // TODO: Implémenter avec react-hot-toast ou similaire
        // toast[type](message);
    };

    /**
     * Met à jour le statut du conducteur selon son état actuel
     */
    useEffect(() => {
        if (!isInitialized || userType !== 'driver') {
            return;
        }

        // Récupérer le statut actuel du conducteur depuis Firestore
        // et mettre à jour les abonnements aux topics
        const updateDriverTopicSubscription = async () => {
            try {
                // Importer Firestore dynamiquement
                const { getFirestore, doc, getDoc } = await import('firebase/firestore');
                const db = getFirestore();
                
                if (!currentUser) return;
                
                const driverRef = doc(db, 'drivers', currentUser.uid);
                const driverDoc = await getDoc(driverRef);
                
                if (driverDoc.exists()) {
                    const driverData = driverDoc.data();
                    const isAvailable = driverData.status === 'online';
                    
                    // Mettre à jour l'abonnement au topic
                    await updateDriverStatus(isAvailable);
                }
            } catch (error) {
                console.error('[NotificationHandler] Erreur mise à jour statut conducteur:', error);
            }
        };

        updateDriverTopicSubscription();
    }, [isInitialized, userType, currentUser?.uid]);

    /**
     * Log les informations de debug
     */
    useEffect(() => {
        if (isInitialized) {
            console.log('[NotificationHandler] Service initialisé:', {
                hasPermission,
                userType,
            });
        }
    }, [isInitialized, hasPermission, userType]);

    /**
     * Log les notifications reçues
     */
    useEffect(() => {
        if (lastNotification) {
            console.log('[NotificationHandler] Dernière notification:', lastNotification);
        }
    }, [lastNotification]);

    // Ce composant ne rend rien visuellement
    return null;
}

/**
 * Hook pour utiliser le handler de notifications dans les composants
 */
export function useNotificationHandler() {
    return {
        NotificationHandler,
    };
}

export default NotificationHandler;
