// src/hooks/useConnectivityMonitor.ts
import { useState, useEffect } from 'react';
import { translate } from '@/locales';

function checkConnectivity(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

export function useConnectivityMonitor(
  showWarning: (message: string) => void
): boolean {
  const [isOnline, setIsOnline] = useState(checkConnectivity);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);

    const handleOffline = () => {
      setIsOnline(false);
      showWarning(translate('systemMessages.connectivity.lost'));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [showWarning]);

  return isOnline;
}

export { checkConnectivity };
