"use client";

import { useState, useMemo } from 'react';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { ChatModal } from '@/components/ChatModal';
import { useVoipCall } from '@/hooks/useVoipCall';
import { ConversationContext, buildConversationId } from '@/types/conversation';
import { ensureConversation } from '@/services/chat.service';

export interface ConversationLauncherProps {
  context: ConversationContext;
  currentUserUid: string;
  variant?: 'icon-only' | 'icon-label' | 'fab';
  showCallButton?: boolean;
  showChatButton?: boolean;
  className?: string;
}

export function ConversationLauncher({
  context,
  currentUserUid,
  variant = 'icon-only',
  showCallButton = true,
  showChatButton = true,
  className = '',
}: ConversationLauncherProps) {
  const [chatOpen, setChatOpen] = useState(false);
  const [calling, setCalling] = useState(false);
  const { startCall } = useVoipCall();

  const { meParticipant, otherParticipant } = useMemo(() => {
    const isA = context.participantA.uid === currentUserUid;
    return {
      meParticipant: isA ? context.participantA : context.participantB,
      otherParticipant: isA ? context.participantB : context.participantA,
    };
  }, [context, currentUserUid]);

  const conversationId = useMemo(
    () =>
      buildConversationId(
        context.type,
        context.entityId,
        context.participantA.uid,
        context.participantB.uid
      ),
    [context]
  );

  const handleCall = async () => {
    if (calling) return;
    setCalling(true);
    try {
      // S'assure que le doc conversation existe avant l'appel (pour les rules / historique)
      await ensureConversation(context).catch(() => {});
      await startCall(conversationId, meParticipant, otherParticipant);
    } catch (err) {
      console.error('[ConversationLauncher] startCall failed', err);
    } finally {
      setCalling(false);
    }
  };

  const handleOpenChat = async () => {
    // Best-effort : créer le doc avant ouverture (pas bloquant)
    ensureConversation(context).catch(() => {});
    setChatOpen(true);
  };

  const baseBtn =
    variant === 'fab'
      ? 'w-14 h-14 rounded-full shadow-lg flex items-center justify-center'
      : 'w-10 h-10 rounded-full flex items-center justify-center';

  return (
    <>
      <div className={`flex items-center space-x-2 ${className}`}>
        {showChatButton && (
          <button
            type="button"
            onClick={handleOpenChat}
            className={`${baseBtn} bg-primary/15 border border-primary/30 hover:bg-primary/25 text-primary transition`}
            aria-label="Ouvrir la conversation"
          >
            <MaterialIcon name="chat" size="md" />
            {variant === 'icon-label' && (
              <span className="ml-2 text-sm">Message</span>
            )}
          </button>
        )}
        {showCallButton && (
          <button
            type="button"
            onClick={handleCall}
            disabled={calling}
            className={`${baseBtn} ${
              calling
                ? 'opacity-50 cursor-not-allowed bg-white/10 text-slate-400'
                : 'bg-primary/15 border border-primary/30 hover:bg-primary/25 text-primary'
            } transition`}
            aria-label="Appeler"
          >
            {calling ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <MaterialIcon name="phone" size="md" />
            )}
            {variant === 'icon-label' && !calling && (
              <span className="ml-2 text-sm">Appeler</span>
            )}
          </button>
        )}
      </div>

      {chatOpen && (
        <ChatModal
          context={context}
          currentUserUid={currentUserUid}
          onClose={() => setChatOpen(false)}
        />
      )}
    </>
  );
}
