import { PushNotifications, ActionPerformed, Token } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { getAuth } from 'firebase/auth';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import app from '@/config/firebase';
import { z } from 'zod';

/**
 * Service de gestion des push notifications
 * Conforme à medJiraV2.md §6.1 (Segmentation conducteur/passager avec topics Firebase)
 * 
 * Fonctionnalités:
 * - Enregistrement du token FCM
 * - Segmentation conducteur/passager avec topics
 * - Gestion des notifications locales et push
 * - Feedback haptique sur les notifications critiques
 */

// Validation Zod des données de notification (§8.2)
const NotificationDataSchema = z.object({
    type: z.enum(['booking_request', 'trip_started', 'trip_completed', 'driver_arrived', 'payment_received', 'alert', 'incoming_call']),
    tripId: z.string().optional(),
    rideId: z.string().optional(), // Alias pour tripId utilisé dans VoIP
    callId: z.string().optional(),
    callerId: z.string().optional(),
    callerName: z.string().optional(),
    callerAvatar: z.string().optional(),
    callerRole: z.string().optional(),
    driverId: z.string().optional(),
    passengerId: z.string().optional(),
    timestamp: z.number(),
});

export type NotificationData = z.infer<typeof NotificationDataSchema>;

// Topics Firebase pour segmentation (medJiraV2.md §6.1)
export const NOTIFICATION_TOPICS = {
    ALL_DRIVERS: 'all_drivers',
    ALL_PASSENGERS: 'all_passengers',
    AVAILABLE_DRIVERS: 'available_drivers',
    ACTIVE_TRIPS: 'active_trips',
} as const;



class PushNotificationService {
    private isInitialized = false;
    private token: string | null = null;
    private listeners: Set<(data: ActionPerformed) => void> = new Set();

    /**
     * Initialise le service de push notifications
     */
    async initialize(): Promise<void> {
        if (this.isInitialized) {
            console.warn('[PushNotifications] Service déjà initialisé');
            return;
        }

        if (!Capacitor.isNativePlatform()) {
            console.warn('[PushNotifications] Plateforme non-native, notifications limitées');
            return;
        }

        try {
            // Demander la permission de recevoir des notifications
            const permissionStatus = await PushNotifications.requestPermissions();
            
            if (permissionStatus.receive === 'granted') {
                console.log('[PushNotifications] Permission accordée');
                
                // Enregistrer le plugin
                await PushNotifications.register();
                
                // Écouter l'enregistrement
                await this.setupRegistrationListeners();
                
                // Écouter les notifications
                await this.setupNotificationListeners();
                
                this.isInitialized = true;
                console.log('[PushNotifications] Service initialisé avec succès');
            } else {
                console.warn('[PushNotifications] Permission refusée');
            }
        } catch (error) {
            console.error('[PushNotifications] Erreur initialisation:', error);
            throw error;
        }
    }

    /**
     * Configure les écouteurs d'enregistrement
     */
    private async setupRegistrationListeners(): Promise<void> {
        // Écouter l'enregistrement réussi
        await PushNotifications.addListener('registration', async (token: Token) => {
            console.log('[PushNotifications] Token reçu:', token.value);
            this.token = token.value;
            
            // Sauvegarder le token dans Firestore
            await this.saveTokenToFirestore(token.value);
        });

        // Écouter les erreurs d'enregistrement
        await PushNotifications.addListener('registrationError', (error) => {
            console.error('[PushNotifications] Erreur enregistrement:', error);
        });
    }

