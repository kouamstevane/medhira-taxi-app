"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react';
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
  orderBy
} from 'firebase/firestore';
import { useRouter, useSearchParams } from 'next/navigation';
import { signOut } from 'firebase/auth';
import Link from 'next/link';
import {
  FiTruck, FiDollarSign, FiStar, FiRefreshCw,
  FiLogOut, FiUser, FiMapPin, FiCheckCircle,
  FiArrowRight
} from 'react-icons/fi';
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
import { updateDriverLocation, calculateFinalFare, markDriverArrived, startTrip, completeTrip } from '@/services/taxi.service';
import { resendVerificationEmail } from '@/services/auth.service';
import { RideRequestCard } from './components/RideRequestCard';
import { CurrentTripCard } from './components/CurrentTripCard';
import { StatsCard } from './components/StatsCard';
import { getDriverDashboardInfoMessage } from '@/utils/driver.utils';

interface CarInfo {
  model?: string;
  plate?: string;
  color?: string;
}

interface DriverData {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  car?: CarInfo;
  status?: string;
  isAvailable?: boolean;
  rating?: number;
  tripsCompleted?: number;
  earnings?: number;
}


interface PreciseLocation {
  lat: number;
  lng: number;
  accuracy?: number;
}

interface Trip {
  id: string;
  userId: string; // ID du client pour le chat
  passengerName: string;
  pickup: string;
  destination: string;
  price: number;
  status: 'pending' | 'accepted' | 'driver_arrived' | 'in_progress' | 'completed' | 'cancelled';
  createdAt: any;
  unreadMessages?: {
    client: number;
    driver: number;
  };
  // Coordonnées GPS précises pour la navigation
  pickupLocation?: PreciseLocation;
  pickupLocationAccuracy?: number; // Précision en mètres
  destinationLocation?: PreciseLocation;
  driverLocation?: PreciseLocation;
  passengerLocation?: PreciseLocation;
}

interface RideRequest {
  rideId: string;
  candidate: RideCandidate;
  bookingData?: {
    pickup: string;
    destination: string;
    price: number;
    distance?: number;
    duration?: number;
  };
}

