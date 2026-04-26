'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { useVoipCall } from '@/hooks/useVoipCall';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

export function IncomingCallOverlay() {
  const { callState, acceptCall, declineCall } = useVoipCall();
  const [vibrating, setVibrating] = useState(false);

  // Gérer la vibration et la sonnerie
  useEffect(() => {
    if (callState.status === 'ringing' && callState.direction === 'incoming') {
      const interval = setInterval(async () => {
        try {
          await Haptics.impact({ style: ImpactStyle.Heavy });
        } catch (e) {
          // Fallback simple si Capacitor n'est pas dispo
        }
      }, 1000);
      setVibrating(true);
      return () => {
        clearInterval(interval);
        setVibrating(false);
      };
    }
  }, [callState.status, callState.direction]);

  if (callState.status !== 'ringing' || callState.direction !== 'incoming') {
    return null;
  }

  const { caller } = callState;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-between py-16 bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 animate-fade-in">
      <div className="flex flex-col items-center gap-6 mt-12">
        <div className="relative">
          <div className="absolute inset-0 bg-blue-500 rounded-full animate-ping opacity-20"></div>
          {caller?.avatar ? (
            <Image 
              src={caller.avatar} 
              alt={caller.name} 
              className="w-32 h-32 rounded-full border-4 border-slate-700 object-cover shadow-2xl"
              width={128}
              height={128}
              unoptimized
            />
          ) : (
            <div className="w-32 h-32 rounded-full bg-slate-700 flex items-center justify-center text-5xl font-bold text-white shadow-2xl">
              {caller?.name?.charAt(0) || '?'}
            </div>
          )}
        </div>
        
        <div className="text-center">
          <h2 className="text-3xl font-bold text-white mb-2">{caller?.name || 'Inconnu'}</h2>
          <p className="text-blue-400 font-medium tracking-widest uppercase text-sm animate-pulse">
            Appel vocal entrant...
          </p>
        </div>
      </div>

      <div className="flex gap-16 mb-12">
        {/* Bouton Refuser */}
        <button
          onClick={declineCall}
          className="w-20 h-20 rounded-full bg-red-500 flex items-center justify-center text-white shadow-lg active:scale-95 transition-transform"
        >
          <MaterialIcon name="call_end" className="text-[36px]" />
        </button>

        {/* Bouton Accepter */}
        <button
          onClick={acceptCall}
          className="w-20 h-20 rounded-full bg-green-500 flex items-center justify-center text-white shadow-lg active:scale-95 transition-transform animate-bounce"
        >
          <MaterialIcon name="call" className="text-[36px]" />
        </button>
      </div>

    </div>
  );
}
