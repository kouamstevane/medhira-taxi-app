/**
 * Page Taxi - Nouvelle version avec NewRideForm
 *
 * Page principale pour demander une course de taxi
 * Utilise le composant NewRideForm pour une meilleure séparation des responsabilités
 */

'use client';

import dynamic from 'next/dynamic';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';
import { NewRideForm } from './components/NewRideForm';
const DriverFoundView = dynamic(() => import('./components/DriverFoundView'), { ssr: false, loading: () => <div className="w-full h-64 bg-gray-100 animate-pulse rounded-xl" /> })
import { SearchingDriverBottomSheet } from './components/SearchingDriverBottomSheet';
import { logger } from '@/utils/logger';
import { doc, onSnapshot, getDoc, updateDoc, serverTimestamp, collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { startAutomaticSearch, stopAutomaticSearch } from '@/services/matching/automaticSearch';
import { BonusSelector } from './components/BonusSelector';
import { useAuth } from '@/hooks/useAuth';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { BottomNav } from '@/components/ui/BottomNav';

type Step = 'form' | 'searching' | 'driver_found' | 'completed' | 'failed';

export default function TaxiPage() {
  const router = useRouter();
  const { currentUser } = useAuth();
  
  //  Fonction pour déclencher le haptic feedback (medJira.md #93)
  const triggerHaptic = async (style: ImpactStyle = ImpactStyle.Medium) => {
    if (Capacitor.isNativePlatform()) {
      try {
        await Haptics.impact({ style });
      } catch (error) {
        console.warn('Haptic feedback non disponible:', error);
      }
    }
  };
  const [step, setStep] = useState<Step>('form');
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number>(60);
  const [pickupAddress, setPickupAddress] = useState<string>('');
  const [destinationAddress, setDestinationAddress] = useState<string>('');

  // État pour le bonus en cas d'échec
  const [retryBonus, setRetryBonus] = useState(0);
  const [isAutoSearching, setIsAutoSearching] = useState(false);
  // Stocké dans un ref pour ne pas déclencher de re-render ni invalider les useEffect
  const stopAutoSearchRef = useRef<(() => void) | null>(null);

  // Récupérer la course active au chargement
  useEffect(() => {
    const fetchActiveBooking = async () => {
      if (!currentUser) return;

      try {
        const bookingsRef = collection(db, 'bookings');
        // On cherche les courses qui ne sont ni terminées, ni annulées, ni échouées
        // Note: On retire orderBy pour éviter d'avoir à créer un index composite complexe
        const q = query(
          bookingsRef,
          where('userId', '==', currentUser.uid),
          where('status', 'in', ['pending', 'accepted', 'driver_arrived', 'in_progress']),
          limit(5)
        );

        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          // On trie côté client pour prendre la plus récente
          const docs = snapshot.docs.sort((a, b) => {
            const dateA = a.data().createdAt?.toMillis() || 0;
            const dateB = b.data().createdAt?.toMillis() || 0;
            return dateB - dateA;
          });

          const bookingData = docs[0].data();
          const id = docs[0].id;
          
          logger.info('Course active trouvée', { id, status: bookingData.status });
          
          setBookingId(id);
          setPickupAddress(bookingData.pickup);
          setDestinationAddress(bookingData.destination);

          if (bookingData.status === 'pending') {
            setStep('searching');
            // Relancer le timer si besoin, ou juste laisser l'UI de recherche
            // Idéalement on devrait calculer le temps restant
          } else {
            setStep('driver_found');
          }
        }
      } catch (error) {
        logger.error('Erreur récupération course active', error);
      }
    };

    fetchActiveBooking();
  }, [currentUser]);

  const handleBookingCreated = (id: string, pickup: string, destination: string, autoSearch: boolean = false) => {
    logger.info('Course créée, recherche de chauffeur', { bookingId: id, autoSearch });
    setBookingId(id);
    setPickupAddress(pickup);
    setDestinationAddress(destination);
    setStep('searching');
    setTimeRemaining(60);
    setRetryBonus(0); // Reset bonus

    if (autoSearch) {
      setIsAutoSearching(true);
      const stopFn = startAutomaticSearch(id, { intervalSeconds: 60, maxAttempts: 10 });
      stopAutoSearchRef.current = stopFn;
    }
  };

  const handleSearchDriver = async () => {
    await triggerHaptic(ImpactStyle.Light); //  Haptic feedback (medJira.md #93)
    logger.info('Recherche de chauffeur démarrée', { bookingId });
  };

  const handleCancelSearch = async () => {
    if (!bookingId) return;

    logger.info('Annulation de la recherche', { bookingId });

    // Arrêter la recherche auto si active
    if (stopAutoSearchRef.current) {
      stopAutoSearchRef.current();
      stopAutoSearchRef.current = null;
    }
    setIsAutoSearching(false);

    // Arrêter aussi via Firestore pour être sûr
    await stopAutomaticSearch(bookingId);

    try {
      // Mettre à jour le statut du booking à "cancelled"
      const bookingRef = doc(db, 'bookings', bookingId);
      await updateDoc(bookingRef, {
        status: 'cancelled',
        cancellationReason: 'Annulé par le client',
        updatedAt: serverTimestamp(),
      });

      logger.info('Recherche annulée avec succès', { bookingId });

      // Retourner au formulaire
      setStep('form');
      setBookingId(null);
      setPickupAddress('');
      setDestinationAddress('');
      setTimeRemaining(60);
    } catch (error) {
      logger.error('Erreur lors de l\'annulation', { error, bookingId });
      // Retourner quand même au formulaire
      setStep('form');
      setBookingId(null);
      setPickupAddress('');
      setDestinationAddress('');
      setTimeRemaining(60);
    }
  };

  // Écouter les changements du booking pour détecter l'acceptation d'un chauffeur
  useEffect(() => {
    if (!bookingId || step !== 'searching') return;

    logger.info('Écoute des changements du booking', { bookingId });

    // Vérifier immédiatement le statut du booking
    const bookingRef = doc(db, 'bookings', bookingId);
    getDoc(bookingRef).then((snapshot) => {
      if (snapshot.exists()) {
        const bookingData = snapshot.data();
        logger.info('Statut initial du booking', {
          bookingId,
          status: bookingData.status,
          driverId: bookingData.driverId,
        });

        // Si déjà accepté ou failed, mettre à jour immédiatement
        if (bookingData.status === 'accepted' && bookingData.driverId) {
          setStep('driver_found');
          return;
        } else if (bookingData.status === 'failed') {
          setStep('failed');
          return;
        }
      }
    }).catch((error) => {
      logger.error('Erreur lors de la vérification initiale', { error, bookingId });
    });
    const unsubscribe = onSnapshot(
      bookingRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          logger.warn('Booking non trouvé', { bookingId });
          return;
        }

        const bookingData = snapshot.data();
        logger.info('Changement détecté dans le booking', {
          bookingId,
          status: bookingData.status,
          driverId: bookingData.driverId,
        });

        // Si un chauffeur a accepté
        if (bookingData.status === 'accepted' && bookingData.driverId) {
          logger.info('Chauffeur trouvé !', {
            bookingId,
            driverId: bookingData.driverId,
            driverName: bookingData.driverName,
          });
          setStep('driver_found');
          return;
        }

        // Si la course a échoué
        if (bookingData.status === 'failed') {
          logger.warn('Aucun chauffeur disponible', { bookingId });
          setStep('failed');
          return;
        }
      },
      (error) => {
        logger.error('Erreur lors de l\'écoute du booking', { error, bookingId });
      }
    );

    // Timer de 60 secondes
    const timerInterval = setInterval(() => {
      setTimeRemaining((prev) => {
        const newTime = prev - 1;
        if (newTime <= 0) {
          clearInterval(timerInterval);
          // Si toujours en attente après 60s, marquer comme failed
          logger.warn('Timeout de 60 secondes atteint', { bookingId });

          // Vérifier une dernière fois le statut avant de marquer comme failed
          const bookingRef = doc(db, 'bookings', bookingId);
          getDoc(bookingRef).then((snapshot) => {
            if (snapshot.exists()) {
              const bookingData = snapshot.data();
              if (bookingData.status === 'pending') {
                // Marquer comme failed si toujours pending
                updateDoc(bookingRef, {
                  status: 'failed',
                  failureReason: 'Aucun chauffeur disponible après 60 secondes',
                  updatedAt: serverTimestamp(),
                }).then(() => {
                  logger.info('Booking marqué comme failed après timeout', { bookingId });
                  setStep('failed');
                }).catch((error) => {
                  logger.error('Erreur lors du marquage failed', { error, bookingId });
                  setStep('failed');
                });
              } else {
                // Déjà mis à jour, passer à l'état approprié
                if (bookingData.status === 'failed') {
                  setStep('failed');
                } else if (bookingData.status === 'accepted' && bookingData.driverId) {
                  setStep('driver_found');
                }
              }
            } else {
              // Booking n'existe plus, revenir au formulaire
              setStep('failed');
            }
          }).catch((error) => {
            logger.error('Erreur vérification finale timeout', { error, bookingId });
            setStep('failed');
          }); return 0;
        }
        return newTime;
      });
    }, 1000);

    return () => {
      unsubscribe();
      clearInterval(timerInterval);
      if (stopAutoSearchRef.current) {
        stopAutoSearchRef.current();
      }
    };
  }, [bookingId, step]);

  return (
    <div className="min-h-screen bg-background font-sans text-slate-100 antialiased">
      <div className="relative flex min-h-screen w-full flex-col max-w-[430px] mx-auto overflow-hidden">
        {/* Header */}
        <header className="sticky top-0 z-20 flex items-center p-4 bg-background/80 backdrop-blur-xl border-b border-white/5">
          <button
            onClick={() => router.back()}
            className="flex items-center justify-center size-10 rounded-full glass-card text-white active:scale-95 transition-transform"
          >
            <MaterialIcon name="arrow_back" size="md" />
          </button>
          <h1 className="flex-1 text-center text-lg font-bold text-white pr-10">Réserver un taxi</h1>
        </header>

        {/* Content */}
        <main className="flex-1 px-4 py-6">
          {step === 'form' && (
            <div className="space-y-6">
              <NewRideForm
                onBookingCreated={handleBookingCreated}
                onSearchDriver={handleSearchDriver}
              />
            </div>
          )}

          {step === 'searching' && bookingId && (
            <SearchingDriverBottomSheet
              bookingId={bookingId}
              pickupAddress={pickupAddress}
              destinationAddress={destinationAddress}
              timeRemaining={timeRemaining}
              onCancel={handleCancelSearch}
              isAutoSearching={isAutoSearching}
            />
          )}

          {step === 'failed' && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center sm:justify-center">
              <div className="glass-card w-full sm:max-w-md sm:mx-4 rounded-t-3xl sm:rounded-2xl shadow-2xl p-6 sm:p-8 text-center border border-white/10">
                {/* Icône d'erreur */}
                <div className="mb-5">
                  <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto border border-destructive/20">
                    <MaterialIcon name="error" className="text-destructive text-[32px]" />
                  </div>
                </div>

                <h2 className="text-xl font-bold text-white mb-2">
                  Aucun chauffeur disponible
                </h2>
                <p className="text-sm text-slate-400 mb-6">
                  Désolé, aucun chauffeur n&apos;est disponible dans votre zone pour le moment.
                </p>

                {/* Sélecteur de Bonus pour le retry */}
                <div className="mb-6 text-left glass-card p-4 rounded-xl border border-white/5">
                  <BonusSelector
                    selectedBonus={retryBonus}
                    onSelect={setRetryBonus}
                  />
                </div>

                {/* Bouton réessayer */}
                <button
                  onClick={async () => {
                    if (!bookingId) return;

                    await triggerHaptic(ImpactStyle.Medium);
                    console.log('[RETRY] Début du réessai pour bookingId:', bookingId);

                    try {
                      const bookingRef = doc(db, 'bookings', bookingId);
                      const bookingSnap = await getDoc(bookingRef);

                      if (!bookingSnap.exists()) {
                        console.error('[RETRY] Booking introuvable');
                        return;
                      }

                      const data = bookingSnap.data();

                      await updateDoc(bookingRef, {
                        status: 'pending',
                        driverId: null,
                        driverName: null,
                        driverPhone: null,
                        failureReason: null,
                        updatedAt: serverTimestamp(),
                        ...(retryBonus > 0 && { bonus: retryBonus }),
                      });

                      setTimeRemaining(60);
                      setStep('searching');

                      setTimeout(async () => {
                        try {
                          const { findDriverWithRetry } = await import('@/services/matching');
                          await findDriverWithRetry(
                            bookingId,
                            data.pickupLocation,
                            data.destination,
                            data.price,
                            data.carType,
                            retryBonus || data.bonus || 0
                          );
                        } catch (error) {
                          console.error('[RETRY] Erreur findDriverWithRetry:', error);
                        }
                      }, 500);
                    } catch (error) {
                      console.error('[RETRY] Erreur lors du redémarrage:', error);
                      setStep('failed');
                    }
                  }}
                  className="w-full h-14 bg-gradient-to-r from-primary to-[#ffae33] text-white font-bold rounded-2xl primary-glow active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
                >
                  <MaterialIcon name="refresh" size="md" />
                  Réessayer
                </button>

                {/* Bouton retour */}
                <button
                  onClick={async () => {
                    await triggerHaptic(ImpactStyle.Light);
                    setStep('form');
                    setBookingId(null);
                    router.push('/dashboard');
                  }}
                  className="w-full mt-3 h-14 glass-card text-slate-300 font-semibold rounded-2xl border border-white/10 active:scale-[0.98] transition-transform flex items-center justify-center"
                >
                  Retour à l&apos;accueil
                </button>

                <p className="text-xs text-slate-500 mt-4">
                  Conseil : Essayez à une heure différente pour plus de disponibilité
                </p>
              </div>
            </div>
          )}

          {step === 'driver_found' && bookingId && (
            <DriverFoundView bookingId={bookingId} onComplete={() => setStep('completed')} />
          )}

          {step === 'completed' && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center sm:justify-center">
              <div className="glass-card w-full sm:max-w-md sm:mx-4 rounded-t-3xl sm:rounded-2xl shadow-2xl p-6 sm:p-8 text-center border border-white/10">
                <div className="mb-5">
                  <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto border border-green-500/20">
                    <MaterialIcon name="check_circle" className="text-green-500 text-[32px]" />
                  </div>
                </div>

                <h2 className="text-xl font-bold text-white mb-2">Course terminée !</h2>
                <p className="text-sm text-slate-400 mb-6">
                  Merci d&apos;avoir utilisé Medhira Taxi
                </p>
                <button
                  onClick={async () => {
                    await triggerHaptic(ImpactStyle.Medium);
                    setStep('form');
                    setBookingId(null);
                    setPickupAddress('');
                    setDestinationAddress('');
                  }}
                  className="w-full h-14 bg-gradient-to-r from-primary to-[#ffae33] text-white font-bold rounded-2xl primary-glow active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
                >
                  <MaterialIcon name="add" size="md" />
                  Nouvelle course
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
      <BottomNav />
    </div>
  );
}

