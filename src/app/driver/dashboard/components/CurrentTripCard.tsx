"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { FiMapPin, FiCheckCircle, FiPlay } from 'react-icons/fi';

interface Trip {
  id: string;
  passengerName: string;
  pickup: string;
  destination: string;
  price: number;
  status: 'pending' | 'accepted' | 'arrived' | 'in_progress' | 'completed' | 'cancelled';
  createdAt: any;
}

interface CurrentTripCardProps {
  trip: Trip;
  onMarkAsArrived: (tripId: string) => void;
  onStartTrip: (tripId: string) => void;
  onCompleteTrip: (tripId: string) => void;
}

export function CurrentTripCard({
  trip,
  onMarkAsArrived,
  onStartTrip,
  onCompleteTrip,
}: CurrentTripCardProps) {
  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'accepted':
        return 'Acceptée';
      case 'arrived':
        return 'Arrivé';
      case 'in_progress':
        return 'En cours';
      default:
        return status;
    }
  };

  return (
    <div className="lg:col-span-2">
      <div className="bg-white rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-lg">
        <h2 className="text-xl font-bold mb-4">Course en cours</h2>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="font-semibold text-gray-800">Client</p>
              <p className="text-sm text-gray-700 truncate">{trip.pickup}</p>
              <p className="text-sm text-gray-700">→ {trip.destination}</p>
            </div>
            <span className="bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-sm">
              {getStatusLabel(trip.status)}
            </span>
          </div>
          <div className="space-y-2 mb-4">
            <div className="flex items-center">
              <FiMapPin className="h-4 w-4 text-green-500 mr-3" />
              <span className="text-sm text-gray-700">{trip.pickup}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <FiMapPin className="h-4 w-4 text-red-500 mr-3" />
                <span className="text-sm text-gray-700">{trip.destination}</span>
              </div>
              <button
                onClick={() => {
                   // Ouvrir Google Maps ou Waze
                   const query = encodeURIComponent(trip.destination);
                   window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank');
                }}
                className="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center"
              >
                <span className="mr-1">Naviguer</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
              </button>
            </div>
          </div>
          <div className="flex justify-between">
            <span className="text-lg font-bold text-gray-800">{trip.price} FCFA</span>
            <div className="flex flex-col sm:flex-row gap-2 sm:space-x-2">
              {trip.status === 'accepted' && (
                <button
                  onClick={() => onMarkAsArrived(trip.id)}
                  className="bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white px-4 py-2 sm:px-3 sm:py-1 rounded text-sm flex items-center justify-center space-x-1 sm:space-x-2 transition touch-manipulation"
                  style={{ minHeight: '44px' }}
                >
                  <FiCheckCircle className="h-4 w-4" />
                  <span>Je suis arrivé</span>
                </button>
              )}
              {trip.status === 'arrived' && (
                <button
                  onClick={() => onStartTrip(trip.id)}
                  className="bg-green-500 hover:bg-green-600 active:bg-green-700 text-white px-4 py-2 sm:px-3 sm:py-1 rounded text-sm flex items-center justify-center space-x-1 sm:space-x-2 transition touch-manipulation"
                  style={{ minHeight: '44px' }}
                >
                  <FiPlay className="h-4 w-4" />
                  <span>Démarrer</span>
                </button>
              )}
              {trip.status === 'in_progress' && (
                <button
                  onClick={() => onCompleteTrip(trip.id)}
                  className="bg-red-500 hover:bg-red-600 active:bg-red-700 text-white px-4 py-2 sm:px-3 sm:py-1 rounded text-sm flex items-center justify-center space-x-1 sm:space-x-2 transition touch-manipulation"
                  style={{ minHeight: '44px' }}
                >
                  <FiCheckCircle className="h-4 w-4" />
                  <span>Terminer</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

