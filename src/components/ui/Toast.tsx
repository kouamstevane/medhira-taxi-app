"use client";

import React, { useEffect, useState } from 'react';
import { CheckCircle, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/MaterialIcon';

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

const ToastItem: React.FC<ToastProps> = ({ toast, onRemove }) => {
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
    const exitStyles = isExiting ? "opacity-0 translate-x-full" : "opacity-100 translate-x-0";
    
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
        aria-label="Fermer"
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
