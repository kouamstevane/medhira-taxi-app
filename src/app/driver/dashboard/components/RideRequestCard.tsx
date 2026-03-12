"use client";

import { useState, useEffect } from 'react';
import { FiClock, FiMapPin, FiArrowRight, FiCheckCircle, FiX, FiNavigation } from 'react-icons/fi';
import { RideCandidate } from '@/types';
import { CURRENCY_CODE } from '@/utils/constants';

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

interface RideRequestCardProps {
  request: RideRequest;
  onAccept: () => void;
  onDecline: () => void;
}

export function RideRequestCard({ request, onAccept, onDecline }: RideRequestCardProps) {
  const [showMap, setShowMap] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!request.candidate.expiresAt) {
      setTimeRemaining(null);
      return;
    }

    const expiresAt = request.candidate.expiresAt.toDate();
    const updateTimer = () => {
      const now = new Date();
      const remaining = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
      setTimeRemaining(remaining);

      if (remaining <= 0) {
        return;
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [request.candidate.expiresAt]);

  const formatTime = (seconds: number): string => {
    return `${seconds}s`;
  };

  const isExpired = timeRemaining !== null && timeRemaining <= 0;
  const isUrgent = timeRemaining !== null && timeRemaining <= 10;

  if (isExpired) {
    return null;
  }

  return (
    <div className={`border-2 rounded-xl p-3 sm:p-4 transition-all ${isUrgent ? 'border-red-500 bg-red-50 shadow-lg shadow-red-200' : 'border-[#f29200] bg-orange-50 shadow-md'
      }`}>
      <div className="flex items-start justify-between mb-3 sm:mb-4">
        <div className="flex-1 min-w-0">
          {/* Timer avec animation */}
          <div className="flex items-center space-x-2 mb-2">
            <div className={`p-1.5 rounded-full ${isUrgent ? 'bg-red-100' : 'bg-orange-100'}`}>
              <FiClock className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${isUrgent ? 'text-red-600 animate-pulse' : 'text-[#f29200]'}`} />
            </div>
            <span className={`text-xs sm:text-sm font-bold ${isUrgent ? 'text-red-600 animate-pulse' : 'text-[#f29200]'}`}>
              {timeRemaining !== null ? formatTime(timeRemaining) : 'Nouvelle demande'}
            </span>
            {isUrgent && (
              <span className="text-xs font-semibold text-red-600 animate-bounce">
                URGENT !
              </span>
            )}
          </div>

          {request.bookingData && (
            <>
              {/* Départ */}
              <div className="flex items-start mt-2 bg-white/60 rounded-lg p-2">
                <div className="w-2 h-2 rounded-full bg-green-500 mt-1 mr-2 flex-shrink-0"></div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Départ</p>
                  <p className="text-xs sm:text-sm text-gray-900 break-words font-medium">{request.bookingData.pickup}</p>
                </div>
              </div>

              {/* Destination */}
              <div className="flex items-start mt-2 bg-white/60 rounded-lg p-2">
                <div className="w-2 h-2 rounded-full bg-red-500 mt-1 mr-2 flex-shrink-0"></div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Destination</p>
                  <p className="text-xs sm:text-sm text-gray-900 break-words font-medium">{request.bookingData.destination}</p>
                </div>
              </div>

              {/* Infos course */}
              <div className="flex items-center space-x-4 mt-2 text-xs text-gray-600">
                {request.candidate.distance && (
                  <div className="flex items-center space-x-1">
                    <FiNavigation className="h-3 w-3" />
                    <span className="font-semibold">{request.candidate.distance.toFixed(1)} km</span>
                  </div>
                )}
                {request.bookingData.duration && (
                  <div className="flex items-center space-x-1">
                    <FiClock className="h-3 w-3" />
                    <span className="font-semibold">~{request.bookingData.duration} min</span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        {request.bookingData && (
          <div className="ml-3 flex-shrink-0 flex flex-col items-end space-y-2">
            {/* Prix Total */}
            <div className={`px-3 py-2 rounded-lg shadow-lg text-white ${(request.candidate.bonus || 0) > 0
              ? 'bg-gradient-to-r from-green-500 to-emerald-600 ring-2 ring-green-300 ring-offset-1'
              : 'bg-gradient-to-r from-[#f29200] to-[#e68600]'
              }`}>
              <p className="text-xs font-semibold opacity-90">Gain Total</p>
              <p className="text-sm sm:text-base font-bold">
                {(request.bookingData.price + (request.candidate.bonus || 0)).toLocaleString('fr-FR')}
              </p>
              <p className="text-xs opacity-75">{CURRENCY_CODE}</p>
            </div>

            {/* Badge Bonus */}
            {(request.candidate.bonus || 0) > 0 && (
              <div className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded-md border border-yellow-200 shadow-sm animate-pulse">
                <p className="text-xs font-bold flex items-center">
                  <span className="mr-1">🎁</span>
                  +{request.candidate.bonus} Bonus
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Mini carte preview (optionnel - affichée sur toggle) */}
      {showMap && request.bookingData && (
        <div className="mb-3 rounded-lg overflow-hidden border-2 border-gray-200 bg-gray-100">
          <div className="aspect-video flex items-center justify-center bg-gradient-to-br from-blue-50 to-blue-100">
            <div className="text-center p-4">
              <FiMapPin className="h-8 w-8 text-blue-500 mx-auto mb-2" />
              <p className="text-xs text-gray-600">
                Carte disponible après acceptation
              </p>
            </div>
          </div>
        </div>
      )}
      {/* Bouton toggle carte (mobile-first) */}
      <button
        onClick={() => setShowMap(!showMap)}
        className="w-full text-xs text-[#f29200] hover:text-[#e68600] font-semibold py-2 flex items-center justify-center space-x-1 transition mb-2"
      >
        <FiMapPin className="h-3 w-3" />
        <span>{showMap ? 'Masquer la carte' : 'Voir sur la carte'}</span>
      </button>

      {/* Boutons d'action - Large et tactile */}
      {/* Boutons d'action - Large et tactile */}
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={onAccept}
          className="flex-1 bg-gradient-to-r from-green-500 to-green-600 text-white py-4 rounded-xl transition-transform active:scale-95 flex items-center justify-center space-x-2 touch-manipulation font-bold shadow-lg will-change-transform"
          style={{ minHeight: '56px' }}
        >
          <FiCheckCircle className="h-6 w-6" />
          <span className="text-lg">Accepter</span>
        </button>
        <button
          onClick={onDecline}
          className="flex-1 bg-gray-100 text-gray-700 hover:bg-gray-200 py-4 rounded-xl transition-transform active:scale-95 flex items-center justify-center space-x-2 touch-manipulation font-bold will-change-transform"
          style={{ minHeight: '56px' }}
        >
          <FiX className="h-6 w-6" />
          <span className="text-lg">Refuser</span>
        </button>
      </div>
    </div>
  );
}