    /**
     * Configure les écouteurs de notifications
     */
    private async setupNotificationListeners(): Promise<void> {
        // Notification reçue quand l'app est en premier plan
        await PushNotifications.addListener('pushNotificationReceived', (notification) => {
            console.log('[PushNotifications] Notification reçue en premier plan:', notification);
            
            // Valider les données avec Zod (§8.2)
            try {
                const data = NotificationDataSchema.parse(notification.data);
                this.handleNotificationReceived(data);
            } catch (error) {
                console.error('[PushNotifications] Données de notification invalides:', error);
            }
        });

        // Notification cliquée (actionPerformed)
        await PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
            console.log('[PushNotifications] Notification cliquée:', notification);
            
            // Valider les données avec Zod (§8.2)
            try {
                NotificationDataSchema.parse(notification.notification.data);
                this.handleNotificationActionPerformed(notification);
            } catch (error) {
                console.error('[PushNotifications] Données de notification invalides:', error);
            }
        });
    }

    /**
     * Sauvegarde le token FCM dans Firestore
     * 🔒 CORRECTION CRITIQUE (Problème #3) : Gestion d'erreur si doc n'existe pas
     */
    private async saveTokenToFirestore(token: string): Promise<void> {
        const auth = getAuth();
        const user = auth.currentUser;
        
        if (!user) {
            console.warn('[PushNotifications] Aucun utilisateur connecté');
            return;
        }

        try {
            // Importer Firestore dynamiquement pour éviter les erreurs SSR
            const { getFirestore, doc, getDoc, setDoc, serverTimestamp } = await import('firebase/firestore');
            const db = getFirestore();
            
            const [driverDoc, userDoc] = await Promise.all([
                getDoc(doc(db, 'drivers', user.uid)),
                getDoc(doc(db, 'users', user.uid)),
            ]);

            let userType = 'passenger';

            if (driverDoc.exists()) {
                userType = 'driver';
            } else if (userDoc.exists()) {
                userType = (userDoc.data()?.userType as string) || 'passenger';
            } else {
                // Utilisateur inconnu — ni driver ni client existant
                // Ne PAS créer de document fantôme (ex: chauffeur en attente de Cloud Function)
                console.warn('[PushNotifications] Document utilisateur non trouvé pour uid:', user.uid);
                return;
            }
            
            // Sauvegarder le token dans la collection appropriée
            const collectionName = userType === 'driver' ? 'drivers' : 'passengers';
            const userRef = doc(db, collectionName, user.uid);
            
            await setDoc(userRef, {
                fcmToken: token,
                tokenUpdatedAt: serverTimestamp(),
            }, { merge: true });

            // Sauvegarder dans users/ UNIQUEMENT pour les clients (les chauffeurs n'ont PAS de doc users/)
            if (userType !== 'driver') {
                await setDoc(doc(db, 'users', user.uid), {
                    fcmToken: token,
                    tokenUpdatedAt: serverTimestamp(),
                }, { merge: true });
            }
            
            // S'abonner aux topics appropriés (medJiraV2.md §6.1)
            await this.subscribeToTopics(userType);
            
            console.log('[PushNotifications] Token sauvegardé et topics configurés');
        } catch (error) {
            console.error('[PushNotifications] Erreur sauvegarde token:', error);
        }
    }

    /**
     * S'abonne aux topics Firebase appropriés
     * Conforme à medJiraV2.md §6.1 (Segmentation conducteur/passager)
     */
    private async subscribeToTopics(userType: string): Promise<void> {
        try {
            // S'abonner au topic général selon le type d'utilisateur
            const generalTopic = userType === 'driver'
                ? NOTIFICATION_TOPICS.ALL_DRIVERS 
                : NOTIFICATION_TOPICS.ALL_PASSENGERS;
            
            await this.subscribeToTopic(generalTopic);
            console.log(`[PushNotifications] Abonné au topic: ${generalTopic}`);
            
            // S'abonner aux topics spécifiques pour les conducteurs
            if (userType === 'driver') {
                // Le conducteur sera ajouté aux topics disponibles quand il se met en ligne
                // via Cloud Functions
            }
        } catch (error) {
            console.error('[PushNotifications] Erreur abonnement topics:', error);
        }
    }

    /**
     * S'abonne à un topic Firebase
     */
    async subscribeToTopic(topic: string): Promise<void> {
        try {
            // Utiliser Firebase Cloud Functions pour gérer les abonnements
            // car Capacitor ne supporte pas directement les topics
            const auth = getAuth();
            const user = auth.currentUser;
            
            if (!user) {
                console.warn('[PushNotifications] Aucun utilisateur connecté');
                return;
            }

            // Appeler une Cloud Function pour s'abonner au topic
            const { getFunctions, httpsCallable } = await import('firebase/functions');
            const functions = getFunctions();
            const subscribeToTopicFn = httpsCallable(functions, 'subscribeToTopic');
            
            await subscribeToTopicFn({ topic });
            console.log(`[PushNotifications] Abonné au topic: ${topic}`);
        } catch (error) {
            console.error('[PushNotifications] Erreur abonnement topic:', error);
        }
    }

    /**
     * Se désabonner d'un topic Firebase
     */
    async unsubscribeFromTopic(topic: string): Promise<void> {
        try {
            const auth = getAuth();
            const user = auth.currentUser;
            
            if (!user) {
                console.warn('[PushNotifications] Aucun utilisateur connecté');
                return;
            }

            // Appeler une Cloud Function pour se désabonner du topic
            const { getFunctions, httpsCallable } = await import('firebase/functions');
            const functions = getFunctions();
            const unsubscribeFromTopicFn = httpsCallable(functions, 'unsubscribeFromTopic');
            
            await unsubscribeFromTopicFn({ topic });
            console.log(`[PushNotifications] Désabonné du topic: ${topic}`);
        } catch (error) {
            console.error('[PushNotifications] Erreur désabonnement topic:', error);
        }
    }

    /**
     * Gère une notification reçue en premier plan
     */
    private handleNotificationReceived(data: NotificationData): void {
        console.log('[PushNotifications] Notification reçue:', data);
        
        // Émettre un événement pour les composants écoutants
        this.listeners.forEach(listener => {
            listener({
                notification: {
                    data,
                } as unknown as ActionPerformed['notification'],
                actionId: 'received',
            } as ActionPerformed);
        });
    }

    /**
     * Gère une notification cliquée
     */
    private handleNotificationActionPerformed(notification: ActionPerformed): void {
        console.log('[PushNotifications] Notification cliquée:', notification);
        
        // Naviguer vers la page appropriée selon le type de notification
        const data = notification.notification.data as NotificationData;
        
        switch (data.type) {
            case 'booking_request':
                // Naviguer vers la page de booking
                this.navigateTo('/taxi');
                break;
            case 'trip_started':
            case 'driver_arrived':
                // Naviguer vers la page de suivi de course
                this.navigateTo(`/taxi/confirmation?bookingId=${data.tripId}`);
                break;
            case 'trip_completed':
            case 'payment_received':
                // Naviguer vers l'historique
                this.navigateTo('/historique');
                break;
            case 'alert':
                // Afficher une alerte
                this.showAlert(notification.notification.title || 'Alerte', notification.notification.body || '');
                break;
        }
        
        // Émettre un événement pour les composants écoutants
        this.listeners.forEach(listener => {
            listener(notification);
        });
    }

    /**
     * Ajoute un écouteur de notifications
     */
    addListener(listener: (data: ActionPerformed) => void): () => void {
        this.listeners.add(listener);
        
        // Retourner une fonction de nettoyage
        return () => {
            this.listeners.delete(listener);
        };
    }

    /**
     * Récupère le token FCM actuel
     */
    async getToken(): Promise<string | null> {
        if (this.token) {
            return this.token;
        }
        
        // Si pas de token, essayer de le récupérer via Firebase Messaging
        try {
            const messaging = getMessaging(app);
            const vapidKey = process.env.NEXT_PUBLIC_FCM_VAPID_KEY;
            const token = await getToken(messaging, vapidKey ? { vapidKey } : undefined);
            this.token = token;
            return token;
        } catch (error) {
            console.error('[PushNotifications] Erreur récupération token:', error);
            return null;
        }
    }

    /**
     * Nettoie le service de notifications
     */
    async cleanup(): Promise<void> {
        try {
            await PushNotifications.removeAllListeners();
            this.listeners.clear();
            this.isInitialized = false;
            this.token = null;
            console.log('[PushNotifications] Service nettoyé');
        } catch (error) {
            console.error('[PushNotifications] Erreur cleanup:', error);
        }
    }

    /**
     * Navigue vers une route spécifique
     */
    private navigateTo(path: string): void {
        if (typeof window !== 'undefined' && window.location) {
            window.location.href = path;
        }
    }

    /**
     * Affiche une alerte native
     */
    private showAlert(title: string, message: string): void {
        if (typeof window !== 'undefined' && window.alert) {
            window.alert(`${title}\n\n${message}`);
        }
    }

    /**
     * Met à jour le statut du conducteur (disponible/indisponible)
     * Pour s'abonner/désabonner du topic AVAILABLE_DRIVERS
     */
    async updateDriverStatus(isAvailable: boolean): Promise<void> {
        if (isAvailable) {
            await this.subscribeToTopic(NOTIFICATION_TOPICS.AVAILABLE_DRIVERS);
        } else {
            await this.unsubscribeFromTopic(NOTIFICATION_TOPICS.AVAILABLE_DRIVERS);
        }
    }
}

// Singleton export
export const pushNotifications = new PushNotificationService();
