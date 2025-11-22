/**
 * SearchingDriverBottomSheet
 * 
 * Bottom sheet moderne et mobile-first pour la recherche de chauffeur
 * Inclut : animation radar pulsing, timer, bouton annuler accessible
 */

'use client';

import { useEffect } from 'react';
import { FiX, FiClock } from 'react-icons/fi';

interface SearchingDriverBottomSheetProps {
  bookingId: string;
  pickupAddress: string;
  destinationAddress: string;
  timeRemaining: number;
  onCancel: () => void;
}

export function SearchingDriverBottomSheet({
  pickupAddress,
  destinationAddress,
  timeRemaining,
  onCancel,
}: SearchingDriverBottomSheetProps) {
  // Animation pulsing
  useEffect(() => {
    const interval = setInterval(() => {
      // Animation CSS gérée automatiquement
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  const progressPercent = ((60 - timeRemaining) / 60) * 100;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center sm:justify-center animate-fadeIn">
      {/* BottomSheet Container */}
      <div className="bg-white w-full sm:max-w-lg sm:mx-4 rounded-t-3xl sm:rounded-2xl shadow-2xl transform transition-all duration-300 ease-out animate-slideUp max-h-[85vh] overflow-y-auto">
        {/* Header avec bouton fermer */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-4 sm:px-6 py-4 flex items-center justify-between rounded-t-3xl sm:rounded-t-2xl">
          <h2 className="text-lg sm:text-xl font-bold text-gray-900">Recherche de chauffeur</h2>
          <button
            onClick={onCancel}
            className="p-2 hover:bg-gray-100 active:bg-gray-200 rounded-full transition touch-manipulation"
            style={{ minHeight: '44px', minWidth: '44px' }}
            aria-label="Annuler la recherche"
          >
            <FiX className="h-6 w-6 text-gray-600" />
          </button>
        </div>

        {/* Contenu principal */}
        <div className="px-4 sm:px-6 py-6 space-y-6">
          {/* Animation radar centrale */}
          <div className="relative flex items-center justify-center py-8">
            {/* Cercles pulsing */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div
                className="absolute w-32 h-32 sm:w-40 sm:h-40 rounded-full bg-[#f29200] opacity-20 animate-ping"
                style={{ animationDuration: '2s' }}
              ></div>
              <div
                className="absolute w-24 h-24 sm:w-32 sm:h-32 rounded-full bg-[#f29200] opacity-30 animate-ping"
                style={{ animationDuration: '1.5s', animationDelay: '0.5s' }}
              ></div>
              <div
                className="absolute w-16 h-16 sm:w-24 sm:h-24 rounded-full bg-[#f29200] opacity-40 animate-ping"
                style={{ animationDuration: '1s', animationDelay: '1s' }}
              ></div>
            </div>

            {/* Icône centrale */}
            <div className="relative z-10 w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-r from-[#f29200] to-[#e68600] rounded-full flex items-center justify-center shadow-lg">
              <svg
                className="w-8 h-8 sm:w-10 sm:h-10 text-white animate-bounce"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            </div>
          </div>

          {/* Texte de statut */}
          <div className="text-center space-y-2">
            <h3 className="text-xl sm:text-2xl font-bold text-gray-900">
              Recherche en cours...
            </h3>
            <p className="text-sm sm:text-base text-gray-600">
              Nous recherchons les chauffeurs proches de vous
            </p>
          </div>

          {/* Timer et barre de progression */}
          <div className="space-y-3">
            <div className="flex items-center justify-center space-x-2 text-gray-700">
              <FiClock className="h-5 w-5 text-[#f29200]" />
              <span className="text-base sm:text-lg font-semibold">
                {timeRemaining}s restantes
              </span>
            </div>
            
            {/* Barre de progression */}
            <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
              <div
                className="bg-gradient-to-r from-[#f29200] to-[#e68600] h-2 rounded-full transition-all duration-1000 ease-linear"
                style={{ width: `${progressPercent}%` }}
              ></div>
            </div>
          </div>

          {/* Informations de la course */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-3">
            <div className="flex items-start space-x-3">
              <div className="mt-0.5">
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Départ
                </p>
                <p className="text-sm sm:text-base text-gray-900 break-words leading-tight">
                  {pickupAddress}
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <div className="mt-0.5">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Destination
                </p>
                <p className="text-sm sm:text-base text-gray-900 break-words leading-tight">
                  {destinationAddress}
                </p>
              </div>
            </div>
          </div>

          {/* Bouton annuler accessible au pouce */}
          <button
            onClick={onCancel}
            className="w-full bg-gray-200 hover:bg-gray-300 active:bg-gray-400 text-gray-800 font-bold py-4 rounded-xl transition touch-manipulation flex items-center justify-center space-x-2 shadow-sm"
            style={{ minHeight: '56px' }}
          >
            <FiX className="h-5 w-5" />
            <span className="text-base sm:text-lg">Annuler la recherche</span>
          </button>

          {/* Conseils */}
          <div className="bg-blue-50 border-l-4 border-blue-500 p-3 rounded-r-lg">
            <p className="text-xs sm:text-sm text-blue-800">
              💡 <strong>Astuce :</strong> Nous élargissons automatiquement la zone de recherche pour trouver le meilleur chauffeur pour vous.
            </p>
          </div>
        </div>
      </div>

      {/* Styles pour les animations */}
      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes slideUp {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }

        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }

        .animate-slideUp {
          animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @media (min-width: 640px) {
          .animate-slideUp {
            animation: fadeIn 0.3s ease-out;
          }
        }
      `}</style>
    </div>
  );
}
