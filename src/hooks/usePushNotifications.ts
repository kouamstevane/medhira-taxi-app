import { useEffect, useState, useCallback } from 'react';
import { pushNotifications, NotificationData, NOTIFICATION_TOPICS } from '@/services/pushNotifications.service';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { useAuth } from '@/hooks/useAuth';

/**
 * Hook React pour la gestion des push notifications
 * Conforme à medJiraV2.md §6.1 (Segmentation conducteur/passager)
 * 
 * Fonctionnalités:
 * - Initialisation automatique du service
 * - Écoute des notifications reçues
 * - Feedback haptique sur les notifications critiques
 * - Gestion des actions (navigation, alertes)
 */

interface UsePushNotificationsOptions {
    enabled?: boolean;
    onNotification?: (data: NotificationData) => void;
    onBookingRequest?: (tripId: string) => void;
    onTripStarted?: (tripId: string) => void;
    onTripCompleted?: (tripId: string) => void;
    onDriverArrived?: (tripId: string) => void;
    onPaymentReceived?: (amount: number) => void;
    onAlert?: (message: string) => void;
}

interface PushNotificationsState {
    isInitialized: boolean;
    hasPermission: boolean;
    token: string | null;
    lastNotification: NotificationData | null;
}

export function usePushNotifications(options: UsePushNotificationsOptions = {}) {
    const {
        enabled = true,
        onNotification,
        onBookingRequest,
        onTripStarted,
        onTripCompleted,
        onDriverArrived,
        onPaymentReceived,
        onAlert,
    } = options;

    const { currentUser } = useAuth();
    const [state, setState] = useState<PushNotificationsState>({
        isInitialized: false,
        hasPermission: false,
        token: null,
        lastNotification: null,
    });
    
    // Récupérer le type d'utilisateur depuis les données utilisateur
    const [userType, setUserType] = useState<'driver' | 'passenger' | null>(null);

    /**
     * Initialise le service de push notifications
     */
    useEffect(() => {
        if (!enabled || !currentUser) {
            return;
        }

        let mounted = true;

        const init = async () => {
            try {
                await pushNotifications.initialize();
                
                if (mounted) {
                    setState(prev => ({
                        ...prev,
                        isInitialized: true,
                        hasPermission: true,
                    }));
                }
            } catch (error) {
                console.error('[usePushNotifications] Erreur initialisation:', error);
                
                if (mounted) {
                    setState(prev => ({
                        ...prev,
                        isInitialized: false,
                        hasPermission: false,
                    }));
                }
            }
        };

        init();

        return () => {
            mounted = false;
        };
    }, [enabled, currentUser?.uid]);

    /**
     * Écoute les notifications
     */
    useEffect(() => {
        if (!state.isInitialized) {
            return;
        }

        const removeListener = pushNotifications.addListener((notification) => {
            const data = notification.notification.data as NotificationData;
            
            // Mettre à jour l'état
            setState(prev => ({
                ...prev,
                lastNotification: data,
            }));

            // Feedback haptique selon le type de notification (§9.1)
            handleHapticFeedback(data);

            // Appeler le callback approprié
            handleNotification(data);
        });

        return () => {
            removeListener();
        };
    }, [state.isInitialized]);

    /**
     * Gère le feedback haptique selon le type de notification
     * Conforme à medJiraV2.md §9.1 (Feedback actions critiques)
     */
    const handleHapticFeedback = useCallback(async (data: NotificationData) => {
        try {
            switch (data.type) {
                case 'booking_request':
                case 'trip_started':
                case 'driver_arrived':
                    // Impact medium pour les actions importantes
                    await Haptics.impact({ style: ImpactStyle.Medium });
                    break;
                case 'trip_completed':
                case 'payment_received':
                    // Impact heavy pour les confirmations importantes
                    await Haptics.impact({ style: ImpactStyle.Heavy });
                    // Notification success
                    await Haptics.notification({ type: NotificationType.Success });
                    break;
                case 'alert':
                    // Notification error pour les alertes
                    await Haptics.notification({ type: NotificationType.Error });
                    break;
                default:
                    // Impact light pour les autres notifications
                    await Haptics.impact({ style: ImpactStyle.Light });
            }
        } catch (error) {
            // Silencieux si haptics non supporté
            console.warn('[usePushNotifications] Haptics non supporté:', error);
        }
    }, []);

    /**
     * Gère les actions selon le type de notification
     */
    const handleNotification = useCallback((data: NotificationData) => {
        // Callback générique
        if (onNotification) {
            onNotification(data);
        }

        // Callbacks spécifiques
        switch (data.type) {
            case 'booking_request':
                if (onBookingRequest && data.tripId) {
                    onBookingRequest(data.tripId);
                }
                break;
            case 'trip_started':
                if (onTripStarted && data.tripId) {
                    onTripStarted(data.tripId);
                }
                break;
            case 'trip_completed':
                if (onTripCompleted && data.tripId) {
                    onTripCompleted(data.tripId);
                }
                break;
            case 'driver_arrived':
                if (onDriverArrived && data.tripId) {
                    onDriverArrived(data.tripId);
                }
                break;
            case 'payment_received':
                if (onPaymentReceived) {
                    // Le montant devrait être dans les données de la notification
                    const amount = (data as any).amount || 0;
                    onPaymentReceived(amount);
                }
                break;
            case 'alert':
                if (onAlert) {
                    const message = (data as any).message || 'Alerte';
                    onAlert(message);
                }
                break;
        }
    }, [
        onNotification,
        onBookingRequest,
        onTripStarted,
        onTripCompleted,
        onDriverArrived,
        onPaymentReceived,
        onAlert,
    ]);

    /**
     * Met à jour le statut du conducteur
     * Pour s'abonner/désabonner du topic AVAILABLE_DRIVERS
     */
    const updateDriverStatus = useCallback(async (isAvailable: boolean) => {
        if (userType !== 'driver') {
            console.warn('[usePushNotifications] Utilisateur non-conducteur');
            return;
        }

        try {
            await pushNotifications.updateDriverStatus(isAvailable);
        } catch (error) {
            console.error('[usePushNotifications] Erreur mise à jour statut:', error);
        }
    }, [userType]);

    /**
     * Récupère le token FCM actuel
     */
    const getToken = useCallback(async () => {
        try {
            const token = await pushNotifications.getToken();
            setState(prev => ({ ...prev, token }));
            return token;
        } catch (error) {
            console.error('[usePushNotifications] Erreur récupération token:', error);
            return null;
        }
    }, []);

    /**
     * Nettoie le service de notifications
     */
    const cleanup = useCallback(async () => {
        try {
            await pushNotifications.cleanup();
            setState({
                isInitialized: false,
                hasPermission: false,
                token: null,
                lastNotification: null,
            });
        } catch (error) {
            console.error('[usePushNotifications] Erreur cleanup:', error);
        }
    }, []);

    return {
        ...state,
        updateDriverStatus,
        getToken,
        cleanup,
        isDriver: userType === 'driver',
        isPassenger: userType === 'passenger',
    };
}

