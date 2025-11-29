/**
 * Page Taxi - Nouvelle version avec NewRideForm
 * 
 * Page principale pour demander une course de taxi
 * Utilise le composant NewRideForm pour une meilleure séparation des responsabilités
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { NewRideForm } from './components/NewRideForm';
import { DriverFoundView } from './components/DriverFoundView';
import { SearchingDriverBottomSheet } from './components/SearchingDriverBottomSheet';
import { logger } from '@/utils/logger';
import { doc, onSnapshot, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { startAutomaticSearch, stopAutomaticSearch } from '@/services/matching/automaticSearch';
import { BonusSelector } from './components/BonusSelector';

type Step = 'form' | 'searching' | 'driver_found' | 'completed' | 'failed';

export default function TaxiPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('form');
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number>(60);
  const [pickupAddress, setPickupAddress] = useState<string>('');
  const [destinationAddress, setDestinationAddress] = useState<string>('');

  // État pour le bonus en cas d'échec
  const [retryBonus, setRetryBonus] = useState(0);
  const [isAutoSearching, setIsAutoSearching] = useState(false);
  const [stopAutoSearch, setStopAutoSearch] = useState<(() => void) | null>(null);

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
      setStopAutoSearch(() => stopFn);
    }
  };

  const handleSearchDriver = () => {
    logger.info('Recherche de chauffeur démarrée', { bookingId });
  };

  const handleCancelSearch = async () => {
    if (!bookingId) return;

    logger.info('Annulation de la recherche', { bookingId });

    // Arrêter la recherche auto si active
    if (stopAutoSearch) {
      stopAutoSearch();
      setStopAutoSearch(null);
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
      if (stopAutoSearch) {
        stopAutoSearch();
      }
    };
  }, [bookingId, step, stopAutoSearch]);

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-[#101010] text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <h1 className="text-lg sm:text-2xl font-bold truncate">Commander un taxi</h1>
              <p className="text-gray-300 text-xs sm:text-sm mt-1 hidden sm:block">Réservez votre course en quelques clics</p>
            </div>
            <button
              onClick={() => router.back()}
              className="px-3 sm:px-4 py-2 bg-gray-700 active:bg-gray-600 hover:bg-gray-600 rounded-lg transition touch-manipulation flex-shrink-0"
              style={{ minHeight: '44px', minWidth: '44px' }}
            >
              <span className="hidden sm:inline">Retour</span>
              <span className="sm:hidden">←</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-8 py-4 sm:py-8">
        {step === 'form' && (
          <div className="bg-white rounded-lg shadow-md p-4 sm:p-6 md:p-8">
            <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-4 sm:mb-6">Nouvelle course</h2>

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
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center sm:justify-center">
            <div className="bg-white w-full sm:max-w-md sm:mx-4 rounded-t-3xl sm:rounded-2xl shadow-2xl p-6 sm:p-8 text-center transform transition-all duration-300 animate-slideUp">
              {/* Icône d'erreur animée */}
              <div className="mb-4">
                <div className="w-16 h-16 sm:w-20 sm:h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto animate-bounce">
                  <svg className="w-8 h-8 sm:w-10 sm:h-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
              </div>

              {/* Titre et message */}
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
                Aucun chauffeur disponible
              </h2>
              <p className="text-sm sm:text-base text-gray-600 mb-6">
                Désolé, aucun chauffeur n&apos;est disponible dans votre zone pour le moment.
                Veuillez réessayer dans quelques instants.
              </p>

              {/* Sélecteur de Bonus pour le retry */}
              <div className="mb-6 text-left bg-gray-50 p-4 rounded-xl border border-gray-100">
                <BonusSelector
                  selectedBonus={retryBonus}
                  onSelect={setRetryBonus}
                />
              </div>

              {/* Bouton réessayer */}
              <button
                onClick={async () => {
                  if (!bookingId) return;

                  console.log('[RETRY] Début du réessai pour bookingId:', bookingId);

                  try {
                    // Récupérer les infos du booking
                    const bookingRef = doc(db, 'bookings', bookingId);
                    const bookingSnap = await getDoc(bookingRef);

                    if (!bookingSnap.exists()) {
                      console.error('[RETRY] Booking introuvable');
                      return;
                    }

                    const data = bookingSnap.data();
                    console.log('[RETRY] Données du booking récupérées:', data);

                    // Réinitialiser complètement le booking
                    await updateDoc(bookingRef, {
                      status: 'pending',
                      driverId: null,
                      driverName: null,
                      driverPhone: null,
                      failureReason: null,
                      updatedAt: serverTimestamp(),
                      // Ajouter le bonus si sélectionné (conditionnel pour éviter undefined)
                      ...(retryBonus > 0 && { bonus: retryBonus }),
                    });

                    console.log('[RETRY] Booking réinitialisé à pending');

                    // Réinitialiser le timer AVANT de passer en searching
                    setTimeRemaining(60);
                    
                    // Passer en mode recherche
                    setStep('searching');

                    // Lancer la recherche après un délai
                    setTimeout(async () => {
                      try {
                        console.log('[RETRY] Lancement de findDriverWithRetry');
                        const { findDriverWithRetry } = await import('@/services/matching');

                        await findDriverWithRetry(
                          bookingId,
                          data.pickupLocation,
                          data.destination,
                          data.price,
                          data.carType,
                          retryBonus || data.bonus || 0 // Passer le bonus
                        );

                        console.log('[RETRY] findDriverWithRetry terminé');
                      } catch (error) {
                        console.error('[RETRY] Erreur findDriverWithRetry:', error);
                      }
                    }, 500);
                  } catch (error) {
                    console.error('[RETRY] Erreur lors du redémarrage:', error);
                    setStep('failed');
                  }
                }}
                className="w-full bg-gradient-to-r from-[#f29200] to-[#e68600] hover:from-[#e68600] hover:to-[#d67a00] active:from-[#d67a00] active:to-[#c56900] text-white font-bold py-4 px-6 rounded-xl transition-all shadow-lg hover:shadow-xl touch-manipulation"
                style={{ minHeight: '56px' }}
              >
                Réessayer
              </button>

              {/* Bouton retour à l'accueil */}
              <button
                onClick={() => {
                  setStep('form');
                  setBookingId(null);
                  router.push('/dashboard');
                }}
                className="w-full mt-3 bg-white hover:bg-gray-50 text-gray-700 font-medium py-3 px-6 rounded-xl border-2 border-gray-300 transition-all touch-manipulation"
                style={{ minHeight: '56px' }}
              >
                Retour à l&apos;accueil
              </button>

              {/* Info supplémentaire */}
              <p className="text-xs text-gray-500 mt-4">
                💡 Conseil : Essayez à une heure différente pour plus de disponibilité
              </p>
            </div>
          </div>
        )}

        {step === 'driver_found' && bookingId && (
          <DriverFoundView bookingId={bookingId} onComplete={() => setStep('completed')} />
        )}

        {step === 'completed' && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center sm:justify-center">
            <div className="bg-white w-full sm:max-w-md sm:mx-4 rounded-t-3xl sm:rounded-2xl shadow-2xl p-6 sm:p-8 text-center transform transition-all duration-300 animate-slideUp">
              {/* Icône de succès */}
              <div className="mb-4">
                <div className="w-16 h-16 sm:w-20 sm:h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                  <svg className="w-10 h-10 sm:w-12 sm:h-12 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>

              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">Course terminée !</h2>
              <p className="text-sm sm:text-base text-gray-600 mb-6">
                Merci d&apos;avoir utilisé Medjira Taxi
              </p>
              <button
                onClick={() => {
                  setStep('form');
                  setBookingId(null);
                  setPickupAddress('');
                  setDestinationAddress('');
                }}
                className="w-full bg-gradient-to-r from-[#f29200] to-[#e68600] hover:from-[#e68600] hover:to-[#d67a00] text-white font-bold py-4 px-6 rounded-xl transition-all shadow-lg hover:shadow-xl touch-manipulation"
                style={{ minHeight: '56px' }}
              >
                Nouvelle course
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

