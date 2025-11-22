"use client";

import { useState, useEffect } from 'react';
import { doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { logger } from '@/utils/logger';
import { FiMapPin, FiTruck, FiX } from 'react-icons/fi';
import { Booking } from '@/types/booking';

interface DriverFoundViewProps {
  bookingId: string;
  onComplete: () => void;
}

export function DriverFoundView({ bookingId, onComplete }: DriverFoundViewProps) {
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const handleCancelBooking = async () => {
    setCancelling(true);
    try {
      const bookingRef = doc(db, 'bookings', bookingId);
      
      console.log('[CLIENT] Annulation de la commande:', bookingId);
      
      // Annuler la commande
      await updateDoc(bookingRef, {
        status: 'cancelled',
        cancelledAt: serverTimestamp(),
        cancelledBy: 'client',
        updatedAt: serverTimestamp(),
      });
      
      console.log('[CLIENT] ✓ Commande annulée avec succès');
      logger.info('Commande annulée par le client', { bookingId });
      
      // Fermer le modal
      setShowCancelModal(false);
      
      // Afficher un message de confirmation
      alert('✅ Commande annulée avec succès. Le chauffeur a été notifié.');
      
      // Rediriger vers le dashboard après 1 seconde
      setTimeout(() => {
        window.location.href = '/dashboard';
      }, 1000);
    } catch (error) {
      console.error('[CLIENT] ❌ Erreur lors de l\'annulation:', error);
      logger.error('Erreur lors de l\'annulation', { error, bookingId });
      alert('❌ Erreur lors de l\'annulation. Veuillez réessayer.');
    } finally {
      setCancelling(false);
    }
  };

  useEffect(() => {
    const bookingRef = doc(db, 'bookings', bookingId);
    const unsubscribe = onSnapshot(
      bookingRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          setBooking({
            id: snapshot.id,
            ...data,
          } as Booking);
          setLoading(false);
          
          // Si la course est terminée, appeler onComplete
          if (data.status === 'completed') {
            onComplete();
          }
        }
      },
      (error) => {
        logger.error('Erreur lors du chargement du booking', { error, bookingId });
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [bookingId, onComplete]);

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-8 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#f29200] mx-auto mb-4"></div>
        <p className="text-gray-600">Chargement des informations...</p>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="bg-white rounded-lg shadow-md p-8 text-center">
        <p className="text-red-600">Erreur lors du chargement des informations</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6 sm:p-8">
      <div className="text-center mb-6">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-4xl">✓</span>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Chauffeur trouvé !</h2>
        <p className="text-gray-600">Votre chauffeur est en route</p>
      </div>

      {booking.driverName && (
        <div className="bg-gradient-to-r from-[#f29200] to-[#ffaa33] rounded-lg p-4 sm:p-6 mb-4 text-white">
          <div className="flex items-center space-x-3 mb-3">
            <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center">
              <FiTruck className="h-6 w-6 text-[#f29200]" />
            </div>
            <div>
              <p className="font-semibold text-lg">{booking.driverName}</p>
              {/* Numéro de téléphone caché pour la sécurité du chauffeur */}
              <p className="text-sm text-white/80 mt-1">Chauffeur professionnel</p>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3 mb-4">
        <div className="flex items-start">
          <FiMapPin className="h-5 w-5 text-green-500 mr-3 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-xs text-gray-500 mb-1">Point de départ</p>
            <p className="text-sm font-medium text-gray-900">{booking.pickup}</p>
          </div>
        </div>
        <div className="flex items-start">
          <FiMapPin className="h-5 w-5 text-red-500 mr-3 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-xs text-gray-500 mb-1">Destination</p>
            <p className="text-sm font-medium text-gray-900">{booking.destination}</p>
          </div>
        </div>
      </div>

      {booking.carModel && (
        <div className="bg-gray-50 rounded-lg p-4 mb-4">
          <p className="text-sm text-gray-600 mb-2">Véhicule</p>
          <p className="font-semibold text-gray-900">
            {booking.carModel}
            {booking.carPlate && ` • ${booking.carPlate}`}
            {booking.carColor && ` • ${booking.carColor}`}
          </p>
        </div>
      )}

      <div className="bg-blue-50 rounded-lg p-4 mb-4">
        <p className="text-sm text-gray-600 mb-1">Prix estimé</p>
        <p className="text-2xl font-bold text-[#f29200]">
          {booking.price?.toLocaleString('fr-FR')} FCFA
        </p>
      </div>

      {/* Bouton Annuler la commande */}
      <button
        onClick={() => setShowCancelModal(true)}
        className="w-full mt-4 bg-red-500 hover:bg-red-600 text-white font-medium py-3 px-4 rounded-lg transition-all flex items-center justify-center space-x-2"
      >
        <FiX className="h-5 w-5" />
        <span>Annuler la commande</span>
      </button>

      {/* Modal de confirmation d'annulation */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 transform transition-all">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <FiX className="h-8 w-8 text-red-500" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">
                Annuler cette commande ?
              </h3>
              <p className="text-gray-600 text-sm">
                Êtes-vous sûr de vouloir annuler cette commande ? Le chauffeur sera immédiatement notifié et ne viendra plus vous chercher.
              </p>
            </div>

            <div className="space-y-3">
              <button
                onClick={handleCancelBooking}
                disabled={cancelling}
                className="w-full bg-red-500 hover:bg-red-600 disabled:bg-red-300 text-white font-bold py-3 px-4 rounded-lg transition-all"
              >
                {cancelling ? 'Annulation en cours...' : 'Oui, annuler la commande'}
              </button>
              <button
                onClick={() => setShowCancelModal(false)}
                disabled={cancelling}
                className="w-full bg-gray-200 hover:bg-gray-300 disabled:bg-gray-100 text-gray-700 font-medium py-3 px-4 rounded-lg transition-all"
              >
                Non, garder la commande
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

