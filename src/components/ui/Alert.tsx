'use client';

/**
 * Composant Alert
 * 
 * Messages d'alerte pour les erreurs, succès, avertissements, etc.
 * 
 * @component
 */

import React, { useEffect, useState } from 'react';
import { useTranslation } from '@/hooks/useTranslation';

export type AlertType = 'error' | 'success' | 'warning' | 'info';

interface AlertProps {
  type: AlertType;
  message: string;
  onClose?: () => void;
  className?: string;
  autoDismiss?: boolean;
  duration?: number;
  closeLabel?: string;
}

/**
 * Composant d'alerte avec différents types, option de fermeture manuelle et disparition automatique
 */
export const Alert: React.FC<AlertProps> = ({
  type,
  message,
  onClose,
  className = '',
  autoDismiss = true,
  duration = 5000,
  closeLabel,
}) => {
  const { t } = useTranslation();
  const [isDismissing, setIsDismissing] = useState(false);
  const [isVisible, setIsVisible] = useState(true);

  // Reset visibility when message or type changes
  useEffect(() => {
    setIsVisible(true);
    setIsDismissing(false);
  }, [message, type]);

  useEffect(() => {
    if (!autoDismiss || !isVisible) return;

    const timer = setTimeout(() => {
      setIsDismissing(true);
      const closeTimer = setTimeout(() => {
        setIsVisible(false);
        onClose?.();
      }, 300);
      return () => clearTimeout(closeTimer);
    }, duration);

    return () => clearTimeout(timer);
  }, [autoDismiss, duration, onClose, isVisible, message, type]);

  const handleClose = () => {
    setIsDismissing(true);
    setTimeout(() => {
      setIsVisible(false);
      onClose?.();
    }, 200);
  };

  const typeStyles: Record<AlertType, { bg: string; border: string; text: string; icon: React.ReactElement }> = {
    error: {
      bg: 'bg-red-500/10',
      border: 'border-red-500/40',
      text: 'text-red-400',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 shrink-0" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
        </svg>
      ),
    },
    success: {
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/40',
      text: 'text-emerald-400',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 shrink-0" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
        </svg>
      ),
    },
    warning: {
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/40',
      text: 'text-amber-400',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 shrink-0" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
      ),
    },
    info: {
      bg: 'bg-blue-500/10',
      border: 'border-blue-500/40',
      text: 'text-blue-400',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 shrink-0" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
        </svg>
      ),
    },
  };

  const { bg, border, text, icon } = typeStyles[type];

  if (!isVisible) return null;

  return (
    <div
      role="alert"
      className={`${bg} border ${border} ${text} p-3.5 rounded-xl flex items-center justify-between transition-all duration-300 ${
        isDismissing ? 'opacity-0 -translate-y-1' : 'opacity-100 translate-y-0'
      } ${className}`}
    >
      <div className="flex items-center min-w-0">
        {icon}
        <span className="text-sm font-medium leading-snug">{message}</span>
      </div>
      <button
        type="button"
        onClick={handleClose}
        className="ml-3 shrink-0 p-1 rounded-lg text-current opacity-70 hover:opacity-100 hover:bg-white/10 transition-colors"
        aria-label={closeLabel || t('common.close')}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>
    </div>
  );
};
