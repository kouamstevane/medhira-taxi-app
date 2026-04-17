'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { useVoipCall } from '@/hooks/useVoipCall';
import { MaterialIcon } from '@/components/ui/MaterialIcon';

export function ActiveCallOverlay() {
  const { callState, endCall, toggleMute, toggleSpeaker } = useVoipCall();
  const [displayTimer, setDisplayTimer] = useState('00:00');

  // Timer de durée d'appel
  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (callState.status === 'accepted' && callState.startTime) {
      interval = setInterval(() => {
        const seconds = Math.floor((Date.now() - (callState.startTime || 0)) / 1000);
        const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
        const secs = (seconds % 60).toString().padStart(2, '0');
        setDisplayTimer(`${mins}:${secs}`);
      }, 1000);
    } else {
      setDisplayTimer('00:00');
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [callState.status, callState.startTime]);

  // On affiche le overlay si on est en train d'appeler ou si l'appel est accepté
  const isVisible = ['calling', 'ringing', 'accepted'].includes(callState.status) && 
                    !(callState.status === 'ringing' && callState.direction === 'incoming');

  if (!isVisible) return null;

  const otherParticipant = callState.direction === 'outgoing' ? callState.callee : callState.caller;

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900 flex flex-col items-center justify-between py-16 animate-[slideUp_0.3s_ease-out]">
      {/* Header Info */}
      <div className="flex flex-col items-center gap-4 mt-8">
        <div className="relative">
          {otherParticipant?.avatar ? (
            <Image 
              src={otherParticipant.avatar} 
              alt={otherParticipant.name} 
              className="w-24 h-24 rounded-full border-2 border-slate-700 object-cover"
              width={96}
              height={96}
              unoptimized
            />
          ) : (
            <div className="w-24 h-24 rounded-full bg-slate-700 flex items-center justify-center text-3xl font-bold text-white">
              {otherParticipant?.name?.charAt(0) || '?'}
            </div>
          )}
          {callState.status === 'accepted' && (
            <div className="absolute -bottom-1 -right-1 bg-green-500 w-6 h-6 rounded-full border-4 border-slate-900 animate-pulse" />
          )}
        </div>

        <div className="text-center">
          <h3 className="text-2xl font-semibold text-white">{otherParticipant?.name || 'Utilisateur'}</h3>
          <p className="text-slate-400 text-sm mt-1">
            {callState.status === 'calling' && 'Appel en cours...'}
            {callState.status === 'ringing' && 'Sonnerie...'}
            {callState.status === 'accepted' && displayTimer}
          </p>
        </div>
      </div>

      {/* Controls Container */}
      <div className="flex flex-col items-center gap-12 mb-8 w-full px-12">
        <div className="flex justify-between w-full max-w-xs">
          {/* Mute Button */}
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={toggleMute}
              className={`w-16 h-16 rounded-full flex items-center justify-center transition-colors ${
                callState.isMuted ? 'bg-[#1A1A1A] text-white' : 'bg-slate-800 text-white'
              }`}
            >
              {callState.isMuted ? <MaterialIcon name="mic_off" className="text-[24px]" /> : <MaterialIcon name="mic" className="text-[24px]" />}
            </button>
            <span className="text-xs text-slate-400">Secret</span>
          </div>

          {/* Speaker Button */}
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={toggleSpeaker}
              className={`w-16 h-16 rounded-full flex items-center justify-center transition-colors ${
                callState.isSpeakerOn ? 'bg-[#1A1A1A] text-white' : 'bg-slate-800 text-white'
              }`}
            >
              {callState.isSpeakerOn ? <MaterialIcon name="volume_up" className="text-[24px]" /> : <MaterialIcon name="volume_off" className="text-[24px]" />}
            </button>
            <span className="text-xs text-slate-400">Haut-parleur</span>
          </div>
        </div>

        {/* End Call Button */}
        <button
          onClick={() => endCall()}
          className="w-20 h-20 rounded-full bg-red-500 flex items-center justify-center text-white shadow-xl active:scale-95 transition-transform"
        >
          <MaterialIcon name="call_end" className="text-[36px]" />
        </button>
      </div>

      <style jsx global>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
