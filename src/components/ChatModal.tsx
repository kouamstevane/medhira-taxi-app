"use client";

import { useState, useEffect, useRef, useMemo } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { Message } from '@/types/chat';
import {
  ConversationContext,
  ConversationParticipant,
  buildConversationId,
  getRoleLabel,
} from '@/types/conversation';
import {
  subscribeToMessages,
  sendMessage,
  markMessagesAsRead,
  ensureConversation,
} from '@/services/chat.service';
import { useVoipCall } from '@/hooks/useVoipCall';
import { useAuth } from '@/hooks/useAuth';

/**
 * Nouvelle signature recommandée :
 *   <ChatModal context={...} currentUserUid={uid} onClose={...} />
 *
 * Signature legacy (rétrocompat) :
 *   <ChatModal bookingId={...} driverName={...} driverId={...} userType="client" onClose={...} />
 *   - construira automatiquement un context taxi en lisant le booking depuis Firestore
 */
interface ChatModalNewProps {
  context: ConversationContext;
  currentUserUid: string;
  onClose: () => void;
}

interface ChatModalLegacyProps {
  bookingId: string;
  driverName: string;
  driverId?: string;
  userType: 'client' | 'chauffeur';
  onClose: () => void;
}

type ChatModalProps =
  | (ChatModalNewProps & Partial<ChatModalLegacyProps>)
  | (ChatModalLegacyProps & Partial<ChatModalNewProps>);

