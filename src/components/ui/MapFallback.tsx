/**
 * Composant MapFallback
 * 
 * Affiche un message d'erreur clair quand Google Maps ne peut pas se charger
 */

'use client';

interface MapFallbackProps {
  error?: string;
  apiKey?: string;
}

export const MapFallback = ({ error, apiKey }: MapFallbackProps) => {
  return (
    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#0F0F0F] to-[#1A1A1A]">
      <div className="text-center p-8 max-w-lg bg-[#1A1A1A] border border-white/[0.06] rounded-2xl shadow-xl">
        <div className="mb-6">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-20 w-20 text-[#f29200] mx-auto mb-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
            />
          </svg>
        </div>
        
        <h2 className="text-2xl font-bold text-white mb-4">
          Carte non disponible
        </h2>
        
        {!apiKey ? (
          <div className="space-y-4">
            <p className="text-[#9CA3AF]">
              La clé API Google Maps n'est pas configurée.
            </p>
            <div className="bg-[#F59E0B]/10 border-l-4 border-[#F59E0B]/20 p-4 text-left rounded">
              <p className="font-semibold text-[#F59E0B] mb-2">Action requise :</p>
              <p className="text-sm text-[#F59E0B]">
                Ajoutez <code className="bg-[#F59E0B]/20 px-2 py-1 rounded">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> dans votre fichier <code className="bg-[#F59E0B]/20 px-2 py-1 rounded">.env.local</code>
              </p>
            </div>
          </div>
        ) : error?.includes('ApiProjectMapError') ? (
          <div className="space-y-4">
            <p className="text-[#9CA3AF]">
              Erreur de configuration de la clé API Google Maps.
            </p>
            <div className="bg-[#EF4444]/10 border-l-4 border-[#EF4444]/20 p-4 text-left rounded">
              <p className="font-semibold text-[#EF4444] mb-2">Vérifications nécessaires :</p>
              <ul className="text-sm text-[#EF4444] space-y-1 list-disc list-inside">
                <li>La clé API est valide dans Google Cloud Console</li>
                <li>Maps JavaScript API est activée</li>
                <li>Places API est activée</li>
                <li>Directions API est activée</li>
                <li>Les restrictions autorisent <code className="bg-[#EF4444]/20 px-1 rounded">localhost:3000</code></li>
                <li>Le billing est activé sur votre compte Google Cloud</li>
              </ul>
            </div>
            <a
              href="https://console.cloud.google.com/google/maps-apis"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-4 px-6 py-3 bg-[#f29200] hover:bg-[#e68600] text-white font-semibold rounded-lg transition"
            >
              Ouvrir Google Cloud Console
            </a>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-[#9CA3AF]">{error || 'Erreur de chargement de la carte'}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 bg-[#f29200] hover:bg-[#e68600] text-white font-semibold rounded-lg transition"
            >
              Recharger la page
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