export default function DriverDashboard() {
  const [driver, setDriver] = useState<DriverData | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [availableTrips, setAvailableTrips] = useState<Trip[]>([]);
  const [currentTrip, setCurrentTrip] = useState<Trip | null>(null);
  const [rideRequests, setRideRequests] = useState<RideRequest[]>([]);
  const [dailyHistory, setDailyHistory] = useState<Trip[]>([]);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [sendingEmail, setSendingEmail] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  const getInitials = (firstName?: string, lastName?: string): string => {
    const firstChar = firstName?.[0] || 'D';
    const lastChar = lastName?.[0] || 'C';
    return `${firstChar}${lastChar}`;
  };

  const formatValue = (value: any, defaultValue: any = 'N/A') => {
    return value ?? defaultValue;
  };

  /**
   * Fonction pour renvoyer l'email de vérification au chauffeur
   * Utilise la même logique que la page verify-email
   */
  const handleResendVerificationEmail = async () => {
    if (!currentUser) {
      setError("Utilisateur non connecté");
      return;
    }

    setSendingEmail(true);
    setError(null);

    try {
      await resendVerificationEmail(
        currentUser,
        (message) => {
          setInfoMessage(message);
          // Masquer le message après 5 secondes
          setTimeout(() => {
            setInfoMessage(null);
          }, 5000);
        },
        (errorMessage) => {
          setError(errorMessage);
        }
      );
    } catch (err: unknown) {
      const error = err as { code?: string; message?: string };
      console.error('[DriverDashboard] Erreur lors de l\'envoi de l\'email de vérification:', error);
      setError(error.message || 'Erreur lors de l\'envoi de l\'email de vérification');
    } finally {
      setSendingEmail(false);
    }
  };

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        router.push('/driver/login');
        return;
      }

      // Mettre à jour l'état de l'utilisateur actuel
      setCurrentUser(user);

      try {
        const driverDoc = await getDoc(doc(db, 'drivers', user.uid));
        if (!driverDoc.exists()) {
          setError("Profil chauffeur non trouvé");
          setLoading(false);
          return;
        }

        const driverData = driverDoc.data();
        
        // Vérifier si le compte est actif
        if (driverData.isActive === false) {
          await signOut(auth);
          alert('Votre compte a été désactivé par un administrateur. Contactez le support.');
          router.push('/driver/login');
          return;
        }

        // Vérifier si le compte est suspendu
        if (driverData.isSuspended) {
          await signOut(auth);
          const reason = driverData.suspensionReason || 'Contactez le support pour plus d\'informations.';
          alert(`Votre compte a été suspendu. Raison: ${reason}`);
          router.push('/driver/login');
          return;
        }

        if (driverData.status === 'rejected') {
          alert('Votre demande a été rejetée. Vous pouvez soumettre une nouvelle demande.');
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

        const safeDriverData: DriverData = {
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
          where("status", "in", ["accepted", "driver_arrived", "in_progress"])
        );
        
        console.log('[DRIVER] Initialisation listener courses actives pour:', user.uid);
        
        const unsubscribeCurrentTrip = onSnapshot(currentTripQuery, async (snapshot) => {
          console.log('[DRIVER] Snapshot courses actives:', snapshot.size, 'résultat(s)');
          
          if (!snapshot.empty) {
            const doc = snapshot.docs[0]; // Prendre la première course active
            const data = doc.data();
            
            console.log('[DRIVER] Course active trouvée:', {
              id: doc.id,
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
                id: doc.id,
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
              setDriver(prev => prev ? { ...prev, isAvailable: true } : null);
            } catch (err) {
              console.error('[DRIVER] Erreur mise à jour disponibilité:', err);
            }
          }
        });

        // Écouter les courses en attente (ancien système)
        const q = query(collection(db, "bookings"), where("status", "==", "pending"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
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

        // Écouter les nouvelles demandes de course (nouveau système de matching)
        const unsubscribeRideRequests = subscribeToDriverRideRequests(user.uid, async (requests) => {
          // Charger les détails de chaque booking
          const rideRequestsWithData: RideRequest[] = await Promise.all(
            requests.map(async (req) => {
              try {
                const bookingDoc = await getDoc(doc(db, 'bookings', req.rideId));
                if (bookingDoc.exists()) {
                  const bookingData = bookingDoc.data();
                  return {
                    ...req,
                    bookingData: {
                      pickup: bookingData.pickup,
                      destination: bookingData.destination,
                      price: bookingData.price,
                      distance: bookingData.distance,
                      duration: bookingData.duration,
                    },
                  };
                }
                return req;
              } catch (error) {
                console.error('Erreur chargement booking:', error);
                return req;
              }
            })
          );
          setRideRequests(rideRequestsWithData);
        });

        // Charger les demandes en attente au démarrage
        getPendingCandidatesForDriver(user.uid).then(async (requests) => {
          const rideRequestsWithData: RideRequest[] = await Promise.all(
            requests.map(async (req) => {
              try {
                const bookingDoc = await getDoc(doc(db, 'bookings', req.rideId));
                if (bookingDoc.exists()) {
                  const bookingData = bookingDoc.data();
                  return {
                    ...req,
                    bookingData: {
                      pickup: bookingData.pickup,
                      destination: bookingData.destination,
                      price: bookingData.price,
                      distance: bookingData.distance,
                      duration: bookingData.duration,
                    },
                  };
                }
                return req;
              } catch (error) {
                console.error('Erreur chargement booking:', error);
                return req;
              }
            })
          );
          setRideRequests(rideRequestsWithData);
        });

        return () => {
          unsubscribeCurrentTrip();
          unsubscribe();
          unsubscribeRideRequests();
        };
      } catch (err) {
        console.error('Erreur de chargement:', err);
        setError("Erreur de chargement");
      } finally {
        setLoading(false);
        fetchDailyHistory(user.uid);
      }
    });

    return () => unsubscribeAuth();
  }, [router]);

  // Suivi GPS en temps réel quand une course est active
  useEffect(() => {
    if (!currentTrip || !['accepted', 'driver_arrived', 'in_progress'].includes(currentTrip.status)) return;

    console.log('[DRIVER] Démarrage du suivi GPS pour la course:', currentTrip.id);

    const THROTTLE_MS = 2500;
    let lastUpdateTime = 0;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const now = Date.now();
        if (now - lastUpdateTime < THROTTLE_MS) {
          return;
        }
        lastUpdateTime = now;
        const { latitude, longitude } = position.coords;
        updateDriverLocation(currentTrip.id, { lat: latitude, lng: longitude })
          .catch(err => console.error('Erreur updateDriverLocation:', err));
      },
      (error) => console.error('Erreur GPS:', error),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
    );

    return () => {
      console.log('[DRIVER] Arrêt du suivi GPS');
      navigator.geolocation.clearWatch(watchId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrip?.id, currentTrip?.status]);

  const fetchDailyHistory = async (driverId: string) => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const historyQuery = query(
        collection(db, 'bookings'),
        where('driverId', '==', driverId),
        where('status', '==', 'completed'),
        where('completedAt', '>=', today),
        orderBy('completedAt', 'desc')
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
    try {
      await updateDoc(doc(db, 'drivers', auth.currentUser.uid), {
        isAvailable: !driver.isAvailable
      });
      setDriver({ ...driver, isAvailable: !driver.isAvailable });
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
        alert(result.error || "Impossible d'accepter la course. Elle a peut-être déjà été prise.");
        return;
      }

      // Incrémenter le compteur de courses acceptées
      await incrementDriverAcceptedTrips(auth.currentUser.uid);

      // Mettre à jour l'état local
      setDriver({ ...driver, isAvailable: false });
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
    } catch (err: any) {
      console.error("Erreur d'acceptation:", err);
      alert(err.message || "Impossible d'accepter la course.");
    }
  };

  const handleDeclineRideRequest = async (rideId: string) => {
    if (!auth.currentUser) return;

    try {
      await markCandidateDeclined(rideId, auth.currentUser.uid);
      await incrementDriverDeclinedTrips(auth.currentUser.uid);
      
      // Retirer de la liste
      setRideRequests(prev => prev.filter(r => r.rideId !== rideId));
    } catch (err: any) {
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
        alert(result.error || "Impossible d'accepter la course. Elle a peut-être déjà été prise.");
        return;
      }

      // Incrémenter le compteur de courses acceptées
      await incrementDriverAcceptedTrips(auth.currentUser.uid);

      // Mettre à jour l'état local
      setDriver({ ...driver, isAvailable: false });
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
    } catch (err: any) {
      console.error("Erreur d'acceptation:", err);
      alert(err.message || "Impossible d'accepter la course.");
    }
  };

  const handleMarkAsArrived = async (tripId: string) => {
    if (!currentTrip) return;
    try {
      await markDriverArrived(tripId);
      // Le state se mettra à jour via onSnapshot
    } catch (error) {
      console.error('Erreur marquage arrivée:', error);
      alert('Erreur lors du marquage. Réessayez.');
    }
  };

  const handleStartTrip = async (tripId: string) => {
    if (!currentTrip) return;
    try {
      await startTrip(tripId);
      // Le state se mettra à jour via onSnapshot
    } catch (error) {
      console.error('Erreur démarrage course:', error);
      alert('Erreur lors du démarrage. Réessayez.');
    }
  };

  const handleCompleteTrip = async (tripId: string) => {
    if (!auth.currentUser || !driver || !currentTrip) return;
    
    try {
      // Appel de la fonction du service qui gère tout
      await completeTrip(tripId);
      
      // Récupérer le prix final pour mettre à jour les stats
      const finalPrice = await calculateFinalFare(tripId);

      await updateDoc(doc(db, 'drivers', auth.currentUser.uid), {
        earnings: (driver.earnings || 0) + (finalPrice || 0),
        tripsCompleted: (driver.tripsCompleted || 0) + 1
      });

      setDriver({
        ...driver,
        isAvailable: true,
        earnings: (driver.earnings || 0) + (finalPrice || 0),
        tripsCompleted: (driver.tripsCompleted || 0) + 1
      });

      setCurrentTrip(null);
    } catch (error) {
      console.error("Erreur lors de la fin de course:", error);
      alert("Erreur lors de la clôture de la course");
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

  return (
    <div className="min-h-screen bg-[#e6e6e6]">
      <header className="bg-[#101010] text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-8">
          <div className="flex justify-between items-center py-3 sm:py-4">
            <div className="flex items-center space-x-2 sm:space-x-4 min-w-0 flex-1">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-r from-[#f29200] to-[#ffaa33] rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold text-sm sm:text-lg">{getInitials(driver.firstName, driver.lastName)}</span>
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-base sm:text-xl lg:text-2xl font-bold text-white truncate">{formatValue(driver.firstName)} {formatValue(driver.lastName)}</h1>
                <p className="text-xs sm:text-sm text-gray-300 truncate">{formatValue(driver.car?.model)} • {formatValue(driver.car?.plate)}</p>
              </div>
            </div>
            <div className="flex items-center space-x-1 sm:space-x-2 flex-shrink-0">
              <Link 
                href="/dashboard" 
                className="text-white hover:text-[#f29200] transition flex items-center justify-center px-2 sm:px-3 py-2 rounded-lg hover:bg-[#1a1a1a] touch-manipulation"
                title="Accéder à l'espace client"
                style={{ minHeight: '44px', minWidth: '44px' }}
              >
                <FiUser className="h-5 w-5" />
                <span className="hidden lg:inline text-sm ml-2">Espace client</span>
              </Link>
              <div className="flex items-center space-x-1 sm:space-x-2">
                <span className="text-gray-300 text-xs sm:text-sm hidden sm:inline">Disponible</span>
                <button 
                  onClick={toggleAvailability} 
                  className={`relative inline-flex h-6 w-11 rounded-full touch-manipulation ${driver.isAvailable ? 'bg-green-400' : 'bg-gray-300'}`}
                  style={{ minHeight: '44px', minWidth: '44px' }}
                  aria-label={driver.isAvailable ? 'Désactiver la disponibilité' : 'Activer la disponibilité'}
                >
                  <span className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform ${driver.isAvailable ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
              <button 
                onClick={handleLogout} 
                className="bg-red-500 hover:bg-red-600 active:bg-red-700 text-white px-2 sm:px-4 py-2 rounded-lg transition flex items-center space-x-1 sm:space-x-2 touch-manipulation"
                style={{ minHeight: '44px' }}
              >
                <FiLogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Déconnexion</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-8 py-4 sm:py-6 lg:py-8">
        {infoMessage && (
          <div className="mb-4 sm:mb-6 p-4 bg-blue-50 border-l-4 border-blue-500 text-blue-700 rounded">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-sm sm:text-base flex-1">{infoMessage}</p>
              {/* Afficher le bouton "Renvoyer l'email" uniquement si l'email n'est pas vérifié */}
              {currentUser && !currentUser.emailVerified && (!driver || driver.status === 'pending') && (
                <button
                  onClick={handleResendVerificationEmail}
                  disabled={sendingEmail}
                  className="self-start sm:self-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-medium rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2 touch-manipulation"
                  style={{ minHeight: '44px' }}
                >
                  <FiRefreshCw className={`h-4 w-4 ${sendingEmail ? 'animate-spin' : ''}`} />
                  <span>{sendingEmail ? 'Envoi en cours...' : 'Renvoyer l\'email'}</span>
                </button>
              )}
            </div>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6 mb-6 sm:mb-8">
          {[
            { label: "Courses", value: formatValue(driver.tripsCompleted, 0), icon: FiTruck, color: "bg-blue-100", iconColor: "text-blue-600" },
            { label: "Revenus", value: formatCurrencyWithCode(driver.earnings || 0), icon: FiDollarSign, color: "bg-green-100", iconColor: "text-green-600" },
            { label: "Note", value: `${formatValue(driver.rating, 0)}/5`, icon: FiStar, color: "bg-yellow-100", iconColor: "text-yellow-600" },
            { label: "Statut", value: formatValue(driver.status, 'actif'), icon: FiRefreshCw, color: "bg-purple-100", iconColor: "text-purple-600" }
          ].map((stat, i) => (
            <StatsCard
              key={i}
              label={stat.label}
              value={stat.value}
              icon={stat.icon}
              color={stat.color}
              iconColor={stat.iconColor}
            />
          ))}
        </div>

        {/* Section Historique du jour */}
        <div className="mb-6 sm:mb-8">
          <h2 className="text-xl font-bold mb-4 text-gray-800">Historique du jour</h2>
          <div className="bg-white rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-lg">
            {dailyHistory.length > 0 ? (
              <div className="space-y-4">
                {dailyHistory.map(trip => (
                  <div key={trip.id} className="border-b border-gray-200 pb-3 last:border-b-0">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="font-semibold text-gray-800">Course #{trip.id.slice(-4)} - {trip.destination}</p>
                        <p className="text-sm text-gray-500">
                          {new Date(trip.createdAt.seconds * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} • {formatCurrencyWithCode(trip.price)}
                        </p>
                      </div>
                      <span className="text-sm font-medium text-green-600">Complétée</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-4">Aucune course complétée aujourd&apos;hui.</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
          {currentTrip && (
            <CurrentTripCard
              trip={currentTrip}
              onMarkAsArrived={handleMarkAsArrived}
              onStartTrip={handleStartTrip}
              onCompleteTrip={handleCompleteTrip}
            />
          )}

          <div className={currentTrip ? 'lg:col-span-1' : 'lg:col-span-3'}>
            <div className="bg-white rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-lg">
              <h2 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4 text-gray-800">Nouvelles demandes</h2>
              
              {/* Demandes de course avec matching */}
              {rideRequests.length > 0 && (
                <div className="space-y-3 sm:space-y-4 mb-4 sm:mb-6">
                  {rideRequests.map((request) => (
                    <RideRequestCard
                      key={request.rideId}
                      request={request}
                      onAccept={() => handleAcceptRideRequest(request.rideId)}
                      onDecline={() => handleDeclineRideRequest(request.rideId)}
                    />
                  ))}
                </div>
              )}

              {/* Anciennes courses disponibles (fallback) */}
              {rideRequests.length === 0 && (
                <>
                  <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 text-gray-700">Courses disponibles</h3>
                  {availableTrips.length === 0 ? (
                    <p className="text-gray-500 text-center py-8">Aucune course disponible</p>
                  ) : (
                    <div className="space-y-4">
                      {availableTrips.map((trip) => (
                        <div key={trip.id} className="border border-gray-200 rounded-lg p-3 sm:p-4">
                          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start mb-3 gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-sm sm:text-base">Course #{trip.id.slice(-4)}</p>
                              <div className="flex items-start mt-1 sm:mt-2">
                                <FiMapPin className="h-3 w-3 sm:h-4 sm:w-4 text-green-500 mr-1 sm:mr-2 flex-shrink-0 mt-0.5" />
                                <p className="text-xs sm:text-sm text-gray-600 break-words">{trip.pickup}</p>
                              </div>
                              <div className="flex items-start mt-1 sm:mt-2">
                                <FiArrowRight className="h-3 w-3 sm:h-4 sm:w-4 text-gray-400 mr-1 sm:mr-2 flex-shrink-0 mt-0.5" />
                                <p className="text-xs sm:text-sm text-gray-600 break-words">{trip.destination}</p>
                              </div>
                            </div>
                            <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-bold self-start sm:self-auto">
                              {formatCurrencyWithCode(trip.price)}
                            </span>
                          </div>
                          <button
                            onClick={() => acceptTrip(trip.id)}
                            className="w-full bg-[#f29200] hover:bg-[#e68600] active:bg-[#d67a00] text-white py-3 sm:py-2 rounded-lg transition flex items-center justify-center space-x-2 touch-manipulation"
                            style={{ minHeight: '44px' }}
                          >
                            <FiCheckCircle className="h-4 w-4" />
                            <span className="text-sm sm:text-base">Accepter</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


function Loading() {
  return (
    <div className="min-h-screen bg-[#e6e6e6] flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#f29200] mx-auto mb-4"></div>
        <p>Chargement...</p>
      </div>
    </div>
  );
}

function ErrorView({ error, onLogout }: { error: string; onLogout: () => void }) {
  return (
    <div className="min-h-screen bg-[#e6e6e6] flex items-center justify-center">
      <div className="bg-white p-6 rounded-lg shadow text-center">
        <p className="text-red-500 mb-4">{error}</p>
        <button onClick={onLogout} className="bg-[#f29200] text-white px-4 py-2 rounded-lg flex items-center space-x-2 mx-auto">
          <FiLogOut className="h-4 w-4" />
          <span>Se déconnecter</span>
        </button>
      </div>
    </div>
  );
}

function NoDriver({ onLogout }: { onLogout: () => void }) {
  return (
    <div className="min-h-screen bg-[#e6e6e6] flex items-center justify-center">
      <div className="text-center">
        <p className="text-red-500 mb-4">Aucun chauffeur trouvé</p>
        <button onClick={onLogout} className="bg-[#f29200] text-white px-4 py-2 rounded-lg flex items-center space-x-2 mx-auto">
          <FiLogOut className="h-4 w-4" />
          <span>Se déconnecter</span>
        </button>
      </div>
    </div>
  );
}
