"use client";
import { useState, useEffect, useRef } from 'react';
import { auth, db } from '@/config/firebase';
import {
  doc,
  getDoc,
  onSnapshot,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  Timestamp,
  documentId,
  increment
} from 'firebase/firestore';
import { useRouter, useSearchParams } from 'next/navigation';
import { signOut, User } from 'firebase/auth';
import Link from 'next/link';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { StripeOnboardingBanner } from '@/components/ui/StripeOnboardingBanner';
import { GlassCard } from '@/components/ui/GlassCard';
import { BottomNav, driverNavItems } from '@/components/ui/BottomNav';
import {
  getPendingCandidatesForDriver,
  subscribeToDriverRideRequests,
  markCandidateDeclined,
} from '@/services/matching/broadcast';
import { RideCandidate } from '@/types';
import { assignDriver } from '@/services/matching/assignment';
import { CURRENCY_CODE } from '@/utils/constants';
import { formatCurrencyWithCode } from '@/utils/format';
import { incrementDriverAcceptedTrips, incrementDriverDeclinedTrips } from '@/services/driver.service';
import { calculateFinalFare, markDriverArrived, startTrip, completeTrip } from '@/services/taxi.service';
import { useDriverTracking } from '@/hooks/useDriverTracking';
import { RideRequestCard } from './components/RideRequestCard';
import { CurrentTripCard } from './components/CurrentTripCard';
import ModeSwitch from './components/ModeSwitch';
import DeliveryOrdersList from './components/DeliveryOrdersList';
import { getDriverDashboardInfoMessage } from '@/utils/driver.utils';
import type { Trip, RideRequest } from '@/types/trip';
import { useDriverStore, type DriverCoreData } from '@/store/driverStore';
import { useDriverAvailability } from '@/hooks/useDriverAvailability';
import { useToast } from '@/hooks/useToast';
import { ToastContainer } from '@/components/ui/Toast';

async function fetchBookingsForRequests(
  requests: Array<{ rideId: string; candidate: RideCandidate }>
): Promise<RideRequest[]> {
  const bookingIds = requests.map(req => req.rideId).filter(Boolean);
  const bookingMap = new Map<string, Record<string, unknown>>();

  if (bookingIds.length > 0) {
    for (let i = 0; i < bookingIds.length; i += 30) {
      const batchIds = bookingIds.slice(i, i + 30);
      try {
        const bookingQuery = query(
          collection(db, 'bookings'),
          where(documentId(), 'in', batchIds),
          limit(30)
        );
        const snap = await getDocs(bookingQuery);
        snap.forEach(d => bookingMap.set(d.id, d.data() as Record<string, unknown>));
      } catch (error) {
        console.error('Erreur chargement batch bookings:', error);
      }
    }
  }

  return requests.map(req => {
    const bookingData = bookingMap.get(req.rideId);
    const result: RideRequest = { rideId: req.rideId, candidate: req.candidate };
    if (bookingData) {
      result.bookingData = {
        pickup: bookingData.pickup as string,
        destination: bookingData.destination as string,
        price: bookingData.price as number,
        distance: bookingData.distance as number | undefined,
        duration: bookingData.duration as number | undefined,
      };
    }
    return result;
  });
}

