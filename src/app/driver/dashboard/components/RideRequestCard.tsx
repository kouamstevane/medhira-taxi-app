"use client";

import { useState, useEffect } from 'react';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
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
    <div className={`border-2 rounded-xl p-3 sm:p-4 transition-all ${isUrgent ? 'border-red-500 bg-red-500/10' : 'border-primary bg-primary/10'
      }`}>
      <div className="flex items-start justify-between mb-3 sm:mb-4">
        <div className="flex-1 min-w-0">
          {/* Timer avec animation */}
          <div className="flex items-center space-x-2 mb-2">
            <div className={`p-1.5 rounded-full ${isUrgent ? 'bg-red-500/20' : 'bg-primary/20'}`}>
              <MaterialIcon name="schedule" size="sm" className={`${isUrgent ? 'text-red-400 animate-pulse' : 'text-primary'}`} />
            </div>
            <span className={`text-xs sm:text-sm font-bold ${isUrgent ? 'text-red-400 animate-pulse' : 'text-primary'}`}>
              {timeRemaining !== null ? formatTime(timeRemaining) : 'Nouvelle demande'}
            </span>
            {isUrgent && (
              <span className="text-xs font-semibold text-red-400 animate-bounce">
                URGENT !
              </span>
            )}
          </div>

          {request.bookingData && (
            <>
              {/* Départ */}
              <div className="flex items-start mt-2 bg-white/5 rounded-lg p-2">
                <div className="w-2 h-2 rounded-full bg-green-500 mt-1 mr-2 flex-shrink-0"></div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Départ</p>
                  <p className="text-xs sm:text-sm text-white break-words font-medium">{request.bookingData.pickup}</p>
                </div>
              </div>

              {/* Destination */}
              <div className="flex items-start mt-2 bg-white/5 rounded-lg p-2">
                <div className="w-2 h-2 rounded-full bg-red-500 mt-1 mr-2 flex-shrink-0"></div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Destination</p>
                  <p className="text-xs sm:text-sm text-white break-words font-medium">{request.bookingData.destination}</p>
                </div>
              </div>

              {/* Infos course */}
              <div className="flex items-center space-x-4 mt-2 text-xs text-slate-400">
                {request.candidate.distance && (
                  <div className="flex items-center space-x-1">
                    <MaterialIcon name="navigation" size="sm" />
                    <span className="font-semibold">{request.candidate.distance.toFixed(1)} km</span>
                  </div>
                )}
                {request.bookingData.duration && (
                  <div className="flex items-center space-x-1">
                    <MaterialIcon name="schedule" size="sm" />
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
            <div className={`px-3 py-2 rounded-lg text-white ${(request.candidate.bonus || 0) > 0
              ? 'bg-gradient-to-r from-green-500 to-emerald-600 ring-2 ring-green-400/50 ring-offset-1 ring-offset-background'
              : 'bg-gradient-to-r from-primary to-[#ffae33]'
              }`}>
              <p className="text-xs font-semibold opacity-90">Gain Total</p>
              <p className="text-sm sm:text-base font-bold">
                {(request.bookingData.price + (request.candidate.bonus || 0)).toLocaleString('fr-FR')}
              </p>
              <p className="text-xs opacity-75">{CURRENCY_CODE}</p>
            </div>

            {/* Badge Bonus */}
            {(request.candidate.bonus || 0) > 0 && (
              <div className="bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded-md border border-yellow-500/30 animate-pulse">
                <p className="text-xs font-bold flex items-center">
                  <span className="mr-1">+{request.candidate.bonus} Bonus</span>
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Mini carte preview (optionnel - affichée sur toggle) */}
      {showMap && request.bookingData && (
        <div className="mb-3 rounded-lg overflow-hidden border-2 border-white/10 bg-white/5">
          <div className="aspect-video flex items-center justify-center bg-gradient-to-br from-blue-500/10 to-blue-500/20">
            <div className="text-center p-4">
              <MaterialIcon name="location_on" size="xl" className="text-blue-400 mx-auto mb-2" />
              <p className="text-xs text-slate-400">
                Carte disponible après acceptation
              </p>
            </div>
          </div>
        </div>
      )}
      {/* Bouton toggle carte (mobile-first) */}
      <button
        onClick={() => setShowMap(!showMap)}
        className="w-full text-xs text-primary hover:text-[#ffae33] font-semibold py-2 flex items-center justify-center space-x-1 transition mb-2"
      >
        <MaterialIcon name="location_on" size="sm" />
        <span>{showMap ? 'Masquer la carte' : 'Voir sur la carte'}</span>
      </button>

      {/* Boutons d'action - Large et tactile */}
      {/* Boutons d'action - Large et tactile */}
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={onAccept}
          className="flex-1 bg-gradient-to-r from-green-500 to-green-600 text-white py-4 rounded-xl transition-transform active:scale-95 flex items-center justify-center space-x-2 touch-manipulation font-bold will-change-transform"
          style={{ minHeight: '56px' }}
        >
          <MaterialIcon name="check_circle" size="lg" />
          <span className="text-lg">Accepter</span>
        </button>
        <button
          onClick={onDecline}
          className="flex-1 bg-white/5 text-slate-300 hover:bg-white/10 py-4 rounded-xl transition-transform active:scale-95 flex items-center justify-center space-x-2 touch-manipulation font-bold will-change-transform"
          style={{ minHeight: '56px' }}
        >
          <MaterialIcon name="close" size="lg" />
          <span className="text-lg">Refuser</span>
        </button>
      </div>
    </div>
  );
}