/**
 * Hook simplifié pour écouter uniquement les notifications de booking
 * Utilisé dans les composants de course
 */
export function useBookingNotifications() {
    const [pendingBookings, setPendingBookings] = useState<string[]>([]);

    usePushNotifications({
        enabled: true,
        onBookingRequest: (tripId) => {
            setPendingBookings(prev => [...prev, tripId]);
        },
    });

    const removeBooking = useCallback((tripId: string) => {
        setPendingBookings(prev => prev.filter(id => id !== tripId));
    }, []);

    return {
        pendingBookings,
        removeBooking,
        hasPendingBookings: pendingBookings.length > 0,
    };
}

/**
 * Hook simplifié pour écouter uniquement les notifications de course
 * Utilisé dans les composants de suivi de course
 */
export function useTripNotifications() {
    const [tripStatus, setTripStatus] = useState<{
        started: boolean;
        completed: boolean;
        driverArrived: boolean;
    }>({
        started: false,
        completed: false,
        driverArrived: false,
    });

    usePushNotifications({
        enabled: true,
        onTripStarted: () => {
            setTripStatus(prev => ({ ...prev, started: true }));
        },
        onTripCompleted: () => {
            setTripStatus(prev => ({ ...prev, completed: true }));
        },
        onDriverArrived: () => {
            setTripStatus(prev => ({ ...prev, driverArrived: true }));
        },
    });

    return tripStatus;
}

/**
 * Hook simplifié pour écouter uniquement les notifications de paiement
 * Utilisé dans les composants de wallet
 */
export function usePaymentNotifications() {
    const [lastPayment, setLastPayment] = useState<{
        amount: number;
        timestamp: number;
    } | null>(null);

    usePushNotifications({
        enabled: true,
        onPaymentReceived: (amount) => {
            setLastPayment({
                amount,
                timestamp: Date.now(),
            });
        },
    });

    const clearLastPayment = useCallback(() => {
        setLastPayment(null);
    }, []);

    return {
        lastPayment,
        clearLastPayment,
        hasNewPayment: lastPayment !== null,
    };
}

/**
 * Hook simplifié pour écouter uniquement les notifications d'alerte
 * Utilisé dans les composants d'alerte
 */
export function useAlertNotifications() {
    const [alerts, setAlerts] = useState<Array<{
        message: string;
        timestamp: number;
    }>>([]);

    usePushNotifications({
        enabled: true,
        onAlert: (message) => {
            setAlerts(prev => [
                ...prev,
                {
                    message,
                    timestamp: Date.now(),
                },
            ]);
        },
    });

    const removeAlert = useCallback((index: number) => {
        setAlerts(prev => prev.filter((_, i) => i !== index));
    }, []);

    const clearAlerts = useCallback(() => {
        setAlerts([]);
    }, []);

    return {
        alerts,
        removeAlert,
        clearAlerts,
        hasAlerts: alerts.length > 0,
    };
}
