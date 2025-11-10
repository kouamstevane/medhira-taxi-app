"use client";

import { useState, useEffect } from 'react';
import { auth, db } from '@/config/firebase';
import {
  doc,
  getDoc,
  onSnapshot,
  updateDoc,
  collection,
  query,
  where
} from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import Link from 'next/link';
import { 
  FiTruck, FiDollarSign, FiStar, FiRefreshCw, 
  FiLogOut, FiUser, FiMapPin, FiCheckCircle,
  FiPlay, FiX, FiArrowRight
} from 'react-icons/fi';

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

interface Trip {
  id: string;
  passengerName: string;
  pickup: string;
  destination: string;
  price: number;
  status: 'pending' | 'accepted' | 'arrived' | 'in_progress' | 'completed' | 'cancelled';
  createdAt: any;
}

export default function DriverDashboard() {
  const [driver, setDriver] = useState<DriverData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [availableTrips, setAvailableTrips] = useState<Trip[]>([]);
  const [currentTrip, setCurrentTrip] = useState<Trip | null>(null);
  const router = useRouter();

  const getInitials = (firstName?: string, lastName?: string): string => {
    const firstChar = firstName?.[0] || 'D';
    const lastChar = lastName?.[0] || 'C';
    return `${firstChar}${lastChar}`;
  };

  const formatValue = (value: any, defaultValue: any = 'N/A') => {
    return value ?? defaultValue;
  };

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        router.push('/driver/login');
        return;
      }

      try {
        const driverDoc = await getDoc(doc(db, 'drivers', user.uid));
        if (!driverDoc.exists()) {
          setError("Profil chauffeur non trouvé");
          setLoading(false);
          return;
        }

        const driverData = driverDoc.data();
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

        // Écouter les courses en attente
        const q = query(collection(db, "bookings"), where("status", "==", "pending"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
          const trips: Trip[] = [];
          snapshot.forEach((doc) => {
            const data = doc.data();
            trips.push({
              id: doc.id,
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

        return () => {
          unsubscribe();
        };
      } catch (err) {
        console.error('Erreur de chargement:', err);
        setError("Erreur de chargement");
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, [router]);

  const toggleAvailability = async () => {
    if (!auth.currentUser || !driver) return;
    try {
      await updateDoc(doc(db, 'drivers', auth.currentUser.uid), {
        isAvailable: !driver.isAvailable
      });
      setDriver({ ...driver, isAvailable: !driver.isAvailable });
    } catch (error) {
      setError("Erreur de changement de disponibilité");
    }
  };

  const acceptTrip = async (tripId: string) => {
    if (!auth.currentUser || !driver) return;

    const bookingRef = doc(db, "bookings", tripId);
    try {
      const tripSnap = await getDoc(bookingRef);
      if (!tripSnap.exists() || tripSnap.data().status !== "pending") {
        alert("Course déjà prise.");
        return;
      }

      await updateDoc(bookingRef, {
        status: "accepted",
        driverId: auth.currentUser.uid,
        driverName: `${driver.firstName} ${driver.lastName}`,
        driverPhone: driver.phone,
        carModel: driver.car?.model,
        carPlate: driver.car?.plate,
        carColor: driver.car?.color,
        acceptedAt: new Date()
      });

      await updateDoc(doc(db, 'drivers', auth.currentUser.uid), {
        isAvailable: false
      });

      setDriver({ ...driver, isAvailable: false });
      setAvailableTrips(prev => prev.filter(t => t.id !== tripId));
      
      const tripData = tripSnap.data();
      setCurrentTrip({
        id: tripId,
        passengerName: tripData.passengerName || "Client",
        pickup: tripData.pickup,
        destination: tripData.destination,
        price: tripData.price,
        status: "accepted",
        createdAt: tripData.createdAt
      });
    } catch (err) {
      console.error("Erreur d'acceptation:", err);
      alert("Impossible d'accepter la course.");
    }
  };

  const markAsArrived = async (tripId: string) => {
    if (!currentTrip) return;
    const ref = doc(db, "bookings", tripId);
    await updateDoc(ref, { status: "arrived" });
    setCurrentTrip({ ...currentTrip, status: "arrived" });
  };

  const startTrip = async (tripId: string) => {
    if (!currentTrip) return;
    const ref = doc(db, "bookings", tripId);
    await updateDoc(ref, { status: "in_progress" });
    setCurrentTrip({ ...currentTrip, status: "in_progress" });
  };

  const completeTrip = async (tripId: string) => {
    if (!auth.currentUser || !driver || !currentTrip) return;
    
    const ref = doc(db, "bookings", tripId);
    await updateDoc(ref, {
      status: "completed",
      finalPrice: currentTrip.price,
      completedAt: new Date()
    });

    await updateDoc(doc(db, 'drivers', auth.currentUser.uid), {
      isAvailable: true,
      earnings: (driver.earnings || 0) + (currentTrip.price || 0),
      tripsCompleted: (driver.tripsCompleted || 0) + 1
    });

    setDriver({
      ...driver,
      isAvailable: true,
      earnings: (driver.earnings || 0) + (currentTrip.price || 0),
      tripsCompleted: (driver.tripsCompleted || 0) + 1
    });

    setCurrentTrip(null);
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      // Forcer le rechargement complet pour vider le cache
      window.location.href = '/driver/login';
    } catch (error) {
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6 mb-6 sm:mb-8">
          {[
            { label: "Courses", value: formatValue(driver.tripsCompleted, 0), icon: FiTruck, color: "bg-blue-100", iconColor: "text-blue-600" },
            { label: "Revenus", value: `${(driver.earnings || 0).toLocaleString()} FCFA`, icon: FiDollarSign, color: "bg-green-100", iconColor: "text-green-600" },
            { label: "Note", value: `${formatValue(driver.rating, 0)}/5`, icon: FiStar, color: "bg-yellow-100", iconColor: "text-yellow-600" },
            { label: "Statut", value: formatValue(driver.status, 'actif'), icon: FiRefreshCw, color: "bg-purple-100", iconColor: "text-purple-600" }
          ].map((stat, i) => {
            const IconComponent = stat.icon;
            return (
              <div key={i} className="bg-white rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-lg">
                <div className="flex items-center">
                  <div className={`${stat.color} p-2 sm:p-3 rounded-lg flex-shrink-0`}>
                    <IconComponent className={`h-5 w-5 sm:h-6 sm:w-6 ${stat.iconColor}`} />
                  </div>
                  <div className="ml-3 sm:ml-4 min-w-0 flex-1">
                    <p className="text-xs sm:text-sm text-gray-600">{stat.label}</p>
                    <p className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900 truncate">{stat.value}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
          {currentTrip && (
            <div className="lg:col-span-2">
              <div className="bg-white rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-lg">
                <h2 className="text-xl font-bold mb-4">Course en cours</h2>
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="font-semibold">Client</p>
                      <p className="text-sm text-gray-600 truncate">{currentTrip.pickup}</p>
                      <p className="text-sm text-gray-600">→ {currentTrip.destination}</p>
                    </div>
                    <span className="bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-sm">
                      {currentTrip.status === "accepted" ? "Acceptée" : 
                       currentTrip.status === "arrived" ? "Arrivé" : 
                       currentTrip.status === "in_progress" ? "En cours" : 
                       currentTrip.status}
                    </span>
                  </div>
                  <div className="space-y-2 mb-4">
                    <div className="flex items-center">
                      <FiMapPin className="h-4 w-4 text-green-500 mr-3" />
                      <span className="text-sm">{currentTrip.pickup}</span>
                    </div>
                    <div className="flex items-center">
                      <FiMapPin className="h-4 w-4 text-red-500 mr-3" />
                      <span className="text-sm">{currentTrip.destination}</span>
                    </div>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-lg font-bold">{currentTrip.price} FCFA</span>
                    <div className="flex flex-col sm:flex-row gap-2 sm:space-x-2">
                      {currentTrip.status === "accepted" && (
                        <button 
                          onClick={() => markAsArrived(currentTrip.id)} 
                          className="bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white px-4 py-2 sm:px-3 sm:py-1 rounded text-sm flex items-center justify-center space-x-1 sm:space-x-2 transition touch-manipulation"
                          style={{ minHeight: '44px' }}
                        >
                          <FiCheckCircle className="h-4 w-4" />
                          <span>Je suis arrivé</span>
                        </button>
                      )}
                      {currentTrip.status === "arrived" && (
                        <button 
                          onClick={() => startTrip(currentTrip.id)} 
                          className="bg-green-500 hover:bg-green-600 active:bg-green-700 text-white px-4 py-2 sm:px-3 sm:py-1 rounded text-sm flex items-center justify-center space-x-1 sm:space-x-2 transition touch-manipulation"
                          style={{ minHeight: '44px' }}
                        >
                          <FiPlay className="h-4 w-4" />
                          <span>Démarrer</span>
                        </button>
                      )}
                      {currentTrip.status === "in_progress" && (
                        <button 
                          onClick={() => completeTrip(currentTrip.id)} 
                          className="bg-red-500 hover:bg-red-600 active:bg-red-700 text-white px-4 py-2 sm:px-3 sm:py-1 rounded text-sm flex items-center justify-center space-x-1 sm:space-x-2 transition touch-manipulation"
                          style={{ minHeight: '44px' }}
                        >
                          <FiCheckCircle className="h-4 w-4" />
                          <span>Terminer</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className={currentTrip ? 'lg:col-span-1' : 'lg:col-span-3'}>
            <div className="bg-white rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-lg">
              <h2 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4">Courses disponibles</h2>
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
                          {trip.price} FCFA
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