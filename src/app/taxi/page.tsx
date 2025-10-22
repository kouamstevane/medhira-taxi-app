"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect, useRef, useCallback } from "react";
import { auth, db } from "../lib/firebase";
import {
  doc,
  getDoc,
  setDoc,
  collection,
  serverTimestamp,
  getDocs,
  onSnapshot,
  updateDoc
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

type Location = {
  lat: number;
  lng: number;
};

type CarType = {
  id: string;
  name: string;
  basePrice: number;
  pricePerKm: number;
  pricePerMinute: number;
  image: string;
  seats: number;
  time: string;
  order?: number;
};

type PricingConfig = {
  basePrice: number;
  pricePerKm: number;
  pricePerMinute: number;
  peakHourMultiplier: number;
  trafficMultiplier: number;
  discountRate: number;
};

type PlaceSuggestion = {
  description: string;
  place_id: string;
};

type DirectionsResult = google.maps.DirectionsResult;
type Map = google.maps.Map;

const getDefaultPricing = (): PricingConfig => ({
  basePrice: 1000,
  pricePerKm: 500,
  pricePerMinute: 50,
  peakHourMultiplier: 1.2,
  trafficMultiplier: 1.1,
  discountRate: 0.1
});

// Déclaration type pour le chargeur Google Maps
declare global {
  interface Window {
    google: any;
    initMap: () => void;
    googleMapsLoaded: boolean;
  }
}

export default function TaxiBooking() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [currentLocation, setCurrentLocation] = useState<Location | null>(null);
  const [pickup, setPickup] = useState("Chargement de votre position...");
  const [destination, setDestination] = useState("");
  const [pickupSuggestions, setPickupSuggestions] = useState<PlaceSuggestion[]>([]);
  const [destinationSuggestions, setDestinationSuggestions] = useState<PlaceSuggestion[]>([]);
  const [distance, setDistance] = useState<number | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [response, setResponse] = useState<DirectionsResult | null>(null);
  const [map, setMap] = useState<Map | null>(null);
  const [step, setStep] = useState<"select" | "confirm" | "booked" | "driver_found" | "completed">("select");
  const [selectedCar, setSelectedCar] = useState<CarType | null>(null);
  const [pricingConfig, setPricingConfig] = useState<PricingConfig>(getDefaultPricing());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPriceLoading, setIsPriceLoading] = useState(false);
  const [driverInfo, setDriverInfo] = useState<any>(null);
  const [finalPrice, setFinalPrice] = useState<number | null>(null);
  const pickupRef = useRef<HTMLInputElement>(null);
  const destinationRef = useRef<HTMLInputElement>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [carTypes, setCarTypes] = useState<CarType[]>([]);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [driverLocation, setDriverLocation] = useState<Location | null>(null);
  const [isMapsLoaded, setIsMapsLoaded] = useState(false);
  const [directionsService, setDirectionsService] = useState<google.maps.DirectionsService | null>(null);
  const [autocompleteService, setAutocompleteService] = useState<google.maps.places.AutocompleteService | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);

  // Charger Google Maps API une seule fois
  useEffect(() => {
    const loadGoogleMaps = () => {
      // Vérifier si l'API est déjà chargée
      if (window.google && window.google.maps) {
        setIsMapsLoaded(true);
        initializeMapServices();
        return;
      }

      // Vérifier si le script est déjà en cours de chargement
      if (document.querySelector('script[src*="maps.googleapis.com"]')) {
        // Attendre que le script existant se charge
        const checkExistingScript = setInterval(() => {
          if (window.google && window.google.maps) {
            clearInterval(checkExistingScript);
            setIsMapsLoaded(true);
            initializeMapServices();
          }
        }, 100);
        return;
      }

      // Charger le script Google Maps
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places,routes&callback=initMap`;
      script.async = true;
      script.defer = true;
      
      window.initMap = () => {
        setIsMapsLoaded(true);
        initializeMapServices();
      };

      script.onerror = () => {
        setError("Erreur de chargement de Google Maps");
        setLoading(false);
      };

      document.head.appendChild(script);
    };

    loadGoogleMaps();
  }, []);

  const initializeMapServices = useCallback(() => {
    if (window.google && window.google.maps) {
      try {
        // Initialiser les services
        setDirectionsService(new window.google.maps.DirectionsService());
        setAutocompleteService(new window.google.maps.places.AutocompleteService());
        setMapLoaded(true);
        
        // Initialiser la carte si la div existe
        if (mapRef.current && currentLocation) {
          const mapInstance = new window.google.maps.Map(mapRef.current, {
            center: currentLocation,
            zoom: 14,
            streetViewControl: false,
            mapTypeControl: false,
            fullscreenControl: false,
            styles: [{ featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] }]
          });
          setMap(mapInstance);
        }
      } catch (err) {
        console.error("Error initializing map services:", err);
        setError("Erreur d'initialisation de la carte");
      }
    }
  }, [currentLocation]);

  const getAddressFromCoordinates = useCallback(async (lat: number, lng: number): Promise<string> => {
    return new Promise((resolve) => {
      if (!window.google || !window.google.maps || !window.google.maps.Geocoder) {
        console.warn("Google Maps API not loaded, using fallback address");
        resolve(`Position actuelle (${lat.toFixed(4)}, ${lng.toFixed(4)})`);
        return;
      }

      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ location: { lat, lng } }, (results, status) => {
        if (status === "OK" && results?.[0]) {
          resolve(results[0].formatted_address);
        } else {
          console.warn("Geocoder failed, using fallback address:", status);
          resolve(`Position actuelle (${lat.toFixed(4)}, ${lng.toFixed(4)})`);
        }
      });
    });
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const loadPricingConfig = async () => {
      try {
        const docRef = doc(db, "config", "pricing");
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data && typeof data.basePrice === 'number') {
            setPricingConfig({
              basePrice: data.basePrice || 1000,
              pricePerKm: data.pricePerKm || 500,
              pricePerMinute: data.pricePerMinute || 50,
              peakHourMultiplier: data.peakHourMultiplier || 1.2,
              trafficMultiplier: data.trafficMultiplier || 1.1,
              discountRate: data.discountRate || 0.1
            });
          }
        }
      } catch (err) {
        console.error("Error loading pricing config:", err);
      }
    };

    const fetchVehicles = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, "vehicles"));
        const vehicles: CarType[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          if (data.isActive !== false) {
            vehicles.push({
              id: doc.id,
              name: data.name,
              basePrice: data.basePrice,
              pricePerKm: data.pricePerKm,
              pricePerMinute: data.pricePerMinute,
              image: data.image,
              seats: data.seats,
              time: data.time,
              order: data.order
            } as CarType);
          }
        });
        vehicles.sort((a, b) => (a.order || 0) - (b.order || 0));
        setCarTypes(vehicles);
      } catch (err) {
        console.error("Error loading vehicles:", err);
        setCarTypes([
          {
            id: "1",
            name: "Standard",
            basePrice: 1000,
            pricePerKm: 500,
            pricePerMinute: 50,
            image: "/images/car-standard.png",
            seats: 4,
            time: "5 min",
            order: 1
          },
          {
            id: "2",
            name: "Premium",
            basePrice: 1500,
            pricePerKm: 800,
            pricePerMinute: 80,
            image: "/images/car-premium.png",
            seats: 4,
            time: "3 min",
            order: 2
          },
          {
            id: "3",
            name: "Van",
            basePrice: 1200,
            pricePerKm: 700,
            pricePerMinute: 70,
            image: "/images/car-van.png",
            seats: 6,
            time: "7 min",
            order: 3
          }
        ]);
      }
    };

    const getCurrentLocation = async () => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            const location = {
              lat: position.coords.latitude,
              lng: position.coords.longitude
            };
            setCurrentLocation(location);
            try {
              const address = await getAddressFromCoordinates(location.lat, location.lng);
              setPickup(address);
            } catch (err) {
              console.error("Error getting address:", err);
              setPickup(`Position actuelle (${location.lat.toFixed(4)}, ${location.lng.toFixed(4)})`);
            }
          },
          async () => {
            const defaultLocation = { lat: 3.848, lng: 11.5021 };
            setCurrentLocation(defaultLocation);
            try {
              const address = await getAddressFromCoordinates(defaultLocation.lat, defaultLocation.lng);
              setPickup(address);
            } catch (err) {
              setPickup("Yaoundé, Cameroun");
            }
          }
        );
      } else {
        const defaultLocation = { lat: 3.848, lng: 11.5021 };
        setCurrentLocation(defaultLocation);
        setPickup("Yaoundé, Cameroun");
      }
    };

    const initialize = async () => {
      await Promise.all([
        getCurrentLocation(),
        loadPricingConfig(),
        fetchVehicles()
      ]);
      setLoading(false);
    };
    initialize();
  }, [getAddressFromCoordinates]);

  // Réinitialiser la carte quand la localisation change
  useEffect(() => {
    if (currentLocation && isMapsLoaded && mapRef.current && !map) {
      initializeMapServices();
    }
  }, [currentLocation, isMapsLoaded, map, initializeMapServices]);

  const handlePickupChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setPickup(value);
    
    if (value.length > 2 && autocompleteService) {
      autocompleteService.getPlacePredictions(
        {
          input: value,
          location: currentLocation ? new window.google.maps.LatLng(currentLocation.lat, currentLocation.lng) : undefined,
          radius: 20000
        },
        (predictions, status) => {
          if (status === "OK" && predictions) {
            setPickupSuggestions(predictions);
          } else {
            setPickupSuggestions([]);
          }
        }
      );
    } else {
      setPickupSuggestions([]);
    }
  }, [currentLocation, autocompleteService]);

  const handleDestinationChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setDestination(value);
    
    if (value.length > 2 && autocompleteService) {
      autocompleteService.getPlacePredictions(
        {
          input: value,
          location: currentLocation ? new window.google.maps.LatLng(currentLocation.lat, currentLocation.lng) : undefined,
          radius: 20000
        },
        (predictions, status) => {
          if (status === "OK" && predictions) {
            setDestinationSuggestions(predictions);
          } else {
            setDestinationSuggestions([]);
          }
        }
      );
    } else {
      setDestinationSuggestions([]);
    }
  }, [currentLocation, autocompleteService]);

  const selectSuggestion = useCallback((type: "pickup" | "destination", suggestion: PlaceSuggestion) => {
    if (type === "pickup") {
      setPickup(suggestion.description);
      setPickupSuggestions([]);
      if (pickupRef.current) pickupRef.current.focus();
    } else {
      setDestination(suggestion.description);
      setDestinationSuggestions([]);
      if (destinationRef.current) destinationRef.current.focus();
    }
  }, []);

  const calculateRoute = useCallback(() => {
    if (!pickup || !destination || !selectedCar || !directionsService) {
      setError("Service de calcul d'itinéraire non disponible");
      return;
    }

    directionsService.route(
      {
        origin: pickup,
        destination: destination,
        travelMode: window.google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (status === "OK" && result) {
          setResponse(result);
          const route = result.routes[0];
          const distanceInKm = route.legs[0].distance.value / 1000;
          const durationInMin = Math.ceil(route.legs[0].duration.value / 60);
          setDistance(distanceInKm);
          setDuration(durationInMin);
          calculatePrice(distanceInKm, durationInMin);
          setStep("confirm");
          setError(null);
        } else {
          setError("Impossible de calculer l'itinéraire. Vérifiez les adresses.");
        }
      }
    );
  }, [pickup, destination, selectedCar, directionsService]);

  const calculatePrice = useCallback((distanceKm: number, durationMin: number) => {
    if (!selectedCar || !pricingConfig) return;
    setIsPriceLoading(true);
    const now = new Date();
    const hours = now.getHours();
    const isPeakHour = (hours >= 7 && hours <= 9) || (hours >= 16 && hours <= 19);
    const trafficMultiplier = pricingConfig.trafficMultiplier || 1;
    const peakHourMultiplier = isPeakHour ? pricingConfig.peakHourMultiplier : 1;
    let calculatedPrice = selectedCar.basePrice +
      (distanceKm * selectedCar.pricePerKm) +
      (durationMin * selectedCar.pricePerMinute);
    calculatedPrice *= peakHourMultiplier * trafficMultiplier;
    if (pricingConfig.discountRate > 0) {
      calculatedPrice *= (1 - pricingConfig.discountRate);
    }
    const finalPrice = Math.ceil(calculatedPrice / 100) * 100;
    setTimeout(() => {
      setPrice(finalPrice);
      setIsPriceLoading(false);
    }, 500);
  }, [selectedCar, pricingConfig]);

  const confirmBooking = useCallback(async () => {
    if (!currentUser || !pickup || !destination || !price || !selectedCar || !distance || !duration) {
      setError("Informations manquantes pour la réservation");
      return;
    }
    try {
      setStep("booked");
      const bookingRef = doc(collection(db, "bookings"));
      const newBookingId = bookingRef.id;

      await setDoc(bookingRef, {
        userId: currentUser.uid,
        userEmail: currentUser.email,
        pickup,
        destination,
        distance,
        duration,
        price,
        carType: selectedCar.name,
        status: "pending",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        pickupLocation: currentLocation
      });

      setBookingId(newBookingId);

      const unsubscribe = onSnapshot(bookingRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();

          if (data.status === "accepted" && data.driverId) {
            setStep("driver_found");
            setDriverInfo({
              name: `${data.driverName}`,
              phone: data.driverPhone,
              car: `${data.carColor} ${data.carModel} (${data.carPlate})`,
              photo: `https://ui-avatars.com/api/?name=${data.driverName}&background=f29200&color=fff`
            });
            if (data.driverLocation) {
              setDriverLocation({
                lat: data.driverLocation.lat,
                lng: data.driverLocation.lng
              });
            }
          }

          if (data.status === "completed") {
            setStep("completed");
            setFinalPrice(data.finalPrice || data.price);
          }
        }
      });

      setTimeout(async () => {
        const snap = await getDoc(bookingRef);
        if (snap.exists() && snap.data().status === "pending") {
          await updateDoc(bookingRef, {
            status: "failed",
            reason: "Aucun chauffeur disponible après 60 secondes."
          });
          setError("Aucun chauffeur disponible après 60 secondes.");
          setStep("select");
        }
      }, 60000);

    } catch (err) {
      console.error("Error confirming booking:", err);
      setError("Erreur lors de la confirmation");
      setStep("confirm");
    }
  }, [currentUser, pickup, destination, price, selectedCar, distance, duration, currentLocation]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#e6e6e6]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#f29200]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#e6e6e6]">
      <header className="bg-[#101010] text-white flex items-center px-4 py-3 sticky top-0 z-50 shadow-lg">
        <button onClick={() => router.back()} className="mr-2 p-1 rounded-full hover:bg-[#333] transition">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
        <h1 className="text-xl font-bold">Commander un taxi</h1>
      </header>

      <main className="pb-20">
        <div className="fixed inset-0 z-0 h-[400px]">
          {!isMapsLoaded ? (
            <div className="w-full h-full bg-gray-200 flex items-center justify-center">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#f29200] mx-auto mb-4"></div>
                <p className="text-gray-600">Chargement de la carte...</p>
              </div>
            </div>
          ) : (
            <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
          )}
        </div>

        <div className="relative z-10 pt-[420px]">
          {error && (
            <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4 mx-4 rounded">
              <p>{error}</p>
              <button 
                onClick={() => setError(null)}
                className="mt-2 text-red-500 hover:text-red-700"
              >
                Fermer
              </button>
            </div>
          )}

          {step === "select" && (
            <div className="p-4 bg-white rounded-t-xl shadow-lg">
              <div className="bg-white rounded-xl p-4 mb-4">
                <div className="relative mb-4">
                  <label className="block text-sm font-medium text-[#101010] mb-1">Point de départ</label>
                  <input
                    type="text"
                    ref={pickupRef}
                    value={pickup}
                    onChange={handlePickupChange}
                    placeholder="Où êtes-vous ?"
                    className="w-full p-3 border border-[#e6e6e6] rounded-lg focus:ring-2 focus:ring-[#f29200] focus:border-[#f29200]"
                    disabled={!isMapsLoaded}
                  />
                  {pickupSuggestions.length > 0 && (
                    <ul className="absolute z-20 w-full mt-1 bg-white border border-[#e6e6e6] rounded-lg shadow-lg max-h-60 overflow-auto">
                      {pickupSuggestions.map((s, i) => (
                        <li key={i} onClick={() => selectSuggestion("pickup", s)} className="p-2 hover:bg-[#f29200] hover:text-white cursor-pointer">{s.description}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="relative mb-4">
                  <label className="block text-sm font-medium text-[#101010] mb-1">Destination</label>
                  <input
                    type="text"
                    ref={destinationRef}
                    value={destination}
                    onChange={handleDestinationChange}
                    placeholder="Où allez-vous ?"
                    className="w-full p-3 border border-[#e6e6e6] rounded-lg focus:ring-2 focus:ring-[#f29200] focus:border-[#f29200]"
                    disabled={!isMapsLoaded}
                  />
                  {destinationSuggestions.length > 0 && (
                    <ul className="absolute z-20 w-full mt-1 bg-white border border-[#e6e6e6] rounded-lg shadow-lg max-h-60 overflow-auto">
                      {destinationSuggestions.map((s, i) => (
                        <li key={i} onClick={() => selectSuggestion("destination", s)} className="p-2 hover:bg-[#f29200] hover:text-white cursor-pointer">{s.description}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
              <div className="bg-white rounded-xl p-4">
                <h3 className="text-lg font-bold text-[#101010] mb-3">Options de véhicule</h3>
                <div className="space-y-3">
                  {carTypes.map((car) => (
                    <div key={car.id} onClick={() => setSelectedCar(car)} className={`p-3 border rounded-lg cursor-pointer transition-all ${selectedCar?.id === car.id ? "border-[#f29200] bg-[#f29200] bg-opacity-10" : "border-[#e6e6e6] hover:border-[#f29200]"}`}>
                      <div className="flex items-center">
                        <img src={car.image} alt={car.name} className="w-16 h-16 object-contain mr-3" />
                        <div className="flex-1">
                          <h4 className="font-semibold">{car.name}</h4>
                          <p className="text-sm text-gray-600">{car.seats} places • {car.time}</p>
                        </div>
                        <div className="text-[#f29200] font-bold">{car.pricePerKm} FCFA/km</div>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  onClick={calculateRoute}
                  disabled={!pickup || !destination || !selectedCar || !isMapsLoaded}
                  className={`w-full py-3 mt-4 rounded-lg font-bold transition-all ${pickup && destination && selectedCar && isMapsLoaded ? "bg-[#f29200] hover:bg-[#e68600] text-white" : "bg-gray-300 text-gray-500 cursor-not-allowed"}`}
                >
                  {!isMapsLoaded ? "Chargement de la carte..." : "Calculer le trajet"}
                </button>
              </div>
            </div>
          )}

          {step === "confirm" && (
            <div className="p-4 bg-white rounded-t-xl shadow-lg">
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-600">De</span>
                  <span className="font-medium">{pickup}</span>
                </div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-600">À</span>
                  <span className="font-medium">{destination}</span>
                </div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-600">Distance</span>
                  <span className="font-medium">{distance?.toFixed(1)} km</span>
                </div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-600">Durée estimée</span>
                  <span className="font-medium">{duration} min</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Véhicule</span>
                  <span className="font-medium">{selectedCar?.name}</span>
                </div>
              </div>
              <div className="bg-[#f29200] bg-opacity-10 p-3 rounded-lg mb-4">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#101010]">Prix estimé</span>
                  {isPriceLoading ? (
                    <div className="animate-pulse h-8 w-24 bg-gray-200 rounded"></div>
                  ) : price !== null ? (
                    <span className="text-2xl font-bold text-[#f29200]">{price} FCFA</span>
                  ) : null}
                </div>
                <p className="text-sm text-gray-600 mt-1">Le prix final peut varier selon le trafic</p>
              </div>
              <button
                onClick={confirmBooking}
                className="w-full py-3 bg-[#f29200] hover:bg-[#e68600] text-white font-bold rounded-lg transition"
              >
                Confirmer la réservation
              </button>
            </div>
          )}

          {step === "booked" && (
            <div className="p-4 bg-white rounded-t-xl shadow-lg">
              <div className="flex flex-col items-center text-center">
                <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-[#f29200] mb-4"></div>
                <h2 className="text-xl font-bold text-[#101010] mb-2">Recherche d'un chauffeur</h2>
                <p className="text-gray-600 mb-4">Nous recherchons le meilleur chauffeur pour vous</p>
                <p className="text-sm text-gray-500">Temps max: 60 secondes</p>
              </div>
            </div>
          )}

          {step === "driver_found" && driverInfo && (
            <div className="p-4 bg-white rounded-t-xl shadow-lg">
              <div className="text-center mb-6">
                <div className="w-20 h-20 mx-auto mb-4 rounded-full overflow-hidden border-4 border-[#f29200]">
                  <img src={driverInfo.photo} alt="Chauffeur" className="w-full h-full object-cover" />
                </div>
                <h2 className="text-2xl font-bold text-[#101010]">Chauffeur trouvé !</h2>
                <p>Votre chauffeur est en route</p>
              </div>

              <div className="bg-gradient-to-r from-[#f29200] to-[#e68600] text-white p-4 rounded-lg mb-6">
                <div className="text-center">
                  <p className="text-lg font-bold">Il sera là dans</p>
                  <p className="text-3xl font-extrabold">5 min</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h3 className="font-bold text-[#101010]">Informations du chauffeur</h3>
                  <p><strong>Nom :</strong> {driverInfo.name}</p>
                  <p><strong>Téléphone :</strong> {driverInfo.phone}</p>
                  <p><strong>Véhicule :</strong> {driverInfo.car}</p>
                </div>
              </div>
            </div>
          )}

          {step === "completed" && finalPrice && (
            <div className="p-4 bg-white rounded-t-xl shadow-lg">
              <div className="text-center mb-6">
                <div className="text-green-500 text-4xl mb-2">🎉</div>
                <h2 className="text-2xl font-bold text-[#101010]">Course terminée !</h2>
                <p className="text-gray-600">Merci d'avoir utilisé Medjira Taxi</p>
              </div>

              <div className="bg-gradient-to-r from-green-500 to-green-600 text-white p-4 rounded-lg mb-6">
                <div className="text-center">
                  <p className="text-lg font-bold">Montant à payer</p>
                  <p className="text-3xl font-extrabold">{finalPrice} FCFA</p>
                </div>
              </div>

              <div className="space-y-3">
                <button
                  onClick={() => alert("Paiement PayPal initié")}
                  className="w-full bg-blue-500 hover:bg-blue-600 text-white py-3 rounded-lg font-medium transition"
                >
                  🌐 Payer avec PayPal
                </button>
                <button
                  onClick={() => alert("Paiement par carte Visa initié")}
                  className="w-full bg-gray-800 hover:bg-gray-900 text-white py-3 rounded-lg font-medium transition"
                >
                  💳 Payer avec Visa
                </button>
                <button
                  onClick={() => alert("Paiement Orange Money initié")}
                  className="w-full bg-orange-500 hover:bg-orange-600 text-white py-3 rounded-lg font-medium transition"
                >
                  📱 Payer avec Orange Money
                </button>
                <button
                  onClick={() => alert("Paiement MTN Mobile Money initié")}
                  className="w-full bg-green-700 hover:bg-green-800 text-white py-3 rounded-lg font-medium transition"
                >
                  📱 Payer avec MTN Mobile Money
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}