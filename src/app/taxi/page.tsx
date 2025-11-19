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
import { logger } from '@/utils/logger';
import { doc, onSnapshot, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/config/firebase';

type Step = 'form' | 'searching' | 'driver_found' | 'completed' | 'failed';

export default function TaxiPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('form');
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number>(60);

  const handleBookingCreated = (id: string) => {
    logger.info('Course créée, recherche de chauffeur', { bookingId: id });
    setBookingId(id);
    setStep('searching');
    setTimeRemaining(60);
  };

  const handleSearchDriver = () => {
    logger.info('Recherche de chauffeur démarrée', { bookingId });
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
            }
          }
          });
          
          return 0;
        }
        return newTime;
      });
    }, 1000);

    return () => {
      unsubscribe();
      clearInterval(timerInterval);
    };
  }, [bookingId, step]);

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

        {step === 'searching' && (
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-[#f29200] mx-auto mb-4"></div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Recherche d'un chauffeur</h2>
                <p className="text-gray-600 mb-4">Nous recherchons le meilleur chauffeur pour vous</p>
            <p className="text-sm text-gray-500 mb-2">Temps restant: {timeRemaining} secondes</p>
            <div className="w-full bg-gray-200 rounded-full h-2 mt-4">
              <div
                className="bg-[#f29200] h-2 rounded-full transition-all duration-1000"
                style={{ width: `${((60 - timeRemaining) / 60) * 100}%` }}
              ></div>
              </div>
            </div>
          )}

        {step === 'failed' && (
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <div className="text-red-500 text-4xl mb-4">⚠️</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Aucun chauffeur disponible</h2>
            <p className="text-gray-600 mb-6">
              Désolé, aucun chauffeur n'est disponible dans votre zone pour le moment.
            </p>
                <button
              onClick={() => {
                setStep('form');
                setBookingId(null);
                setTimeRemaining(60);
              }}
              className="bg-[#f29200] hover:bg-[#e68600] text-white font-bold py-3 px-6 rounded-lg transition"
            >
              Réessayer
                </button>
          </div>
        )}

        {step === 'driver_found' && bookingId && (
          <DriverFoundView bookingId={bookingId} onComplete={() => setStep('completed')} />
        )}

        {step === 'completed' && (
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <div className="text-green-500 text-4xl mb-2">✓</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Course terminée</h2>
            <p className="text-gray-600 mb-4">Merci d'avoir utilisé Medjira Taxi</p>
                <button
              onClick={() => {
                setStep('form');
                setBookingId(null);
              }}
              className="bg-[#f29200] hover:bg-[#e68600] text-white font-bold py-3 px-6 rounded-lg transition"
            >
              Nouvelle course
                </button>
            </div>
          )}
      </main>
    </div>
  );
}

