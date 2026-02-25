'use client';

import React, { createContext, useContext, useEffect, ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { voipService } from '@/services/voip.service';
import { useVoipCall } from '@/hooks/useVoipCall';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  limit 
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { CallStatus, CallParticipant } from '@/types/voip';
import { pushNotifications } from '@/services/pushNotifications.service';
import { IncomingCallOverlay } from '@/components/IncomingCallOverlay';
import { ActiveCallOverlay } from '@/components/ActiveCallOverlay';

interface VoipContextType {
  // On peut ajouter des getters ou setters si nécessaire
}

const VoipContext = createContext<VoipContextType | null>(null);

export function VoipCallProvider({ children }: { children: ReactNode }) {
  const { currentUser } = useAuth();
  const { callState } = useVoipCall();

  // 1. Écouter les appels entrants via Firestore
  useEffect(() => {
    if (!currentUser) return;

    // On écoute les appels destinés à l'utilisateur actuel qui sont en train de sonner
    const q = query(
      collection(db, 'calls'),
      where('calleeId', '==', currentUser.uid),
      where('status', '==', 'ringing'),
      limit(1)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      // Double-check pattern to prevent race conditions
      const currentState = voipService.getState();
      
      if (!snapshot.empty && currentState.status === 'idle') {
        const doc = snapshot.docs[0];
        const data = doc.data();
        
        const caller: CallParticipant = {
          uid: data.callerMetadata?.uid || data.callerId,
          name: data.callerMetadata?.name || 'Utilisateur',
          avatar: data.callerMetadata?.avatar,
          role: data.callerMetadata?.role || 'client'
        };

        // Set status immediately to prevent duplicate handling
        voipService.handleIncomingCall(
          doc.id,
          data.rideId,
          data.channel,
          data.token,
          caller
        );
      }
    });

    return () => unsubscribe();
  }, [currentUser]);

  // 2. Écouter les notifications push Capacitor (facultatif si Firestore est rapide, mais utile pour le background)
  useEffect(() => {
    if (!currentUser) return;

    const removeListener = pushNotifications.addListener((notification) => {
      const data = notification.notification.data;
      if (data?.type === 'incoming_call' && voipService.getState().status === 'idle') {
        // La notification donne déjà des infos mais on préfère passer par handleIncomingCall 
        // qui va ensuite s'abonner au doc Firestore pour être sûr des données
        const caller: CallParticipant = {
          uid: data.callerId || '', // Si on n'a pas tout dans la notification, handleIncomingCall complètera via Firestore
          name: data.callerName || 'Appel entrant',
          avatar: data.callerAvatar,
          role: data.callerRole || 'client'
        };

        voipService.handleIncomingCall(
          data.callId,
          data.rideId,
          '', // channel (sera récupéré par le snapshot)
          '', // token (sera récupéré par le snapshot)
          caller
        );
      }
    });

    return () => removeListener();
  }, [currentUser]);

  return (
    <VoipContext.Provider value={{}}>
      {children}
      <IncomingCallOverlay />
      <ActiveCallOverlay />
    </VoipContext.Provider>
  );
}

export const useVoip = () => {
  const context = useContext(VoipContext);
  if (!context) {
    throw new Error('useVoip must be used within a VoipCallProvider');
  }
  return context;
};
