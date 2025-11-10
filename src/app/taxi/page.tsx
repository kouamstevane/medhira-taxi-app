/**
 * Page Taxi - Nouvelle version avec NewRideForm
 * 
 * Page principale pour demander une course de taxi
 * Utilise le composant NewRideForm pour une meilleure séparation des responsabilités
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { NewRideForm } from './components/NewRideForm';
import { logger } from '@/utils/logger';

type Step = 'form' | 'searching' | 'driver_found' | 'completed';

export default function TaxiPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('form');
  const [bookingId, setBookingId] = useState<string | null>(null);

  const handleBookingCreated = (id: string) => {
    logger.info('Course créée, recherche de chauffeur', { bookingId: id });
    setBookingId(id);
    setStep('searching');
    
    // Ici, vous pouvez ajouter la logique de recherche de chauffeur
    // Par exemple, écouter les changements dans Firestore pour voir si un chauffeur accepte
  };

  const handleSearchDriver = () => {
    // Cette fonction est appelée après la création de la course
    // Vous pouvez implémenter la logique de recherche de chauffeur ici
    logger.info('Recherche de chauffeur démarrée', { bookingId });
  };

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
            <p className="text-sm text-gray-500">Temps max: 60 secondes</p>
          </div>
        )}

        {step === 'driver_found' && (
          <div className="bg-white rounded-lg shadow-md p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Chauffeur trouvé !</h2>
            <p className="text-gray-600">Votre chauffeur est en route</p>
          </div>
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

