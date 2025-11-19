"use client";

import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { logger } from '@/utils/logger';
import { FiMapPin, FiPhone, FiTruck } from 'react-icons/fi';

interface DriverFoundViewProps {
  bookingId: string;
  onComplete: () => void;
}

export function DriverFoundView({ bookingId, onComplete }: DriverFoundViewProps) {
  const [booking, setBooking] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const bookingRef = doc(db, 'bookings', bookingId);
    const unsubscribe = onSnapshot(
      bookingRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setBooking(snapshot.data());
          setLoading(false);
          
          // Si la course est terminée, appeler onComplete
          if (snapshot.data().status === 'completed') {
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
              {booking.driverPhone && (
                <p className="text-sm flex items-center mt-1">
                  <FiPhone className="h-4 w-4 mr-1" />
                  {booking.driverPhone}
                </p>
              )}
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

      <div className="bg-blue-50 rounded-lg p-4">
        <p className="text-sm text-gray-600 mb-1">Prix estimé</p>
        <p className="text-2xl font-bold text-[#f29200]">
          {booking.price?.toLocaleString('fr-FR')} FCFA
        </p>
      </div>
    </div>
  );
}