export function ChatModal(props: ChatModalProps) {
  const { currentUser } = useAuth();
  const { startCall } = useVoipCall();

  // ----- Résolution du contexte (rétrocompat) -----
  const [resolvedContext, setResolvedContext] = useState<ConversationContext | null>(
    props.context ?? null
  );
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [resolutionError, setResolutionError] = useState<string | null>(null);

  // currentUserUid = nouveau prop, sinon fallback sur currentUser.uid
  const currentUserUid = props.currentUserUid ?? currentUser?.uid ?? null;

  // Si on est en mode legacy, on construit le context depuis le booking
  useEffect(() => {
    if (resolvedContext || !currentUserUid) return;

    const legacyBookingId = (props as ChatModalLegacyProps).bookingId;
    const legacyDriverName = (props as ChatModalLegacyProps).driverName;
    const legacyDriverId = (props as ChatModalLegacyProps).driverId;
    const legacyUserType = (props as ChatModalLegacyProps).userType;

    if (!legacyBookingId || !legacyUserType) return;

    console.warn(
      '[ChatModal] Legacy props (bookingId/userType) detected — please migrate to `context`+`currentUserUid`.'
    );

    (async () => {
      try {
        const bookingSnap = await getDoc(doc(db, 'bookings', legacyBookingId));
        if (!bookingSnap.exists()) {
          setResolutionError('Course introuvable');
          return;
        }
        const data = bookingSnap.data();
        const clientUid: string | undefined = data.userId;
        const driverUid: string | undefined = data.driverId || legacyDriverId;
        if (!clientUid || !driverUid) {
          setResolutionError('Participants incomplets pour cette course');
          return;
        }

        const clientParticipant: ConversationParticipant = {
          uid: clientUid,
          name: legacyUserType === 'client'
            ? (currentUser?.displayName || 'Client')
            : 'Client',
          role: 'client',
        };
        const driverParticipant: ConversationParticipant = {
          uid: driverUid,
          name: legacyDriverName || 'Chauffeur',
          role: 'chauffeur',
        };

        setResolvedContext({
          type: 'taxi',
          entityId: legacyBookingId,
          participantA: clientParticipant,
          participantB: driverParticipant,
        });
      } catch (err) {
        console.error('[ChatModal] legacy context resolution failed', err);
        setResolutionError('Impossible de charger la conversation');
      }
    })();
  }, [resolvedContext, currentUserUid, props, currentUser?.displayName]);

  // S'assurer que le doc conversation existe et récupérer son id
  useEffect(() => {
    if (!resolvedContext) return;
    let cancelled = false;
    (async () => {
      try {
        const id = await ensureConversation(resolvedContext);
        if (!cancelled) setConversationId(id);
      } catch (err) {
        console.error('[ChatModal] ensureConversation failed', err);
        if (!cancelled) {
          // Fallback : on calcule l'id même si la création a échoué (les rules pourront le refuser)
          setConversationId(
            buildConversationId(
              resolvedContext.type,
              resolvedContext.entityId,
              resolvedContext.participantA.uid,
              resolvedContext.participantB.uid
            )
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resolvedContext]);

  // ----- État interne -----
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [initiatingCall, setInitiatingCall] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Détermination du "moi" et de "l'autre"
  const { meParticipant, otherParticipant } = useMemo(() => {
    if (!resolvedContext || !currentUserUid) {
      return { meParticipant: null, otherParticipant: null };
    }
    const isA = resolvedContext.participantA.uid === currentUserUid;
    return {
      meParticipant: isA ? resolvedContext.participantA : resolvedContext.participantB,
      otherParticipant: isA ? resolvedContext.participantB : resolvedContext.participantA,
    };
  }, [resolvedContext, currentUserUid]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (!conversationId) return;
    const unsubscribe = subscribeToMessages(conversationId, (msgs) => {
      setMessages(msgs);
    });
    return () => unsubscribe();
  }, [conversationId]);

  useEffect(() => {
    if (conversationId && currentUserUid && messages.length > 0) {
      const hasUnread = messages.some((m) => m.senderId !== currentUserUid && !m.read);
      if (hasUnread) {
        markMessagesAsRead(conversationId, currentUserUid);
      }
    }
  }, [messages, conversationId, currentUserUid]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !meParticipant || !conversationId) return;
    setSending(true);
    try {
      await sendMessage(
        conversationId,
        meParticipant.uid,
        meParticipant.name,
        meParticipant.role,
        newMessage.trim()
      );
      setNewMessage('');
    } catch (error) {
      console.error('Erreur envoi message:', error);
      setToast({ message: "Erreur lors de l'envoi du message", type: 'error' });
      setTimeout(() => setToast(null), 3000);
    } finally {
      setSending(false);
    }
  };

  const handleCall = async () => {
    if (!meParticipant || !otherParticipant || !conversationId || initiatingCall) return;
    setInitiatingCall(true);
    try {
      await startCall(conversationId, meParticipant, otherParticipant);
      setToast({
        message: `📞 Appel initié ! ${otherParticipant.name} a été notifié.`,
        type: 'success',
      });
      setTimeout(() => setToast(null), 4000);
    } catch (error) {
      console.error('Erreur lors du lancement de l\'appel:', error);
      setToast({ message: "Impossible de lancer l'appel", type: 'error' });
      setTimeout(() => setToast(null), 4000);
    } finally {
      setInitiatingCall(false);
    }
  };

  const headerName = otherParticipant?.name
    || (otherParticipant ? getRoleLabel(otherParticipant.role) : 'Conversation');

  const headerSub = otherParticipant
    ? `Chat avec ${getRoleLabel(otherParticipant.role)}`
    : 'Conversation active';

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center sm:justify-center">
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[60] px-4 py-2 rounded-lg shadow-lg text-sm font-medium transition-all animate-[fadeIn_0.2s_ease-in] ${
          toast.type === 'error' ? 'bg-red-500 text-white' : 'bg-green-500 text-white'
        }`}>
          {toast.message}
        </div>
      )}
      <div className="glass-card w-full sm:max-w-md sm:mx-4 h-[90vh] sm:h-[600px] sm:rounded-2xl border border-white/10 flex flex-col">
        {/* Header */}
        <div className="relative overflow-hidden p-4 flex items-center justify-between sm:rounded-t-2xl border-b border-white/[0.06]">
          <div className="absolute -top-12 -right-12 w-40 h-40 bg-primary/20 blur-3xl rounded-full pointer-events-none" />
          <div className="relative flex items-center space-x-3">
            <div className="w-10 h-10 bg-primary/15 border border-primary/30 rounded-full flex items-center justify-center text-primary">
              👤
            </div>
            <div>
              <h3 className="font-bold text-white">{headerName}</h3>
              <p className="text-xs text-slate-400">{headerSub}</p>
            </div>
          </div>
          <div className="relative flex items-center space-x-2">
            <button
              onClick={handleCall}
              disabled={initiatingCall || !conversationId}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                initiatingCall || !conversationId
                  ? 'opacity-50 cursor-not-allowed bg-white/10 text-slate-400'
                  : 'bg-primary/15 border border-primary/30 hover:bg-primary/25 text-primary'
              }`}
              aria-label="Appeler"
            >
              {initiatingCall ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <MaterialIcon name="phone" size="md" />
              )}
            </button>
            <button
              onClick={props.onClose}
              className="p-2 glass-card border border-white/10 hover:bg-white/5 rounded-full transition text-slate-300"
            >
              <MaterialIcon name="close" size="md" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-background">
          {resolutionError && (
            <div className="text-center text-red-400 text-sm mt-8">{resolutionError}</div>
          )}
          {!resolutionError && messages.length === 0 && (
            <div className="text-center text-slate-500 mt-8">
              <p className="text-sm">Aucun message pour le moment</p>
              <p className="text-xs mt-2">Envoyez un message pour démarrer la conversation</p>
            </div>
          )}

          {messages.map((message) => {
            const isOwnMessage = message.senderId === currentUserUid;
            const isSystemMessage = message.type === 'system';
            const isCallMessage = message.type === 'voice_call';

            if (isSystemMessage) {
              return (
                <div key={message.id} className="flex justify-center">
                  <div className="bg-blue-500/10 text-blue-400 text-xs px-3 py-1 rounded-full">
                    {message.content}
                  </div>
                </div>
              );
            }

            if (isCallMessage) {
              return (
                <div key={message.id} className="flex justify-center">
                  <div className="bg-green-500/10 text-green-400 text-xs px-3 py-2 rounded-lg flex items-center space-x-2">
                    <MaterialIcon name="phone" size="sm" />
                    <span>{message.content}</span>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={message.id}
                className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[75%] px-4 py-2 rounded-2xl ${
                    isOwnMessage
                      ? 'bg-primary text-white'
                      : 'glass-card text-slate-200 border border-white/10'
                  }`}
                >
                  <p className="text-sm">{message.content}</p>
                  <p
                    className={`text-[10px] mt-1 ${
                      isOwnMessage ? 'text-white/70' : 'text-slate-500'
                    }`}
                  >
                    {message.createdAt?.toDate?.()?.toLocaleTimeString('fr-FR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    }) || 'Envoi...'}
                    {isOwnMessage && (
                      <span className="ml-1 inline-flex items-center">
                        {message.read ? (
                          <div className="flex -space-x-1">
                            <MaterialIcon name="done_all" className="text-blue-400 text-[12px]" />
                          </div>
                        ) : (
                          <MaterialIcon name="check" className="text-white text-[12px]" />
                        )}
                      </span>
                    )}
                  </p>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 bg-background border-t border-white/5 sm:rounded-b-2xl">
          <div className="flex items-center space-x-2">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !sending && handleSendMessage()}
              placeholder="Écrivez votre message..."
              className="glass-input flex-1 px-4 py-3 rounded-full text-white placeholder:text-slate-500 focus:ring-1 focus:ring-primary outline-none"
              disabled={sending || !conversationId}
            />
            <button
              onClick={handleSendMessage}
              disabled={!newMessage.trim() || sending || !conversationId}
              className="p-3 bg-primary hover:bg-primary/90 text-white rounded-full transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <MaterialIcon name="send" size="md" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
