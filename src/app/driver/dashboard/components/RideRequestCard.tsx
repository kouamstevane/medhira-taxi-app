"use client";

import { useState, useEffect } from 'react';
import { FiClock, FiMapPin, FiArrowRight, FiCheckCircle, FiX } from 'react-icons/fi';
import { RideCandidate } from '@/services/matching/broadcast';

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
    <div className={`border-2 rounded-lg p-3 sm:p-4 ${
      isUrgent ? 'border-red-500 bg-red-50' : 'border-[#f29200] bg-orange-50'
    }`}>
      <div className="flex items-start justify-between mb-2 sm:mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-2 mb-1 sm:mb-2">
            <FiClock className={`h-4 w-4 ${isUrgent ? 'text-red-600' : 'text-[#f29200]'}`} />
            <span className={`text-xs sm:text-sm font-semibold ${isUrgent ? 'text-red-600' : 'text-[#f29200]'}`}>
              {timeRemaining !== null ? formatTime(timeRemaining) : 'Nouvelle demande'}
            </span>
          </div>
          {request.bookingData && (
            <>
              <div className="flex items-start mt-1 sm:mt-2">
                <FiMapPin className="h-3 w-3 sm:h-4 sm:w-4 text-green-500 mr-1 sm:mr-2 flex-shrink-0 mt-0.5" />
                <p className="text-xs sm:text-sm text-gray-700 break-words">{request.bookingData.pickup}</p>
              </div>
              <div className="flex items-start mt-1 sm:mt-2">
                <FiArrowRight className="h-3 w-3 sm:h-4 sm:w-4 text-gray-400 mr-1 sm:mr-2 flex-shrink-0 mt-0.5" />
                <p className="text-xs sm:text-sm text-gray-700 break-words">{request.bookingData.destination}</p>
              </div>
              {request.candidate.distance && (
                <p className="text-xs text-gray-500 mt-1 sm:mt-2">
                  Distance: {request.candidate.distance.toFixed(1)} km
                </p>
              )}
            </>
          )}
        </div>
        {request.bookingData && (
          <span className="bg-[#f29200] text-white px-2 sm:px-3 py-1 rounded text-xs sm:text-sm font-bold ml-2 flex-shrink-0">
            {request.bookingData.price.toLocaleString('fr-FR')} FCFA
          </span>
        )}
      </div>
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mt-3 sm:mt-4">
        <button
          onClick={onAccept}
          className="flex-1 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white py-2 sm:py-2.5 rounded-lg transition flex items-center justify-center space-x-2 touch-manipulation font-semibold"
          style={{ minHeight: '44px' }}
        >
          <FiCheckCircle className="h-4 w-4 sm:h-5 sm:w-5" />
          <span className="text-sm sm:text-base">Accepter</span>
        </button>
        <button
          onClick={onDecline}
          className="flex-1 bg-gray-500 hover:bg-gray-600 active:bg-gray-700 text-white py-2 sm:py-2.5 rounded-lg transition flex items-center justify-center space-x-2 touch-manipulation font-semibold"
          style={{ minHeight: '44px' }}
        >
          <FiX className="h-4 w-4 sm:h-5 sm:w-5" />
          <span className="text-sm sm:text-base">Refuser</span>
        </button>
      </div>
    </div>
  );
}

