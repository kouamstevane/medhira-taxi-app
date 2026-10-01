"use client";

import React, { useEffect, useState } from 'react';
import { CheckCircle, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

interface ToastProps {
  toast: Toast;
  onRemove: (id: string) => void;
}

interface GlobalToastProps {
  toast: Toast;
  visible: boolean;
  onDismiss: () => void;
}

export const GlobalToast: React.FC<GlobalToastProps> = ({ toast, visible, onDismiss }) => {
  const { t } = useTranslation();
  const icons = {
    success: <CheckCircle className="h-5 w-5 text-emerald-400" />,
    error: <AlertCircle className="h-5 w-5 text-rose-400" />,
    warning: <AlertTriangle className="h-5 w-5 text-amber-400" />,
    info: <Info className="h-5 w-5 text-blue-400" />,
  };

  const badgeBgs = {
    success: 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400',
    error: 'bg-rose-500/20 border-rose-500/30 text-rose-400',
    warning: 'bg-amber-500/20 border-amber-500/30 text-amber-400',
    info: 'bg-blue-500/20 border-blue-500/30 text-blue-400',
  };

  const cardStyles = {
    success: 'bg-[#0d1f18] border-emerald-500/50 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.8),0_0_25px_rgba(16,185,129,0.2)]',
    error: 'bg-[#230f13] border-rose-500/50 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.8),0_0_25px_rgba(239,68,68,0.2)]',
    warning: 'bg-[#261e12] border-amber-500/50 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.8),0_0_25px_rgba(245,158,11,0.2)]',
    info: 'bg-[#121c2a] border-blue-500/50 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.8),0_0_25px_rgba(59,130,246,0.2)]',
  };

  return (
    <div
      role="status"
      className={`flex w-[min(92vw,440px)] items-center gap-3.5 rounded-2xl border p-4 text-white backdrop-blur-xl ${cardStyles[toast.type]} ${visible ? 'medjira-toast-enter' : 'medjira-toast-exit'}`}
    >
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${badgeBgs[toast.type]}`}>
        {icons[toast.type]}
      </div>
      <p className="min-w-0 flex-1 text-sm font-semibold leading-5 text-white">{toast.message}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="-m-1 shrink-0 rounded-xl p-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-white min-h-[44px] min-w-[44px] flex items-center justify-center"
        aria-label={t('common.closeNotification')}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};

const ToastItem: React.FC<ToastProps> = ({ toast, onRemove }) => {
  const { t } = useTranslation();
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsExiting(true);
      setTimeout(() => onRemove(toast.id), 300);
    }, toast.duration || 5000);

    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, onRemove]);

  const getIcon = () => {
    switch (toast.type) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-[#10B981]" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-[#EF4444]" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-[#F59E0B]" />;
      case 'info':
      default:
        return <Info className="w-5 h-5 text-[#3B82F6]" />;
    }
  };

  const getStyles = () => {
    const baseStyles = "transform transition-all duration-300 ease-in-out";
    const exitStyles = isExiting ? "opacity-0 -translate-x-full" : "opacity-100 translate-x-0";
    
    const typeStyles = {
      success: "border-l-4 border-[#10B981] bg-[#10B981]/10",
      error: "border-l-4 border-[#EF4444] bg-[#EF4444]/10",
      warning: "border-l-4 border-[#F59E0B] bg-[#F59E0B]/10",
      info: "border-l-4 border-[#3B82F6] bg-[#3B82F6]/10",
    };

    return `${baseStyles} ${exitStyles} ${typeStyles[toast.type]}`;
  };

  return (
    <div className={`${getStyles()} rounded-lg shadow-lg p-4 mb-3 flex items-start gap-3 min-w-[300px] max-w-md`}>
      <div className="flex-shrink-0 mt-0.5">
        {getIcon()}
      </div>
      <div className="flex-grow">
        <p className="text-sm font-medium text-white">{toast.message}</p>
      </div>
      <button
        onClick={() => {
          setIsExiting(true);
          setTimeout(() => onRemove(toast.id), 300);
        }}
        className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
        aria-label={t('common.close')}
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

interface ToastContainerProps {
  toasts: Toast[];
  onRemove: (id: string) => void;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center' | 'bottom-center';
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ 
  toasts, 
  onRemove,
  position = 'top-right' 
}) => {
  const getPositionStyles = () => {
    const positions = {
      'top-right': 'top-4 right-4',
      'top-left': 'top-4 left-4',
      'bottom-right': 'bottom-4 right-4',
      'bottom-left': 'bottom-4 left-4',
      'top-center': 'top-4 left-1/2 transform -translate-x-1/2',
      'bottom-center': 'bottom-4 left-1/2 transform -translate-x-1/2',
    };
    return positions[position];
  };

  if (toasts.length === 0) return null;

  return (
    <div className={`fixed z-50 ${getPositionStyles()} flex flex-col items-${position.includes('right') ? 'end' : position.includes('left') ? 'start' : 'center'}`}>
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>
  );
};

export default ToastContainer;