export default function DriverDashboard() {
  const { driver, setDriver, updateDriver } = useDriverStore();
  useDriverAvailability();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [availableTrips, setAvailableTrips] = useState<Trip[]>([]);
  const [currentTrip, setCurrentTrip] = useState<Trip | null>(null);
  const [rideRequests, setRideRequests] = useState<RideRequest[]>([]);
  const [dailyHistory, setDailyHistory] = useState<Trip[]>([]);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showError, toasts, removeToast } = useToast();
  const isTripActive = !!currentTrip && ['accepted', 'driver_arrived', 'in_progress'].includes(currentTrip.status);
  const { lastLocation: _trackingLocation, error: _trackingError } = useDriverTracking({
    tripId: currentTrip?.id,
    enabled: !!driver?.isAvailable || isTripActive,
  });

  const listenersRef = useRef<{
    currentTrip: (() => void) | null;
    pendingTrips: (() => void) | null;
    rideRequests: (() => void) | null;
  }>({ currentTrip: null, pendingTrips: null, rideRequests: null });
  const mountedRef = useRef(true);

  const getInitials = (firstName?: string, lastName?: string): string => {
    const firstChar = firstName?.[0] || 'D';
    const lastChar = lastName?.[0] || 'C';
    return `${firstChar}${lastChar}`;
  };

  const formatValue = (value: string | number | boolean | null | undefined, defaultValue: string | number = 'N/A'): string | number | boolean => {
    return value ?? defaultValue;
  };

  useEffect(() => {
    let authChangeId = 0;
    mountedRef.current = true;
    const unsubscribeAuth = auth.onAuthStateChanged(async (user) => {
      const thisChangeId = ++authChangeId;
      if (!user) {
        router.push('/driver/login');
        return;
      }

      // Mettre à jour l'état de l'utilisateur actuel
      setCurrentUser(user);

      // Nettoyer les anciens listeners
      if (listenersRef.current.currentTrip) { listenersRef.current.currentTrip(); listenersRef.current.currentTrip = null; }
      if (listenersRef.current.pendingTrips) { listenersRef.current.pendingTrips(); listenersRef.current.pendingTrips = null; }
      if (listenersRef.current.rideRequests) { listenersRef.current.rideRequests(); listenersRef.current.rideRequests = null; }

      // Initialiser les fonctions de cleanup comme no-ops pour éviter les appels invalides en cas d'erreur
      let unsubscribeCurrentTrip: () => void = () => {};
      let unsubscribe: () => void = () => {};
      let unsubscribeRideRequests: () => void = () => {};

      try {
        const driverDoc = await getDoc(doc(db, 'drivers', user.uid));
        if (!mountedRef.current || thisChangeId !== authChangeId) return;
        if (!driverDoc.exists()) {
          setError("Profil chauffeur non trouvé");
          setLoading(false);
          return;
        }

        const driverData = driverDoc.data();
        
        // Vérifier si le compte est actif
        if (driverData.isActive === false) {
          await signOut(auth);
          showError('Votre compte a été désactivé par un administrateur. Contactez le support.');
          router.push('/driver/login');
          return;
        }

        // Vérifier si le compte est suspendu
        if (driverData.isSuspended) {
          await signOut(auth);
          const reason = driverData.suspensionReason || 'Contactez le support pour plus d\'informations.';
          showError(`Votre compte a été suspendu. Raison: ${reason}`);
          router.push('/driver/login');
          return;
        }

        if (driverData.status === 'rejected') {
          showError('Votre demande a été rejetée. Vous pouvez soumettre une nouvelle demande.');
          router.push('/driver/register');
          return;
        }
        
        const submissionParam = searchParams.get('submission');
        const emailVerifiedParam = searchParams.get('emailVerified');
        const userEmailVerified = Boolean(user.emailVerified);

        // Utiliser la fonction utilitaire pour déterminer le message d'information
        const infoMessage = getDriverDashboardInfoMessage(
          submissionParam,
          emailVerifiedParam,
          userEmailVerified,
          driverData.status
        );

        if (infoMessage) {
          setInfoMessage(infoMessage);
          // Nettoyer les paramètres URL pour éviter de réafficher le message au rechargement
          if (submissionParam === '1' || emailVerifiedParam === '1') {
            router.replace('/driver/dashboard');
          }
        }

        const safeDriverData: DriverCoreData = {
          uid: user.uid,
          firstName: driverData.firstName || 'Chauffeur',
          lastName: driverData.lastName || '',
          email: driverData.email || '',
          phone: driverData.phone || '',
          car: driverData.car || {
            model: 'Modèle non spécifié',
            plate: 'Non spécifié',
            color: 'Non spécifié'
          },
          status: driverData.status || 'pending',
          isAvailable: Boolean(driverData.isAvailable),
          rating: Number(driverData.rating) || 0,
          tripsCompleted: Number(driverData.tripsCompleted) || 0,
          earnings: Number(driverData.earnings) || 0
        };
        setDriver(safeDriverData);

        // Écouter les courses du chauffeur (en cours)
        const currentTripQuery = query(
          collection(db, "bookings"),
          where("driverId", "==", user.uid),
          where("status", "in", ["accepted", "driver_arrived", "in_progress"]),
          limit(1)
        );
        
        unsubscribeCurrentTrip = onSnapshot(currentTripQuery, async (snapshot) => {

          if (!snapshot.empty) {
            const activeDoc = snapshot.docs[0]; // Prendre la première course active
            const data = activeDoc.data();

            console.log('[DRIVER] Course active trouvée:', {
              id: activeDoc.id,
              status: data.status,
              pickup: data.pickup,
              destination: data.destination
            });
            
            if (data.status === 'cancelled') {
              console.log('[DRIVER] Course annulée détectée (ne devrait pas arriver), ignorée');
              setCurrentTrip(null);
              return;
            }
            
              setCurrentTrip({
                id: activeDoc.id,
                userId: data.userId,
                passengerName: data.userEmail || "Client",
                pickup: data.pickup,
                destination: data.destination,
                price: data.price,
                status: data.status as 'accepted' | 'driver_arrived' | 'in_progress',
                createdAt: data.createdAt,
                unreadMessages: data.unreadMessages,
                pickupLocation: data.pickupLocation,
                pickupLocationAccuracy: data.pickupLocationAccuracy,
                destinationLocation: data.destinationLocation,
                driverLocation: data.driverLocation,
                passengerLocation: data.passengerLocation
              });
          } else {
            // Aucune course active, réinitialiser
            console.log('[DRIVER] ✓ Aucune course active, réinitialisation');
            setCurrentTrip(null);
            // Remettre le chauffeur disponible automatiquement
            try {
              await updateDoc(doc(db, 'drivers', user.uid), {
                isAvailable: true
              });
              console.log('[DRIVER] ✓ Disponibilité réactivée automatiquement');
              // Mettre à jour l'état local
              updateDriver({ isAvailable: true });
            } catch (err) {
              console.error('[DRIVER] Erreur mise à jour disponibilité:', err);
            }
          }
        });
        listenersRef.current.currentTrip = unsubscribeCurrentTrip;

        // Écouter les courses en attente (ancien système)
        // Règle Section 4.1 : limit() obligatoire sur chaque requête
        const q = query(collection(db, "bookings"), where("status", "==", "pending"), limit(50));
        unsubscribe = onSnapshot(q, (snapshot) => {
          const trips: Trip[] = [];
          snapshot.forEach((doc) => {
            const data = doc.data();
            trips.push({
              id: doc.id,
              userId: data.userId || '',
              passengerName: data.passengerName || "Client",
              pickup: data.pickup,
              destination: data.destination,
              price: data.price,
              status: "pending",
              createdAt: data.createdAt
            });
          });
          setAvailableTrips(trips);
        });
        listenersRef.current.pendingTrips = unsubscribe;

        // Écouter les nouvelles demandes de course (nouveau système de matching)
        unsubscribeRideRequests = subscribeToDriverRideRequests(user.uid, async (requests) => {
          setRideRequests(await fetchBookingsForRequests(requests));
        });

        fetchDailyHistory(user.uid);
        listenersRef.current.rideRequests = unsubscribeRideRequests;

        // Charger les demandes en attente au démarrage
        getPendingCandidatesForDriver(user.uid).then(async (requests) => {
          setRideRequests(await fetchBookingsForRequests(requests));
        });

      } catch (err) {
        console.error('Erreur de chargement:', err);
        setError("Erreur de chargement");
      } finally {
        setLoading(false);
      }

    });

    return () => {
      mountedRef.current = false;
      unsubscribeAuth();
      try {
        if (listenersRef.current.currentTrip) { listenersRef.current.currentTrip(); listenersRef.current.currentTrip = null; }
        if (listenersRef.current.pendingTrips) { listenersRef.current.pendingTrips(); listenersRef.current.pendingTrips = null; }
        if (listenersRef.current.rideRequests) { listenersRef.current.rideRequests(); listenersRef.current.rideRequests = null; }
      } catch {
        // Silently ignore cleanup errors
      }
    };
  }, [router]);

  const fetchDailyHistory = async (driverId: string) => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const historyQuery = query(
        collection(db, 'bookings'),
        where('driverId', '==', driverId),
        where('status', '==', 'completed'),
        where('completedAt', '>=', today),
        orderBy('completedAt', 'desc'),
        limit(100) // Règle Section 4.1 : limit() obligatoire
      );

      const historySnapshot = await getDocs(historyQuery);
      const history: Trip[] = [];
      historySnapshot.forEach(doc => {
        history.push({ id: doc.id, ...doc.data() } as Trip);
      });

      setDailyHistory(history);
    } catch (error) {
      console.error("Erreur chargement historique du jour:", error);
    }
  };

  const toggleAvailability = async () => {
    if (!auth.currentUser || !driver) return;
    // Gating Stripe : interdire la mise en ligne tant que les virements ne sont
    // pas activés — sinon le chauffeur prendrait des courses sans pouvoir être payé.
    const goingOnline = !driver.isAvailable;
    if (goingOnline) {
      const stripeStatus = (driver as DriverCoreData & { stripeAccountStatus?: string; stripePayoutsEnabled?: boolean }).stripeAccountStatus;
      const payoutsEnabled = (driver as DriverCoreData & { stripePayoutsEnabled?: boolean }).stripePayoutsEnabled;
      if (stripeStatus !== 'active' || payoutsEnabled === false) {
        showError("Configuration des paiements requise avant de passer en ligne. Vous allez être redirigé pour la terminer.");
        router.push('/driver/payments/setup');
        return;
      }
    }
    try {
      await updateDoc(doc(db, 'drivers', auth.currentUser.uid), {
        isAvailable: !driver.isAvailable
      });
      updateDriver({ isAvailable: !driver.isAvailable });
    } catch {
      setError("Erreur de changement de disponibilité");
    }
  };

  const handleAcceptRideRequest = async (rideId: string) => {
    if (!auth.currentUser || !driver) return;

    try {
      // Utiliser le service d'assignation atomique
      const result = await assignDriver(rideId, auth.currentUser.uid);

      if (!result.success) {
        showError(result.error || "Impossible d'accepter la course. Elle a peut-être déjà été prise.");
        return;
      }

      // Incrémenter le compteur de courses acceptées
      await incrementDriverAcceptedTrips(auth.currentUser.uid);

      // Mettre à jour l'état local
      updateDriver({ isAvailable: false });
      setRideRequests(prev => prev.filter(r => r.rideId !== rideId));
      
      // Charger les détails de la course acceptée
      const bookingRef = doc(db, "bookings", rideId);
      const bookingSnap = await getDoc(bookingRef);
      
      if (bookingSnap.exists()) {
        const bookingData = bookingSnap.data();
        setCurrentTrip({
          id: rideId,
          userId: bookingData.userId,
          passengerName: bookingData.userEmail || "Client",
          pickup: bookingData.pickup,
          destination: bookingData.destination,
          price: bookingData.price,
          status: "accepted",
          createdAt: bookingData.createdAt,
          unreadMessages: bookingData.unreadMessages,
          pickupLocation: bookingData.pickupLocation,
          pickupLocationAccuracy: bookingData.pickupLocationAccuracy,
            destinationLocation: bookingData.destinationLocation,
            driverLocation: bookingData.driverLocation,
            passengerLocation: bookingData.passengerLocation
        });
      }
    } catch (err: unknown) {
      console.error("Erreur d'acceptation:", err);
      const message = err instanceof Error ? err.message : "Impossible d'accepter la course.";
      showError(message);
    }
  };

  const handleDeclineRideRequest = async (rideId: string) => {
    if (!auth.currentUser) return;

    try {
      await markCandidateDeclined(rideId, auth.currentUser.uid);
      await incrementDriverDeclinedTrips(auth.currentUser.uid);
      
      // Retirer de la liste
      setRideRequests(prev => prev.filter(r => r.rideId !== rideId));
    } catch (err: unknown) {
      console.error("Erreur de refus:", err);
      // Ne pas bloquer l'UI si le refus échoue
    }
  };

  const acceptTrip = async (tripId: string) => {
    if (!auth.currentUser || !driver) return;

    try {
      // Utiliser le service d'assignation atomique pour être cohérent
      const result = await assignDriver(tripId, auth.currentUser.uid);

      if (!result.success) {
        showError(result.error || "Impossible d'accepter la course. Elle a peut-être déjà été prise.");
        return;
      }

      // Incrémenter le compteur de courses acceptées
      await incrementDriverAcceptedTrips(auth.currentUser.uid);

      // Mettre à jour l'état local
      updateDriver({ isAvailable: false });
      setAvailableTrips(prev => prev.filter(t => t.id !== tripId));

      // Charger les détails de la course acceptée
      const bookingRef = doc(db, "bookings", tripId);
      const bookingSnap = await getDoc(bookingRef);
      
      if (bookingSnap.exists()) {
        const bookingData = bookingSnap.data();
        setCurrentTrip({
          id: tripId,
          userId: bookingData.userId,
          passengerName: bookingData.userEmail || "Client",
          pickup: bookingData.pickup,
          destination: bookingData.destination,
          price: bookingData.price,
          status: "accepted",
          createdAt: bookingData.createdAt,
          unreadMessages: bookingData.unreadMessages,
          pickupLocation: bookingData.pickupLocation,
          pickupLocationAccuracy: bookingData.pickupLocationAccuracy,
          destinationLocation: bookingData.destinationLocation,
          driverLocation: bookingData.driverLocation,
          passengerLocation: bookingData.passengerLocation
        });
      }
    } catch (err: unknown) {
      console.error("Erreur d'acceptation:", err);
      const message = err instanceof Error ? err.message : "Impossible d'accepter la course.";
      showError(message);
    }
  };

  const handleMarkAsArrived = async (tripId: string) => {
    if (!currentTrip) return;
    try {
      await markDriverArrived(tripId);
      // Le state se mettra à jour via onSnapshot
    } catch (error) {
      console.error('Erreur marquage arrivée:', error);
      showError('Erreur lors du marquage. Réessayez.');
    }
  };

  const handleStartTrip = async (tripId: string) => {
    if (!currentTrip) return;
    try {
      await startTrip(tripId);
      // Le state se mettra à jour via onSnapshot
    } catch (error) {
      console.error('Erreur démarrage course:', error);
      showError('Erreur lors du démarrage. Réessayez.');
    }
  };

  const handleCompleteTrip = async (tripId: string) => {
    if (!auth.currentUser || !driver || !currentTrip) return;
    
    try {
      // Appel de la fonction du service qui gère tout
      await completeTrip(tripId);
      
      // Récupérer le prix final pour mettre à jour les stats
      const finalPrice = await calculateFinalFare(tripId);

      const priceToAdd = finalPrice || 0;
      await updateDoc(doc(db, 'drivers', auth.currentUser.uid), {
        earnings: increment(priceToAdd),
        tripsCompleted: increment(1)
      });

      updateDriver({ isAvailable: true });

      setCurrentTrip(null);
    } catch (error) {
      console.error("Erreur lors de la fin de course:", error);
      showError("Erreur lors de la clôture de la course");
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      // Forcer le rechargement complet pour vider le cache
      window.location.href = '/driver/login';
    } catch {
      setError("Erreur de déconnexion");
    }
  };

  if (loading) return <Loading />;
  if (error) return <ErrorView error={error} onLogout={handleLogout} />;
  if (!driver) return <NoDriver onLogout={handleLogout} />;

  const driverType = driver?.driverType ?? 'chauffeur'
  const activeMode = driver?.activeMode ?? 'taxi'

  return (
    <>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <div className="min-h-screen bg-background font-sans text-slate-100 antialiased">
      <div className="max-w-[430px] mx-auto min-h-screen flex flex-col pb-24">
        {/* Header */}
        <header className="p-6 flex items-center justify-between sticky top-0 bg-background/80 backdrop-blur-xl z-50">
          <div className="flex items-center gap-3">
            <div className="size-12 rounded-full border-2 border-primary/30 bg-gradient-to-r from-primary to-[#ffae33] flex items-center justify-center">
              <span className="text-white font-bold text-sm">{getInitials(driver.firstName, driver.lastName)}</span>
            </div>
            <div>
              <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">Bienvenue</p>
              <h1 className="text-xl font-bold text-white">Bonjour, {formatValue(driver.firstName)}</h1>
            </div>
          </div>
          <button
            onClick={toggleAvailability}
            className={`flex items-center gap-2 px-3 py-2.5 min-h-[44px] rounded-full border transition-all ${
              driver.isAvailable
                ? 'bg-green-500/10 border-green-500/20'
                : 'bg-slate-700/50 border-white/10'
            }`}
          >
            <span className={`size-2 rounded-full ${driver.isAvailable ? 'bg-green-500 animate-pulse-green' : 'bg-slate-500'}`} />
            <span className={`text-sm font-bold ${driver.isAvailable ? 'text-green-500' : 'text-slate-400'}`}>
              {driver.isAvailable ? 'En ligne' : 'Hors ligne'}
            </span>
          </button>
        </header>

        {/* Bandeau Stripe Onboarding — visible tant que le compte n'est pas actif */}
        <div className="px-6">
          <StripeOnboardingBanner />
        </div>

        {/* Info Message */}
        {infoMessage && (
          <div className="mx-6 mb-4 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
            <div className="flex items-start gap-3">
              <MaterialIcon name="info" size="md" className="text-blue-400 mt-0.5" />
              <p className="text-sm text-blue-300 flex-1">{infoMessage}</p>
            </div>
          </div>
        )}

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-3 px-6 mb-6">
          <GlassCard className="p-4 flex flex-col items-center text-center">
            <span className="text-primary text-sm font-semibold mb-1">Gains</span>
            <span className="text-white font-bold text-base leading-tight">{formatCurrencyWithCode(driver.earnings || 0)}</span>
          </GlassCard>
          <GlassCard className="p-4 flex flex-col items-center text-center">
            <span className="text-primary text-sm font-semibold mb-1">Note</span>
            <div className="flex items-center gap-1">
              <MaterialIcon name="star" size="sm" className="text-primary" filled />
              <span className="text-white font-bold text-base">{formatValue(driver.rating, 0)}</span>
            </div>
            <span className="text-slate-500 text-[10px]">Top Driver</span>
          </GlassCard>
          <GlassCard className="p-4 flex flex-col items-center text-center">
            <span className="text-primary text-sm font-semibold mb-1">Courses</span>
            <span className="text-white font-bold text-base">{formatValue(driver.tripsCompleted, 0)}</span>
            <span className="text-slate-500 text-[10px]">Total</span>
          </GlassCard>
        </div>

        {/* Status Card */}
        <div className="px-6 mb-8">
          <GlassCard variant="elevated" className="p-5 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16 blur-3xl" />
            <div className="flex items-center gap-3 mb-4">
              <span className={`size-3 rounded-full ${driver.isAvailable ? 'bg-green-500 animate-pulse-green' : 'bg-slate-500'}`} />
              <p className="text-white font-medium">
                {driver.isAvailable ? 'Disponible — En attente' : 'Hors ligne'}
              </p>
            </div>
            <p className="text-slate-400 text-sm mb-5 leading-relaxed">
              {driver.isAvailable
                ? 'Votre position est visible par les clients. Restez à proximité des zones animées.'
                : 'Activez votre statut pour recevoir des demandes de course.'}
            </p>
            <div className="flex gap-3">
              <button
                onClick={toggleAvailability}
                className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white font-semibold transition-all border border-white/10 flex items-center justify-center gap-2"
              >
                <MaterialIcon name="power_settings_new" size="sm" />
                {driver.isAvailable ? 'Aller hors ligne' : 'Aller en ligne'}
              </button>
              <button
                onClick={handleLogout}
                className="py-3 px-4 rounded-xl bg-destructive/10 hover:bg-destructive/20 text-destructive font-semibold transition-all border border-destructive/20 flex items-center justify-center gap-2"
              >
                <MaterialIcon name="logout" size="sm" />
              </button>
            </div>
          </GlassCard>
        </div>

        {/* ModeSwitch — uniquement pour les_deux */}
        {driverType === 'les_deux' && driver && (
          <div className="px-6 mb-6">
            <ModeSwitch
              uid={driver.uid}
              currentMode={activeMode}
              onModeChange={(mode) => updateDriver({ activeMode: mode })}
              disabled={driver?.activeDeliveryOrderId != null}
            />
          </div>
        )}

        {/* Section livraison */}
        {(activeMode === 'livraison' || driverType === 'livreur') && driver && (
          <div className="px-6 mb-8">
            <h2 className="text-lg font-bold text-white mb-4">Commandes de livraison</h2>
            <DeliveryOrdersList uid={driver.uid} />
          </div>
        )}

        {/* Current Trip */}
        {currentTrip && (
          <div className="px-6 mb-8">
            <CurrentTripCard
              trip={currentTrip}
              onMarkAsArrived={handleMarkAsArrived}
              onStartTrip={handleStartTrip}
              onCompleteTrip={handleCompleteTrip}
            />
          </div>
        )}

        {/* Demandes en cours */}
        <div className="px-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-white">Demandes en cours</h2>
            {rideRequests.length > 0 && (
              <span className="text-primary text-xs font-bold px-2 py-1 bg-primary/10 rounded">Nouveau</span>
            )}
          </div>

          {rideRequests.length > 0 ? (
            <div className="space-y-4">
              {rideRequests.map((request) => (
                <RideRequestCard
                  key={request.rideId}
                  request={request}
                  onAccept={() => handleAcceptRideRequest(request.rideId)}
                  onDecline={() => handleDeclineRideRequest(request.rideId)}
                />
              ))}
            </div>
          ) : (
            <>
              {availableTrips.length === 0 ? (
                <GlassCard className="p-8 text-center">
                  <MaterialIcon name="search_off" className="text-slate-500 text-[40px] mb-3" />
                  <p className="text-slate-400 text-sm">Aucune demande pour le moment</p>
                </GlassCard>
              ) : (
                <div className="space-y-4">
                  {availableTrips.map((trip) => (
                    <GlassCard key={trip.id} variant="bordered" className="p-5">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <p className="text-slate-400 text-[10px] uppercase font-bold tracking-widest mb-1">Course #{trip.id.slice(-4)}</p>
                          <div className="flex items-center gap-2">
                            <span className="text-2xl font-black text-white">{formatCurrencyWithCode(trip.price)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-4 mb-6 relative">
                        <div className="absolute left-[7px] top-3 bottom-3 w-[1.5px] bg-slate-700" />
                        <div className="flex items-start gap-4">
                          <div className="size-4 rounded-full border-2 border-primary bg-background z-10 flex items-center justify-center">
                            <div className="size-1.5 bg-primary rounded-full" />
                          </div>
                          <div>
                            <p className="text-slate-400 text-[10px] uppercase font-bold leading-none mb-1">Départ</p>
                            <p className="text-white text-sm font-medium">{trip.pickup}</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-4">
                          <div className="size-4 rounded-full border-2 border-white/40 bg-background z-10 flex items-center justify-center">
                            <div className="size-1.5 bg-white/40 rounded-full" />
                          </div>
                          <div>
                            <p className="text-slate-400 text-[10px] uppercase font-bold leading-none mb-1">Destination</p>
                            <p className="text-white text-sm font-medium">{trip.destination}</p>
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          onClick={() => acceptTrip(trip.id)}
                          className="py-3 rounded-xl bg-gradient-to-r from-primary to-orange-600 text-background font-bold shadow-lg shadow-primary/20 active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
                        >
                          <MaterialIcon name="check_circle" size="md" />
                          Accepter
                        </button>
                        <button
                          onClick={() => setAvailableTrips(prev => prev.filter(t => t.id !== trip.id))}
                          className="py-3 rounded-xl border border-white/10 bg-white/5 text-slate-400 font-bold active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
                        >
                          <MaterialIcon name="cancel" size="md" />
                          Ignorer
                        </button>
                      </div>
                    </GlassCard>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Historique du jour */}
        <div className="px-6 mb-8">
          <h2 className="text-lg font-bold text-white mb-4">Historique du jour</h2>
          <GlassCard className="p-5">
            {dailyHistory.length > 0 ? (
              <div className="space-y-4">
                {dailyHistory.map(trip => (
                  <div key={trip.id} className="border-b border-white/5 pb-3 last:border-b-0">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="font-semibold text-white text-sm">Course #{trip.id.slice(-4)}</p>
                        <p className="text-xs text-slate-400">
                          {trip.createdAt instanceof Timestamp
                            ? new Date(trip.createdAt.seconds * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
                            : trip.createdAt
                              ? new Date(trip.createdAt instanceof Date ? trip.createdAt : trip.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
                              : '--:--'
                          } — {trip.destination}
                        </p>
                      </div>
                      <span className="text-primary font-bold text-sm">{formatCurrencyWithCode(trip.price)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-500 text-center py-4 text-sm">Aucune course complétée aujourd&apos;hui.</p>
            )}
          </GlassCard>
        </div>

        {/* Quick Actions */}
        <div className="px-6 mb-8">
          <div className="flex gap-3">
            <Link href="/dashboard" className="flex-1">
              <GlassCard className="p-4 flex items-center gap-3 active:scale-[0.98] transition-transform">
                <MaterialIcon name="person" size="md" className="text-primary" />
                <span className="text-white text-sm font-medium">Espace client</span>
              </GlassCard>
            </Link>
            <Link href="/driver/profile" className="flex-1">
              <GlassCard className="p-4 flex items-center gap-3 active:scale-[0.98] transition-transform">
                <MaterialIcon name="settings" size="md" className="text-primary" />
                <span className="text-white text-sm font-medium">Mon profil</span>
              </GlassCard>
            </Link>
          </div>
        </div>

      </div>
      </div>
      {/* Bottom Nav — en dehors du conteneur contraint pour éviter tout problème de stacking context */}
      <BottomNav items={driverNavItems} />
    </>
  );
}


function Loading() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <div className="relative w-16 h-16 mx-auto mb-6">
          <div className="absolute inset-0 bg-primary rounded-full opacity-20 animate-ping" />
          <div className="relative w-16 h-16 bg-primary rounded-full flex items-center justify-center animate-pulse">
            <MaterialIcon name="local_taxi" className="text-white text-[28px]" />
          </div>
        </div>
        <p className="text-slate-400 animate-pulse">Chargement...</p>
      </div>
    </div>
  );
}

function ErrorView({ error, onLogout }: { error: string; onLogout: () => void }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="glass-card p-8 rounded-2xl text-center max-w-sm w-full border border-white/10">
        <div className="w-14 h-14 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-destructive/20">
          <MaterialIcon name="error" className="text-destructive text-[28px]" />
        </div>
        <p className="text-destructive text-sm mb-6">{error}</p>
        <button
          onClick={onLogout}
          className="w-full h-12 bg-gradient-to-r from-primary to-[#ffae33] text-white font-bold rounded-xl active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
        >
          <MaterialIcon name="logout" size="sm" />
          Se déconnecter
        </button>
      </div>
    </div>
  );
}

function NoDriver({ onLogout }: { onLogout: () => void }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="glass-card p-8 rounded-2xl text-center max-w-sm w-full border border-white/10">
        <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <MaterialIcon name="person_off" className="text-primary text-[28px]" />
        </div>
        <p className="text-slate-400 text-sm mb-6">Aucun profil chauffeur trouvé</p>
        <button
          onClick={onLogout}
          className="w-full h-12 bg-gradient-to-r from-primary to-[#ffae33] text-white font-bold rounded-xl active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
        >
          <MaterialIcon name="logout" size="sm" />
          Se déconnecter
        </button>
      </div>
    </div>
  );
}
