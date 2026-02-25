"use client";

import { useState, useEffect, useRef } from 'react';
import { FiSend, FiX, FiPhone, FiCheck } from 'react-icons/fi';
import { Message } from '@/types/chat';
import { subscribeToMessages, sendMessage, markMessagesAsRead, sendSystemMessage } from '@/services/chat.service';
import { useVoipCall } from '@/hooks/useVoipCall';
import { useAuth } from '@/hooks/useAuth';

interface ChatModalProps {
  bookingId: string;
  driverName: string;
  driverId?: string; // Optionnel car non utilisé actuellement
  userType: 'client' | 'chauffeur';
  onClose: () => void;
}

export function ChatModal({ bookingId, driverName, driverId, userType, onClose }: ChatModalProps) {
  const { currentUser } = useAuth();
  const { startCall, callState } = useVoipCall();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [initiatingCall, setInitiatingCall] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (!bookingId) return;

    const unsubscribe = subscribeToMessages(bookingId, (msgs) => {
      setMessages(msgs);
    });

    return () => unsubscribe();
  }, [bookingId]);

  // Marquer les messages comme lus quand ils arrivent et que le modal est ouvert
  useEffect(() => {
    if (currentUser && messages.length > 0) {
      const hasUnread = messages.some(m => m.senderId !== currentUser.uid && !m.read);
      if (hasUnread) {
        markMessagesAsRead(bookingId, currentUser.uid, userType);
      }
    }
  }, [messages, bookingId, currentUser, userType]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !currentUser) return;

    setSending(true);
    try {
      await sendMessage(
        bookingId,
        currentUser.uid,
        currentUser.displayName || 'Utilisateur',
        userType,
        newMessage.trim()
      );
      setNewMessage('');
    } catch (error) {
      console.error('Erreur envoi message:', error);
      setToast({ message: '❌ Erreur lors de l\'envoi du message', type: 'error' });
      setTimeout(() => setToast(null), 3000);
    } finally {
      setSending(false);
    }
  };

  const handleCall = async () => {
    if (!driverId || !currentUser || initiatingCall) return;

    setInitiatingCall(true);
    try {
      await startCall(
        bookingId,
        {
          uid: currentUser.uid,
          name: currentUser.displayName || 'Moi',
          role: userType
        },
        {
          uid: driverId,
          name: driverName,
          role: userType === 'client' ? 'chauffeur' : 'client'
        }
      );
      setToast({ message: '📞 Appel initié ! Le ' + (userType === 'client' ? 'chauffeur' : 'client') + ' a été notifié.', type: 'success' });
      setTimeout(() => setToast(null), 4000);
    } catch (error) {
      console.error('Erreur lors du lancement de l\'appel:', error);
      setToast({ message: '❌ Impossible de lancer l\'appel', type: 'error' });
      setTimeout(() => setToast(null), 4000);
    } finally {
      setInitiatingCall(false);
    }
  };

  const getOtherPartyName = () => {
    return userType === 'client' ? driverName : 'Client';
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center sm:justify-center">
      {/* Toast notification */}
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[60] px-4 py-2 rounded-lg shadow-lg text-sm font-medium transition-all animate-[fadeIn_0.2s_ease-in] ${
          toast.type === 'error' ? 'bg-red-500 text-white' : 'bg-green-500 text-white'
        }`}>
          {toast.message}
        </div>
      )}
      <div className="bg-white w-full sm:max-w-md sm:mx-4 h-[90vh] sm:h-[600px] sm:rounded-2xl shadow-2xl flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#f29200] to-[#e68600] text-white p-4 flex items-center justify-between sm:rounded-t-2xl">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              👤
            </div>
            <div>
              <h3 className="font-bold">{getOtherPartyName()}</h3>
              <p className="text-xs text-white/80">Conversation active</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={handleCall}
              disabled={initiatingCall}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                initiatingCall ? 'opacity-50 cursor-not-allowed bg-gray-400' : 'bg-[#f29200] hover:bg-[#e68600] text-white'
              }`}
              aria-label="Appeler"
            >
              {initiatingCall ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <FiPhone className="text-lg" />
              )}
            </button>
            <button
              onClick={onClose}
              className="p-2 bg-white/20 hover:bg-white/30 rounded-full transition"
            >
              <FiX className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
          {messages.length === 0 && (
            <div className="text-center text-gray-500 mt-8">
              <p className="text-sm">Aucun message pour le moment</p>
              <p className="text-xs mt-2">Envoyez un message pour démarrer la conversation</p>
            </div>
          )}
          
          {messages.map((message) => {
            const isOwnMessage = message.senderId === currentUser?.uid;
            const isSystemMessage = message.type === 'system';
            const isCallMessage = message.type === 'voice_call';

            if (isSystemMessage) {
              return (
                <div key={message.id} className="flex justify-center">
                  <div className="bg-blue-100 text-blue-800 text-xs px-3 py-1 rounded-full">
                    {message.content}
                  </div>
                </div>
              );
            }

            if (isCallMessage) {
              return (
                <div key={message.id} className="flex justify-center">
                  <div className="bg-green-100 text-green-800 text-xs px-3 py-2 rounded-lg flex items-center space-x-2">
                    <FiPhone className="w-4 h-4" />
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
                      ? 'bg-[#f29200] text-white'
                      : 'bg-white text-gray-900 border border-gray-200'
                  }`}
                >
                  <p className="text-sm">{message.content}</p>
                  <p
                    className={`text-[10px] mt-1 ${
                      isOwnMessage ? 'text-white/70' : 'text-gray-400'
                    }`}
                  >
                    {message.createdAt?.toDate?.()?.toLocaleTimeString('fr-FR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    }) || 'Envoi...'}
                    {isOwnMessage && (
                      <span className="ml-1 inline-flex items-center">
                        {message.read ? (
                          // Double coche bleue pour Lu (plus visible sur fond orange)
                          <div className="flex -space-x-1">
                             <FiCheck className="w-3 h-3 text-blue-600 font-bold" title="Lu" strokeWidth={3} />
                             <FiCheck className="w-3 h-3 text-blue-600 font-bold" title="Lu" strokeWidth={3} />
                          </div>
                        ) : (
                          // Coche simple blanche pour Envoyé
                          <FiCheck className="w-3 h-3 text-white" title="Envoyé" strokeWidth={2} />
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
        <div className="p-4 bg-white border-t border-gray-200 sm:rounded-b-2xl">
          <div className="flex items-center space-x-2">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !sending && handleSendMessage()}
              placeholder="Écrivez votre message..."
              className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-[#f29200] focus:border-[#f29200] bg-gray-50 text-gray-900 placeholder-gray-500 shadow-sm"
              disabled={sending}
            />
            <button
              onClick={handleSendMessage}
              disabled={!newMessage.trim() || sending}
              className="p-3 bg-[#f29200] hover:bg-[#e68600] text-white rounded-full transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FiSend className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
