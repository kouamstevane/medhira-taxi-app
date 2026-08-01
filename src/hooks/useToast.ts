"use client";

import React, { useCallback } from 'react';
import { toast as globalToast } from 'react-hot-toast';
import { GlobalToast, Toast, ToastType } from '@/components/ui/Toast';

interface UseToastReturn {
  toasts: Toast[];
  showToast: (message: string, type?: ToastType, duration?: number) => void;
  showSuccess: (message: string, duration?: number) => void;
  showError: (message: string, duration?: number) => void;
  showWarning: (message: string, duration?: number) => void;
  showInfo: (message: string, duration?: number) => void;
  removeToast: (id: string) => void;
  clearAll: () => void;
}

export const useToast = (): UseToastReturn => {
  const removeToast = useCallback((id: string) => {
    globalToast.dismiss(id);
  }, []);

  const showToast = useCallback((message: string, type: ToastType = 'info', duration: number = 5000) => {
    const id = Math.random().toString(36).substring(2, 9);
    const newToast: Toast = { id, message, type, duration };

    globalToast.custom((toastInstance) => (
      React.createElement(GlobalToast, {
        toast: newToast,
        visible: toastInstance.visible,
        onDismiss: () => globalToast.dismiss(toastInstance.id),
      })
    ), { id, duration });
  }, []);

  const showSuccess = useCallback((message: string, duration?: number) => {
    showToast(message, 'success', duration);
  }, [showToast]);

  const showError = useCallback((message: string, duration?: number) => {
    showToast(message, 'error', duration);
  }, [showToast]);

  const showWarning = useCallback((message: string, duration?: number) => {
    showToast(message, 'warning', duration);
  }, [showToast]);

  const showInfo = useCallback((message: string, duration?: number) => {
    showToast(message, 'info', duration);
  }, [showToast]);

  const clearAll = useCallback(() => {
    globalToast.dismiss();
  }, []);

  return {
    toasts: [],
    showToast,
    showSuccess,
    showError,
    showWarning,
    showInfo,
    removeToast,
    clearAll,
  };
};

export default useToast;
